import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const url = window.BB_SUPABASE_URL;
const key = window.BB_SUPABASE_ANON_KEY;
const ready = url && key && !url.startsWith("YOUR_") && !key.startsWith("YOUR_");
const supabase = ready ? createClient(url, key) : null;
const msg = document.getElementById("formMessage");
function show(text, success=false){ if(msg){msg.textContent=text;msg.className="form-message"+(success?" success":"");} }
const register = document.getElementById("registerForm");
if(register) register.addEventListener("submit", async e=>{
  e.preventDefault();
  if(!supabase) return show("Add your Supabase URL and key in js/config.js first.");
  const full_name=document.getElementById("fullName").value.trim();
  const email=document.getElementById("email").value.trim();
  const password=document.getElementById("password").value;
  const goal=document.getElementById("goal").value;
  const plan=document.getElementById("plan").value;
  const button=register.querySelector("button"); button.disabled=true; button.textContent="Creating account…";
  const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name,goal,plan}}});
  if(error){show(error.message);button.disabled=false;button.textContent="Create account ↗";return;}
  if(data.session){show("Account created! Taking you to your dashboard…",true);setTimeout(()=>location.href="dashboard.html",700);}
  else {show("Account created. Check your email to confirm, then log in.",true);button.disabled=false;button.textContent="Create account ↗";}
});
const login=document.getElementById("loginForm");
if(login) login.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!supabase) return show("Add your Supabase URL and key in js/config.js first.");
  const button=login.querySelector("button");button.disabled=true;button.textContent="Logging in…";
  const {error}=await supabase.auth.signInWithPassword({email:document.getElementById("email").value.trim(),password:document.getElementById("password").value});
  if(error){show(error.message);button.disabled=false;button.textContent="Log in ↗";return;}
  location.href="dashboard.html";
});
