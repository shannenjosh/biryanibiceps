
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* =========================================
   BIRYANI & BICEPS 2.0
   PERSONAL FITNESS DASHBOARD
========================================= */

const url = window.BB_SUPABASE_URL;
const key = window.BB_SUPABASE_ANON_KEY;

const ready = url && key &&
  !url.startsWith("YOUR_") &&
  !key.startsWith("YOUR_");

const db = ready ? createClient(url, key) : null;

const $ = id => document.getElementById(id);
const root = $("viewRoot");
const toast = $("toast");

let user = null,
    profile = {},
    fitness = {},
    current = "overview",
    workouts = [],
    bookings = [],
    classes = [],
    payments = [],
    notices = [],
    measurements = [];
let selectedClass = null;
let wellness = [];
let savedPlans = [];
let nutrition = [];

const today = () => new Date().toLocaleDateString("en-CA");

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[char]));

const money = value =>
  "₹" + Number(value || 0).toLocaleString("en-IN");

function ping(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function dateText(value) {
  if (!value) return "";
  return new Date(value + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

async function get(table, select = "*") {
  const { data, error } = await db
    .from(table)
    .select(select)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return data || [];
}

async function insert(table, row) {
  const { error } = await db.from(table).insert({
    ...row,
    user_id: user.id
  });

  if (error) throw error;
}

async function load() {
  const results = await Promise.all([
    get("workouts"),
    get("bookings", "*,classes(name,trainer,starts_at)"),
    get("classes"),
    get("payments"),
    get("notifications"),
    get("progress"),
    get("wellness_logs"),
    get("workout_plans"),
    get("nutrition_targets")
  ]);

  [
    workouts,
    bookings,
    classes,
    payments,
    notices,
    measurements,
    wellness,
    savedPlans,
    nutrition
  ] = results;

  const { data, error } = await db
    .from("fitness_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  fitness = data || {};
}

/* =========================================
   REUSABLE UI
========================================= */

function empty(message) {
  return `<div class="empty">${esc(message)}</div>`;
}

function panel(title, content, subtitle = "") {
  return `
    <section class="panel">
      <h3>${title}</h3>
      ${subtitle ? `<p class="panel-sub">${subtitle}</p>` : ""}
      ${content}
    </section>
  `;
}

function stat(label, value, note) {
  return `
    <div class="stat-card">
      <small>${label}</small>
      <strong>${value}</strong>
      <span>${note}</span>
    </div>
  `;
}

function pageHead(title, description) {
  return `
    <div class="module-head">
      <div>
        <h2>${title}</h2>
        <p>${description}</p>
      </div>
    </div>
  `;
}

function rows(items, callback) {
  return items.length
    ? items.map(callback).join("")
    : empty("Nothing here yet. Add your first entry.");
}

/* =========================================
   FITNESS CALCULATIONS
========================================= */

function calculateFitness(data) {
  const weight = Number(data.current_weight_kg);
  const height = Number(data.height_cm);
  const age = Number(data.age);

  if (!weight || !height || !age || weight <= 0 || height <= 0) {
    return null;
  }

  const bmi = weight / ((height / 100) ** 2);

  /*
    Mifflin-St Jeor equation.
    If sex is not provided, use a midpoint estimate.
    These are estimates, not medical measurements.
  */

  let bmr;

  if (data.sex === "male") {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else if (data.sex === "female") {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 78;
  }

  const activityFactors = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9
  };

  const maintenance = Math.round(
    bmr * (activityFactors[data.activity_level] || 1.55)
  );

  let calories = maintenance;

  if (data.goal === "fat_loss") {
    calories = Math.round(maintenance * 0.90);
  } else if (data.goal === "muscle_gain") {
    calories = Math.round(maintenance * 1.05);
  } else if (data.goal === "recomposition") {
    calories = maintenance;
  }

  const protein = Math.round(weight * (
    data.goal === "muscle_gain" || data.goal === "strength"
      ? 1.8
      : 1.6
  ));

  const fat = Math.round((calories * 0.27) / 9);
  const carbs = Math.max(
    0,
    Math.round((calories - protein * 4 - fat * 9) / 4)
  );

  return {
    bmi: bmi.toFixed(1),
    bmr,
    maintenance,
    calories,
    protein,
    carbs,
    fat
  };
}

function bmiLabel(bmi) {
  if (bmi < 18.5) return "Below standard screening range";
  if (bmi < 25) return "Within standard screening range";
  if (bmi < 30) return "Above standard screening range";
  return "Higher screening range";
}

function goalLabel(goal) {
  const labels = {
    fat_loss: "Fat loss",
    muscle_gain: "Muscle gain",
    hypertrophy: "Muscle hypertrophy",
    strength: "Strength & power",
    recomposition: "Body recomposition",
    endurance: "Cardiovascular endurance",
    general_fitness: "General fitness",
    flexibility: "Mobility & flexibility",
    sports: "Sports performance",
    maintenance: "Weight maintenance",
    custom: "Custom goal"
  };

  return labels[goal] || "General fitness";
}

/* =========================================
   WORKOUT GENERATOR
========================================= */

const exerciseLibrary = {
  push: [
    ["Push-ups", 3, 10],
    ["Dumbbell bench press", 3, 10],
    ["Shoulder press", 3, 10],
    ["Lateral raises", 2, 12],
    ["Triceps extensions", 2, 12]
  ],

  pull: [
    ["Lat pulldown", 3, 10],
    ["Seated cable row", 3, 10],
    ["Dumbbell rows", 3, 10],
    ["Bicep curls", 2, 12],
    ["Face pulls", 2, 12]
  ],

  legs: [
    ["Bodyweight squats", 3, 12],
    ["Leg press", 3, 10],
    ["Romanian deadlift", 3, 10],
    ["Leg curls", 2, 12],
    ["Calf raises", 2, 15]
  ],

  full: [
    ["Squats", 3, 10],
    ["Push-ups", 3, 10],
    ["Dumbbell rows", 3, 10],
    ["Hip hinges", 2, 12],
    ["Plank", 3, 30]
  ]
};

function generateWorkout(data) {
  const days = Number(data.training_days) || 4;
  const experience = data.experience || "beginner";

  let schedule;

  if (days <= 2) {
    schedule = [
      { name: "Full Body A", group: "full" },
      { name: "Full Body B", group: "full" }
    ];
  } else if (days === 3) {
    schedule = [
      { name: "Full Body A", group: "full" },
      { name: "Full Body B", group: "full" },
      { name: "Full Body C", group: "full" }
    ];
  } else if (days === 4) {
    schedule = [
      { name: "Upper Body A", group: "push" },
      { name: "Lower Body A", group: "legs" },
      { name: "Upper Body B", group: "pull" },
      { name: "Lower Body B", group: "legs" }
    ];
  } else if (days === 5) {
    schedule = [
      { name: "Push", group: "push" },
      { name: "Pull", group: "pull" },
      { name: "Legs", group: "legs" },
      { name: "Upper Body", group: "full" },
      { name: "Conditioning", group: "full" }
    ];
  } else {
    schedule = [
      { name: "Push", group: "push" },
      { name: "Pull", group: "pull" },
      { name: "Legs", group: "legs" },
      { name: "Upper Body", group: "full" },
      { name: "Lower Body", group: "legs" },
      { name: "Conditioning", group: "full" },
      { name: "Recovery", group: "full", recovery: true }
    ];
  }

  return schedule.map((day, index) => {
    const exercises = day.recovery
      ? []
      : exerciseLibrary[day.group].map(item => ({
          name: item[0],
          sets: experience === "beginner" ? Math.min(item[1], 3) : item[1],
          reps: item[2],
          rest_seconds: 90
        }));

    return {
      day: index + 1,
      name: day.name,
      recovery: Boolean(day.recovery),
      exercises
    };
  });
}

/* =========================================
   NAVIGATION
========================================= */

const titles = {
  overview: "Good things take reps.",
  fitness: "Your fitness profile.",
  workouts: "Train with a plan.",
  nutrition: "Eat well. Recover well.",
  wellness: "Look after yourself.",
  membership: "Membership.",
  classes: "Class booking.",
  payments: "Payment & billing.",
  notifications: "Your updates.",
  analytics: "Your progress."
};

function render() {
  $("pageTitle").textContent = titles[current] || "Biryani & Biceps";

  document.querySelectorAll(".side-link").forEach(button => {
    button.classList.toggle("active", button.dataset.view === current);
  });

  const name =
    profile.full_name ||
    user.user_metadata?.full_name ||
    user.email.split("@")[0];

  $("userName").textContent = name;
  $("avatar").textContent = name.charAt(0).toUpperCase();

  const views = {
    overview,
    fitness: fitnessPage,
    workouts: workoutPage,
    nutrition: nutritionPage,
    wellness: wellnessPage,
    membership: membershipPage,
    classes: classPage,
    payments: paymentPage,
    notifications: notificationPage,
    analytics: analyticsPage
  };

  root.innerHTML = (views[current] || overview)();
  bind();
}

/* =========================================
   OVERVIEW
========================================= */

function overview() {
  const calculation = calculateFitness(fitness);
  const latestWeight = measurements[0]?.weight_kg ||
    fitness.current_weight_kg;

  const completedToday = workouts.filter(
    item => item.workout_date === today()
  ).length;

  return `
    <div class="welcome-banner">
      <div>
        <h2>Hey ${esc((profile.full_name || "champ").split(" ")[0])}.</h2>
        <p>Small wins. Strong habits. Better progress.</p>
      </div>
      <div class="banner-mark">B&B ✳</div>
    </div>

    <div class="stat-grid">
      ${stat("CURRENT WEIGHT", latestWeight ? latestWeight + " kg" : "--", "Latest recorded weight")}
      ${stat("TARGET WEIGHT", fitness.target_weight_kg ? fitness.target_weight_kg + " kg" : "--", "Your fitness goal")}
      ${stat("WORKOUT LOGS", workouts.length, "Recorded exercises")}
      ${stat("TODAY'S LOGS", completedToday, "Exercises logged today")}
    </div>

    ${!fitness.height_cm ? `
      <div class="notice">
        Your fitness profile is incomplete.
        Add your height, weight and goals to unlock personalised recommendations.
        <button class="mini-btn" data-go="fitness">Complete profile ↗</button>
      </div>
    ` : ""}

    ${calculation ? `
      <div class="content-grid">
        ${panel("Your estimated daily targets", `
          <div class="list-row">
            Estimated maintenance
            <b>${calculation.maintenance} kcal</b>
          </div>
          <div class="list-row">
            Suggested calorie estimate
            <b>${calculation.calories} kcal</b>
          </div>
          <div class="list-row">
            Protein estimate
            <b>${calculation.protein} g</b>
          </div>
          <div class="list-row">
            BMI screening value
            <b>${calculation.bmi}</b>
          </div>
          <p class="panel-sub">These are estimates, not medical prescriptions.</p>
        `)}
        ${panel("Your current goal", `
          <h2>${goalLabel(fitness.goal)}</h2>
          <p class="panel-sub">
            ${esc(fitness.experience || "Beginner")} ·
            ${fitness.training_days || 4} training days per week
          </p>
          <button class="mini-btn" data-go="workouts">View workout plan ↗</button>
        `)}
      </div>
    ` : ""}

    <div class="content-grid">
      ${panel("Recent workouts", rows(workouts.slice(0, 5), item => `
        <div class="list-row">
          <span>
            <b>${esc(item.exercise)}</b>
            <small>${dateText(item.workout_date)}</small>
          </span>
          <span class="pill">${item.sets} × ${item.reps}</span>
        </div>
      `))}
      ${panel("Upcoming classes", rows(bookings.slice(0, 5), item => `
        <div class="list-row">
          <span>
            <b>${esc(item.classes?.name || "Class booking")}</b>
            <small>${esc(item.classes?.starts_at || "")}</small>
          </span>
          <span class="pill green">BOOKED</span>
        </div>
      `))}
    </div>
  `;
}

/* =========================================
   FITNESS PROFILE
========================================= */

function fitnessPage() {
  return `
    ${pageHead(
      "Build your fitness profile",
      "Tell us about yourself. We'll use this to personalise your recommendations."
    )}

    <section class="panel">
      <form id="fitnessForm" class="form-stack">

        <h3>01 / Basic information</h3>

        <label>
          Age
          <input id="fitAge" type="number" min="16" max="100"
            value="${esc(fitness.age || "")}" required>
        </label>

        <label>
          Sex for metabolic equation (optional)
          <select id="fitSex">
            <option value="prefer_not_to_say">Prefer not to say</option>
            <option value="male" ${fitness.sex === "male" ? "selected" : ""}>Male</option>
            <option value="female" ${fitness.sex === "female" ? "selected" : ""}>Female</option>
          </select>
        </label>

        <label>
          Height (cm)
          <input id="fitHeight" type="number" min="100" max="250"
            step="0.1" value="${esc(fitness.height_cm || "")}" required>
        </label>

        <label>
          Current weight (kg)
          <input id="fitWeight" type="number" min="25" max="350"
            step="0.1" value="${esc(fitness.current_weight_kg || "")}" required>
        </label>

        <label>
          Target weight (kg)
          <input id="fitTarget" type="number" min="25" max="350"
            step="0.1" value="${esc(fitness.target_weight_kg || "")}">
        </label>

        <h3>02 / Your fitness goal</h3>

        <label>
          Primary goal
          <select id="fitGoal">
            ${[
              ["fat_loss", "Fat loss"],
              ["muscle_gain", "Lean muscle gain"],
              ["hypertrophy", "Muscle hypertrophy"],
              ["strength", "Strength and power"],
              ["recomposition", "Body recomposition"],
              ["endurance", "Cardiovascular endurance"],
              ["general_fitness", "General fitness"],
              ["flexibility", "Mobility and flexibility"],
              ["sports", "Sports performance"],
              ["maintenance", "Weight maintenance"],
              ["custom", "Custom goal"]
            ].map(([value, label]) => `
              <option value="${value}" ${fitness.goal === value ? "selected" : ""}>
                ${label}
              </option>
            `).join("")}
          </select>
        </label>

        <label>
          Daily activity level
          <select id="fitActivity">
            <option value="sedentary">Mostly sitting / sedentary</option>
            <option value="light">Light activity</option>
            <option value="moderate" selected>Moderately active</option>
            <option value="active">Very active</option>
            <option value="very_active">Extremely active</option>
          </select>
        </label>

        <label>
          Training experience
          <select id="fitExperience">
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>

        <label>
          Training days per week
          <select id="fitDays">
            ${[2,3,4,5,6,7].map(n => `
              <option value="${n}" ${Number(fitness.training_days || 4) === n ? "selected" : ""}>
                ${n} days
              </option>
            `).join("")}
          </select>
        </label>

        <label>
          Available equipment
          <select id="fitEquipment">
            <option value="gym">Full gym</option>
            <option value="home">Home equipment</option>
            <option value="bodyweight">Bodyweight only</option>
            <option value="custom">Custom equipment</option>
          </select>
        </label>

        <h3>03 / Nutrition and safety</h3>

        <label>
          Food preference
          <select id="fitDiet">
            <option value="both">Vegetarian + non-vegetarian</option>
            <option value="veg">Vegetarian</option>
            <option value="nonveg">Non-vegetarian</option>
            <option value="vegan">Vegan</option>
            <option value="eggetarian">Eggetarian</option>
          </select>
        </label>

        <label>
          Allergies or foods to avoid
          <input id="fitAllergies" value="${esc(fitness.allergies || "")}"
            placeholder="e.g. peanuts, lactose">
        </label>

        <label>
          Injuries, medical limitations or exercise restrictions
          <input id="fitLimitations" value="${esc(fitness.limitations || "")}"
            placeholder="Mention any limitations or write None">
        </label>

        <label>
          Preferred workout duration
          <select id="fitDuration">
            ${[30,45,60,75,90].map(n => `
              <option value="${n}" ${Number(fitness.preferred_session_minutes || 60) === n ? "selected" : ""}>
                ${n} minutes
              </option>
            `).join("")}
          </select>
        </label>

        <button class="btn btn-dark" type="submit">
          Save profile and calculate ↗
        </button>
      </form>
    </section>

    <div id="fitnessResult">
      ${fitness.height_cm ? recommendationCard() : ""}
    </div>
  `;
}

function recommendationCard() {
  const result = calculateFitness(fitness);
  if (!result) return "";

  return `
    <section class="panel">
      <h3>Your estimated fitness numbers</h3>
      <div class="stat-grid">
        ${stat("BMI", result.bmi, bmiLabel(Number(result.bmi)))}
        ${stat("BMR", result.bmr, "Estimated resting energy kcal/day")}
        ${stat("MAINTENANCE", result.maintenance, "Estimated kcal/day")}
        ${stat("GOAL CALORIES", result.calories, "Initial planning estimate")}
      </div>

      <div class="notice">
        Your BMI is a screening measure, not a diagnosis.
        Calorie needs vary with individual health, body composition and activity.
        Review these estimates with a qualified professional if you have medical
        conditions, are under 18, are pregnant or have a history of disordered eating.
      </div>
    </section>
  `;
}

/* =========================================
   WORKOUT PLANNER
========================================= */

function workoutPage() {
  const plan = savedPlans.find(item => item.is_active);

  return `
    ${pageHead(
      "Your workout planner",
      "A starting routine based on your training experience and weekly availability."
    )}

    ${!fitness.height_cm ? `
      <div class="notice">
        Complete your fitness profile before generating a personalised plan.
        <button class="mini-btn" data-go="fitness">Set up profile ↗</button>
      </div>
    ` : `
      <section class="panel">
        <h3>Generate your training split</h3>
        <p class="panel-sub">
          ${goalLabel(fitness.goal)} · ${fitness.experience} ·
          ${fitness.training_days} days/week
        </p>
        <button id="generateWorkout" class="btn btn-dark">
          Generate my workout plan ↗
        </button>
      </section>
    `}

    ${plan ? `
      <section class="panel">
        <h3>${esc(plan.plan_name)}</h3>
        ${JSON.parse(JSON.stringify(plan.schedule || [])).map(day => `
          <div class="list-row">
            <span>
              <b>Day ${day.day}: ${esc(day.name)}</b>
              <small>${day.recovery ? "Recovery day" : day.exercises.length + " exercises"}</small>
            </span>
            <span class="pill">${day.recovery ? "REST" : "TRAIN"}</span>
          </div>
          ${day.exercises.map(ex => `
            <div class="list-row">
              <span>
                ${esc(ex.name)}
                <small>${ex.sets} sets × ${ex.reps} reps · ${ex.rest_seconds}s rest</small>
              </span>
            </div>
          `).join("")}
        `).join("")}
        <p class="panel-sub">
          Use manageable loads, prioritise technique and stop if you experience pain.
          Increase training demands gradually as your ability improves.
        </p>
      </section>
    ` : ""}
    
    <section class="panel">
      <h3>Log an exercise</h3>
      <form id="workoutForm" class="action-form">
        <input id="exercise" placeholder="Exercise name" required>
        <input id="sets" type="number" min="1" max="20" placeholder="Sets" required>
        <input id="reps" type="number" min="1" max="100" placeholder="Reps" required>
        <input id="weight" type="number" min="0" step="0.5" placeholder="Weight kg">
        <button>Save workout +</button>
      </form>
    </section>

    <section class="panel">
      <h3>Workout history</h3>
      ${rows(workouts, item => `
        <div class="list-row">
          <span>
            <b>${esc(item.exercise)}</b>
            <small>${dateText(item.workout_date)}</small>
          </span>
          <span class="pill">
            ${item.sets} × ${item.reps} · ${item.weight_kg || 0} kg
          </span>
        </div>
      `)}
    </section>
  `;
}

/* =========================================
   NUTRITION PLANNER
========================================= */

function nutritionPage() {
  const result = calculateFitness(fitness);

  if (!result) {
    return `
      ${pageHead("Nutrition planner", "Personalised nutrition estimates.")}
      <div class="notice">
        Complete your fitness profile first to calculate your nutrition estimates.
        <button class="mini-btn" data-go="fitness">Complete profile ↗</button>
      </div>
    `;
  }

  return `
    ${pageHead(
      "Your nutrition targets",
      "An initial estimate based on your profile and selected goal."
    )}

    <div class="stat-grid">
      ${stat("CALORIES", result.calories + " kcal", "Estimated daily target")}
      ${stat("PROTEIN", result.protein + " g", "Daily estimate")}
      ${stat("CARBS", result.carbs + " g", "Daily estimate")}
      ${stat("FATS", result.fat + " g", "Daily estimate")}
    </div>

    <div class="notice">
      These are planning estimates, not a prescribed diet.
      Adjust based on progress, hunger, recovery and professional advice.
    </div>

    <section class="panel">
      <h3>Indian meal ideas</h3>
      ${mealIdeas()}
    </section>
  `;
}

function mealIdeas() {
  const diet = fitness.diet_type || "both";

  const meals = [
    {
      type: "Breakfast",
      veg: "Oats with milk, fruit and nuts",
      nonveg: "Boiled eggs with whole-wheat toast",
      vegan: "Oats with fortified soy milk and fruit"
    },
    {
      type: "Lunch",
      veg: "Dal, rice, curd and vegetables",
      nonveg: "Chicken, rice and vegetables",
      vegan: "Chickpeas, rice and vegetables"
    },
    {
      type: "Snack",
      veg: "Roasted chana and fruit",
      nonveg: "Eggs and fruit",
      vegan: "Roasted chickpeas and fruit"
    },
    {
      type: "Dinner",
      veg: "Paneer, roti and vegetables",
      nonveg: "Fish or chicken with roti and vegetables",
      vegan: "Tofu, roti and vegetables"
    }
  ];

  const vegetarian = diet === "veg" || diet === "eggetarian";
  const vegan = diet === "vegan";

  return meals.map(meal => {
    let suggestion = vegan
      ? meal.vegan
      : vegetarian
        ? meal.veg
        : meal.nonveg;

    if (diet === "eggetarian" && meal.type === "Breakfast") {
      suggestion = meal.nonveg;
    }

    return `
      <div class="list-row">
        <span>
          <b>${meal.type}</b>
          <small>${suggestion}</small>
        </span>
        <span class="pill">IDEA</span>
      </div>
    `;
  }).join("") + `
    <p class="panel-sub">
      Meal ideas are examples, not complete measured meal plans.
      Check ingredients against your allergies and dietary restrictions.
    </p>
  `;
}

/* =========================================
   DAILY WELLNESS
========================================= */

function wellnessPage() {
  const log = wellness.find(item => item.log_date === today());

  return `
    ${pageHead(
      "Daily wellness",
      "Track hydration, sleep, steps and how you feel."
    )}

    <div class="stat-grid">
      ${stat("WATER", (log?.water_liters || 0) + " L", "Logged today")}
      ${stat("SLEEP", (log?.sleep_hours || 0) + " hrs", "Logged today")}
      ${stat("STEPS", Number(log?.steps || 0).toLocaleString("en-IN"), "Logged today")}
      ${stat("MOOD", esc(log?.mood || "--"), "Optional check-in")}
    </div>

    <section class="panel">
      <h3>Daily check-in</h3>
      <form id="wellnessForm" class="action-form">
        <input id="water" type="number" min="0" max="15" step="0.1"
          placeholder="Water (litres)" value="${log?.water_liters || ""}">
        <input id="sleep" type="number" min="0" max="24" step="0.5"
          placeholder="Sleep (hours)" value="${log?.sleep_hours || ""}">
        <input id="steps" type="number" min="0" max="100000"
          placeholder="Steps" value="${log?.steps || ""}">
        <select id="mood">
          <option value="">Mood (optional)</option>
          <option>Great</option>
          <option>Good</option>
          <option>Okay</option>
          <option>Tired</option>
        </select>
        <button>Save daily check-in</button>
      </form>
    </section>
  `;
}

/* =========================================
   MEMBERSHIP
========================================= */

function membershipPage() {
  const plan = profile.plan || user.user_metadata?.plan || "Not selected";
  const prices = { Monthly: 1499, Quarterly: 3999, Annual: 11999 };

  return `
    ${pageHead("Your membership", "Your plan and benefits.")}

    <div class="content-grid">
      ${panel("Current plan", `
        <h2>${esc(plan)}</h2>
        <p class="panel-sub">B&B gym access and member benefits.</p>
        ${stat("PLAN PRICE", money(prices[plan] || 0), "Illustrative plan price")}
        ${stat("STATUS", "Demo active", "Sample project status")}
      `)}
      ${panel("Membership benefits", `
        <div class="list-row">Gym access <span class="pill green">INCLUDED</span></div>
        <div class="list-row">Class booking <span class="pill green">INCLUDED</span></div>
        <div class="list-row">Fitness tracking <span class="pill green">INCLUDED</span></div>
        <div class="notice">This is a demo membership. No real payment is collected.</div>
      `)}
    </div>

    <section class="panel">
      <h3>Change plan preference</h3>
      <form id="planForm" class="action-form">
        <select id="newPlan">
          <option>Monthly</option>
          <option>Quarterly</option>
          <option>Annual</option>
        </select>
        <button>Save plan</button>
      </form>
    </section>
  `;
}

/* =========================================
   CLASS BOOKING
========================================= */

function classPage() {
  return `
    ${pageHead("Find your next session", "Browse classes and reserve your spot.")}

    <section class="panel">
      <h3>Available classes</h3>
      ${rows(classes, item => `
        <div class="list-row">
          <span>
            <b>${esc(item.name)}</b>
            <small>${esc(item.trainer)} · ${esc(item.starts_at)}</small>
          </span>
          <button class="mini-btn" data-book="${item.id}">Book ↗</button>
        </div>
      `)}
    </section>

    <section class="panel">
      <h3>Your bookings</h3>
      ${rows(bookings, item => `
        <div class="list-row">
          <span>
            <b>${esc(item.classes?.name || "Class")}</b>
            <small>${esc(item.classes?.starts_at || "")}</small>
          </span>
          <button class="mini-btn" data-cancel="${item.id}">Cancel</button>
        </div>
      `)}
    </section>
  `;
}

/* =========================================
   PAYMENTS
========================================= */

function paymentPage() {
  return `
    ${pageHead("Payment & billing", "Review your demo payment records.")}

    <div class="notice">
      Demo only: no actual payment gateway is connected.
    </div>

    <section class="panel">
      <h3>Add payment record</h3>
      <form id="paymentForm" class="action-form">
        <input id="amount" type="number" min="1" placeholder="Amount ₹" required>
        <select id="paymentFor">
          <option>Membership</option>
          <option>Personal training</option>
          <option>Other</option>
        </select>
        <select id="paymentStatus">
          <option>Paid</option>
          <option>Pending</option>
        </select>
        <button>Save record</button>
      </form>
    </section>

    <section class="panel">
      <h3>Billing history</h3>
      ${rows(payments, item => `
        <div class="list-row">
          <span>
            <b>${esc(item.description)}</b>
            <small>${dateText(item.payment_date)}</small>
          </span>
          <span>${money(item.amount)} · ${esc(item.status)}</span>
        </div>
      `)}
    </section>
  `;
}

/* =========================================
   NOTIFICATIONS
========================================= */

function notificationPage() {
  return `
    ${pageHead("Your notifications", "Reminders and updates.")}

    <section class="panel">
      <h3>Updates</h3>
      ${rows(notices, item => `
        <div class="list-row">
          <span>
            <b>${esc(item.title)}</b>
            <small>${esc(item.message)}</small>
          </span>
          <span class="pill">${dateText(item.created_at?.slice(0, 10))}</span>
        </div>
      `)}
    </section>

    <section class="panel">
      <h3>Create a reminder</h3>
      <form id="noticeForm" class="action-form">
        <input id="noticeTitle" placeholder="Reminder title" required>
        <input id="noticeText" placeholder="Short message">
        <button>Add reminder</button>
      </form>
    </section>
  `;
}

/* =========================================
   ANALYTICS
========================================= */

function analyticsPage() {
  const latestWeight = measurements[0]?.weight_kg;
  const firstWeight = measurements[measurements.length - 1]?.weight_kg;

  const change = latestWeight && firstWeight
    ? (Number(latestWeight) - Number(firstWeight)).toFixed(1)
    : null;

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));

    const iso = date.toLocaleDateString("en-CA");

    return {
      label: date.toLocaleDateString("en-IN", { weekday: "short" }),
      count: workouts.filter(item => item.workout_date === iso).length
    };
  });

  const max = Math.max(1, ...days.map(day => day.count));

  return `
    ${pageHead("Your progress", "Insights from the information you log.")}

    <div class="stat-grid">
      ${stat("WORKOUTS", workouts.length, "Recorded exercises")}
      ${stat("CLASS BOOKINGS", bookings.length, "Reservations")}
      ${stat("WEIGHT ENTRIES", measurements.length, "Progress entries")}
      ${stat("WEIGHT CHANGE", change === null ? "--" : change + " kg", "First to latest recorded entry")}
    </div>

    <section class="panel">
      <h3>Workout activity · Last 7 days</h3>
      <div class="bar-list">
        ${days.map(day => `
          <div class="bar-row">
            <span>${day.label}</span>
            <div class="bar-track">
              <div class="bar-fill" style="width:${day.count / max * 100}%"></div>
            </div>
            <b>${day.count}</b>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="panel">
      <h3>Log body measurements</h3>
      <form id="progressForm" class="action-form">
        <input id="bodyWeight" type="number" min="1" step="0.1"
          placeholder="Weight kg" required>
        <input id="bodyHeight" type="number" min="1" step="0.1"
          placeholder="Height cm">
        <button>Save progress</button>
      </form>

      <h3 style="margin-top:22px">Measurement history</h3>
      ${rows(measurements, item => `
        <div class="list-row">
          <span>
            <b>${item.weight_kg} kg</b>
            <small>${dateText(item.recorded_on)}</small>
          </span>
          <span>${item.height_cm ? item.height_cm + " cm" : ""}</span>
        </div>
      `)}
    </section>
  `;
}

/* =========================================
   EVENT HANDLERS
========================================= */

function bind() {
  $("fitnessForm")?.addEventListener("submit", saveFitness);

  $("generateWorkout")?.addEventListener("click", saveWorkoutPlan);

  $("workoutForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      await insert("workouts", {
        exercise: $("exercise").value.trim(),
        sets: Number($("sets").value),
        reps: Number($("reps").value),
        weight_kg: Number($("weight").value) || 0,
        workout_date: today()
      });

      await refresh();
      ping("Workout saved. Nice work!");
    } catch (error) {
      ping(error.message);
    }
  });

  $("wellnessForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      const row = {
        user_id: user.id,
        log_date: today(),
        water_liters: Number($("water").value) || 0,
        sleep_hours: Number($("sleep").value) || 0,
        steps: Number($("steps").value) || 0,
        mood: $("mood").value || null
      };

      const { error } = await db
        .from("wellness_logs")
        .upsert(row, { onConflict: "user_id,log_date" });

      if (error) throw error;

      await refresh();
      ping("Daily check-in saved.");
    } catch (error) {
      ping(error.message);
    }
  });

  $("planForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      const plan = $("newPlan").value;

      const { error } = await db.from("profiles").upsert({
        id: user.id,
        full_name: profile.full_name || user.user_metadata?.full_name || "",
        goal: fitness.goal || profile.goal || "",
        plan
      });

      if (error) throw error;

      profile.plan = plan;
      ping("Membership preference saved.");
      render();
    } catch (error) {
      ping(error.message);
    }
  });

  $("paymentForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      await insert("payments", {
        amount: Number($("amount").value),
        description: $("paymentFor").value,
        status: $("paymentStatus").value,
        payment_date: today()
      });

      await refresh();
      ping("Payment record saved.");
    } catch (error) {
      ping(error.message);
    }
  });

  $("noticeForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      await insert("notifications", {
        title: $("noticeTitle").value.trim(),
        message: $("noticeText").value.trim(),
        is_read: false
      });

      await refresh();
      ping("Reminder added.");
    } catch (error) {
      ping(error.message);
    }
  });

  $("progressForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      await insert("progress", {
        weight_kg: Number($("bodyWeight").value),
        height_cm: Number($("bodyHeight").value) || null,
        recorded_on: today()
      });

      await refresh();
      ping("Progress saved.");
    } catch (error) {
      ping(error.message);
    }
  });

 // OPEN CLASS BOOKING POPUP
document.querySelectorAll("[data-book]").forEach(button => {
  button.addEventListener("click", () => {
    selectedClass = classes.find(c =>
      String(c.id) === String(button.dataset.book)
    );

    if (!selectedClass) {
      ping("Could not find this class.");
      return;
    }

    $("modalClassName").textContent = selectedClass.name;
    $("modalTrainer").textContent =
      selectedClass.trainer || "B&B Trainer";

    $("bookingHeading").innerHTML = 'Book your<br><em>spot!</em>';
    $("bookingEyebrow").textContent = "YOUR NEXT SESSION";
    $("bookingSubtitle").textContent =
      "Pick your date and time. We'll save your spot.";

    $("bookingForm").hidden = false;
    $("bookingSuccess").hidden = true;
    $("bookingSubmit").disabled = false;
    $("bookingSubmit").textContent = "CONFIRM BOOKING ↗";

    // Use local date rather than UTC date.
    const now = new Date();
    const localDate = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("-");

    $("bookingDate").min = localDate;
    $("bookingDate").value = localDate;
    $("bookingTime").value = "";

    $("bookingModal").classList.add("show");
    $("bookingModal").setAttribute("aria-hidden", "false");
  });
});

// CLOSE POPUP
$("closeBooking").onclick = closeBooking;
$("bookingDone").onclick = closeBooking;

function closeBooking() {
  $("bookingModal").classList.remove("show");
  $("bookingModal").setAttribute("aria-hidden", "true");
}

// CONFIRM BOOKING
$("bookingForm").onsubmit = async (event) => {
  event.preventDefault();

  if (!selectedClass) return;

  const date = $("bookingDate").value;
  const time = $("bookingTime").value;

  if (!date || !time) {
    ping("Please select both date and time.");
    return;
  }

  if (date < $("bookingDate").min) {
    ping("Please choose today or a future date.");
    return;
  }

  $("bookingSubmit").disabled = true;
  $("bookingSubmit").textContent = "SAVING YOUR SPOT...";

  try {
    await insert("bookings", {
      class_id: selectedClass.id,
      status: "Booked",
      booking_date: date,
      booking_time: time
    });

    // Format the date and time for the confirmation.
    const readableDate = new Date(
      date + "T00:00:00"
    ).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric"
    });

    const readableTime = new Date(
      "2000-01-01T" + time
    ).toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });

    $("successClass").textContent = selectedClass.name;
    $("successTrainer").textContent =
      selectedClass.trainer || "B&B Trainer";
    $("successDate").textContent = readableDate;
    $("successTime").textContent = readableTime;

    $("bookingForm").hidden = true;
    $("bookingEyebrow").textContent = "IT'S OFFICIAL ✳";
    $("bookingHeading").innerHTML = "You're<br><em>booked!</em>";
    $("bookingSubtitle").textContent =
      "Your next session is on the calendar.";

    $("bookingSuccess").hidden = false;

    await refresh();

  } catch (error) {
    $("bookingSubmit").disabled = false;
    $("bookingSubmit").textContent = "CONFIRM BOOKING ↗";

    ping(
      error.message.toLowerCase().includes("duplicate")
        ? "You have already booked this class."
        : error.message
    );
  }
};

  document.querySelectorAll("[data-cancel]").forEach(button => {
    button.addEventListener("click", async () => {
      try {
        const { error } = await db
          .from("bookings")
          .delete()
          .eq("id", button.dataset.cancel)
          .eq("user_id", user.id);

        if (error) throw error;

        await refresh();
        ping("Booking cancelled.");
      } catch (error) {
        ping(error.message);
      }
    });
  });

  document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => {
      current = button.dataset.go;
      render();
    });
  });
}

/* =========================================
   SAVE FITNESS PROFILE
========================================= */

async function saveFitness(event) {
  event.preventDefault();

  const data = {
    user_id: user.id,
    age: Number($("fitAge").value),
    sex: $("fitSex").value,
    height_cm: Number($("fitHeight").value),
    current_weight_kg: Number($("fitWeight").value),
    target_weight_kg: Number($("fitTarget").value) || null,
    goal: $("fitGoal").value,
    activity_level: $("fitActivity").value,
    experience: $("fitExperience").value,
    training_days: Number($("fitDays").value),
    equipment: [$("fitEquipment").value],
    diet_type: $("fitDiet").value,
    allergies: $("fitAllergies").value.trim(),
    limitations: $("fitLimitations").value.trim(),
    preferred_session_minutes: Number($("fitDuration").value),
    updated_at: new Date().toISOString()
  };

  if (data.age < 16 || data.age > 100 ||
      data.height_cm < 100 || data.height_cm > 250 ||
      data.current_weight_kg < 25 || data.current_weight_kg > 350) {
    ping("Please check your age, height and weight.");
    return;
  }

  if (data.target_weight_kg &&
      (data.target_weight_kg < 25 || data.target_weight_kg > 350)) {
    ping("Please enter a valid target weight.");
    return;
  }

  try {
    const { error } = await db
      .from("fitness_profiles")
      .upsert(data, { onConflict: "user_id" });

    if (error) throw error;

    fitness = data;

    const result = calculateFitness(fitness);

    if (result) {
      await insert("nutrition_targets", {
        calories: result.calories,
        protein_g: result.protein,
        carbs_g: result.carbs,
        fat_g: result.fat,
        goal: fitness.goal,
        explanation: "Estimated from user profile and activity level."
      });
    }

    await refresh();
    current = "fitness";
    render();

    ping("Fitness profile saved!");
  } catch (error) {
    ping(error.message);
  }
}

/* =========================================
   SAVE GENERATED WORKOUT
========================================= */

async function saveWorkoutPlan() {
  if (!fitness.height_cm) {
    ping("Complete your fitness profile first.");
    return;
  }

  try {
    const schedule = generateWorkout(fitness);

    const { error: deactivateError } = await db
      .from("workout_plans")
      .update({ is_active: false })
      .eq("user_id", user.id);

    if (deactivateError) throw deactivateError;

    const { error } = await db.from("workout_plans").insert({
      user_id: user.id,
      plan_name: `${goalLabel(fitness.goal)} · ${fitness.training_days} days`,
      goal: fitness.goal,
      experience: fitness.experience,
      schedule,
      is_active: true
    });

    if (error) throw error;

    await refresh();
    current = "workouts";
    render();
    ping("Your workout plan is ready!");
  } catch (error) {
    ping(error.message);
  }
}

/* =========================================
   REFRESH AND START
========================================= */

async function refresh() {
  await load();
  render();
}

document.querySelectorAll(".side-link").forEach(button => {
  button.addEventListener("click", () => {
    current = button.dataset.view;
    render();
  });
});

$("logoutBtn").addEventListener("click", async () => {
  if (!db) return;
  await db.auth.signOut();
  location.href = "login.html";
});

async function start() {
  if (!db) {
    root.innerHTML = `
      <section class="panel">
        <h2>Connect your database first</h2>
        <p>Check js/config.js and add your Supabase Project URL
        and publishable/anon key.</p>
      </section>
    `;
    return;
  }

  const { data, error } = await db.auth.getSession();
  if (error) throw error;

  if (!data.session) {
    location.href = "login.html";
    return;
  }

  user = data.session.user;

  const { data: existingProfile, error: profileError } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  profile = existingProfile || {};

  if (!existingProfile) {
    const seed = {
      id: user.id,
      full_name: user.user_metadata?.full_name || "",
      goal: user.user_metadata?.goal || "",
      plan: user.user_metadata?.plan || "Monthly"
    };

    const { error: seedError } = await db
      .from("profiles")
      .upsert(seed);

    if (seedError) throw seedError;

    profile = seed;
  }

  $("todayLabel").textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });

  await load();
  render();
}

start().catch(error => {
  root.innerHTML = `
    <section class="panel">
      <h2>Could not load dashboard</h2>
      <p>${esc(error.message)}</p>
      <p>Check your Supabase tables, policies and connection settings.</p>
    </section>
  `;
});
