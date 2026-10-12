/* SplitTime POC: pure ranking and comparison domain rules. No actual game data implied. */
(function(root){
"use strict";
function classifyAttempt(a,{demo=false}={}){
 const reasons=[];
 if(!a || typeof a!=="object")return {eligible:false,reasons:["missing_attempt"]};
 if(typeof a.time!=="number"||!Number.isFinite(a.time)||a.time<=0)reasons.push("no_valid_time");
 if(a.completion!=="complete")reasons.push("not_complete");
 if(a.validity!=="accepted")reasons.push("not_accepted");
 if(a.quality!=="continuous")reasons.push("capture_uncertain");
 if(!demo){
   if(a.source!=="recorded")reasons.push("source_unverified");
   if(!["game-reported","verified-derived"].includes(a.timing_source))reasons.push("timing_unverified");
 }
 return {eligible:reasons.length===0,reasons};
}
function bestAttempt(route,driver,{demo=false}={}){
 const attempts=Array.isArray(route?.attempts)?route.attempts:[];
 return attempts.filter(a=>a.driver===driver&&classifyAttempt(a,{demo}).eligible)
   .reduce((best,a)=>best===null||a.time<best.time?a:best,null);
}
function summarizeRoute(route,{demo=false}={}){
 const a=bestAttempt(route,"A",{demo}), b=bestAttempt(route,"B",{demo});
 const reasons=[];
 if(!a||!b)reasons.push("missing_eligible_driver_lap");
 if(!demo && route?.competitive_equivalence!=="verified")reasons.push("route_or_rules_not_verified");
 if(demo && route?.ranked!==true)reasons.push("demo_route_not_comparable");
 if(a&&b){
   if(a.class!==b.class)reasons.push("different_class");
   if(a.pi!==b.pi)reasons.push("different_pi");
   const unknown=m=>typeof m!=="string"||!m.trim()||/unknown|inferred/i.test(m);
   if(unknown(a.mode)||unknown(b.mode))reasons.push("event_mode_unknown");
   else if(a.mode!==b.mode)reasons.push("different_mode");
   if(a.route_direction && b.route_direction && a.route_direction!==b.route_direction)reasons.push("different_direction");
 }
 const comparable=reasons.length===0;
 return {a,b,comparable,reasons,winner:comparable?(a.time<=b.time?"A":"B"):null,margin_s:comparable?Math.abs(a.time-b.time):null};
}
function formatLapTime(value){
 if(typeof value!=="number"||!Number.isFinite(value)||value<=0)return "—";
 const total=Math.round(value*1000);
 const minutes=Math.floor(total/60000);
 const s=Math.floor((total%60000)/1000).toString().padStart(2,"0");
 const ms=(total%1000).toString().padStart(3,"0");
 return `${minutes}:${s}.${ms}`;
}
const api=Object.freeze({classifyAttempt,bestAttempt,summarizeRoute,formatLapTime});
if(typeof module!=="undefined"&&module.exports)module.exports=api;
root.SplitTimeDomain=api;
})(typeof globalThis!=="undefined"?globalThis:this);
