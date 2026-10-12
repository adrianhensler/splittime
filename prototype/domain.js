/* Workpacket-light: pure scoring and eligibility rules. No game-data claims. */
(function(root){
"use strict";
function normalizeCarClass(value) {
 const classes=["D","C","B","A","S1","S2","R","X"];
 if(typeof value==="number"&&Number.isInteger(value)&&value>=0&&value<classes.length)return classes[value];
 if(typeof value==="string"&&classes.includes(value.trim().toUpperCase()))return value.trim().toUpperCase();
 return null;
}

function normalizeMode(value){
 if(typeof value!=="string")return null;
 const raw=value.trim().toLowerCase().replace(/\s*\(inferred\)\s*$/,"").trim();
 if(!raw||["unknown","unclassified","not available","?"].includes(raw))return null;
 const aliases={"circuit race":"race","race":"race","rivals":"rivals","rival":"rivals","sprint":"sprint","world time attack":"wta","time attack":"wta","wta":"wta","touge":"touge","drag":"drag"};
 return aliases[raw]??raw;
}

function classifyAttempt(a,{demo=false}={}){
 const reasons=[];
 if(!a||typeof a!=="object")return {eligible:false,reasons:["missing_attempt"]};
 const driver=a.driver_id??a.driver;
 if(typeof driver!=="string"&&typeof driver!=="number")reasons.push("unknown_driver");
 if(typeof a.time!=="number"||!Number.isFinite(a.time)||a.time<=0)reasons.push("no_valid_time");
 if(a.completion!=="complete")reasons.push("not_complete");
 if(a.validity!=="accepted")reasons.push("not_accepted");
 if(a.quality!=="continuous")reasons.push("capture_uncertain");
 if(normalizeCarClass(a.car_class??a.class)===null)reasons.push("class_unknown");
 if(!Number.isInteger(a.pi)||a.pi<0||a.pi>1000)reasons.push("pi_unknown");
 if(!demo){
  if(a.source!=="recorded")reasons.push("source_unverified");
  if(!["game-reported","verified-derived"].includes(a.timing_source))reasons.push("timing_unverified");
 }
 return {eligible:reasons.length===0,reasons};
}

function bestAttempt(route,driver,{demo=false,carClass=null,mode=null,pi=null}={}){
 const attempts=Array.isArray(route?.attempts)?route.attempts:[];
 const canonicalClass=carClass===null?null:normalizeCarClass(carClass);
 const canonicalMode=mode===null?null:normalizeMode(mode);
 return attempts.filter(a=>
  a&&((a.driver_id??a.driver)===driver)&&classifyAttempt(a,{demo}).eligible
  &&(carClass===null||normalizeCarClass(a.car_class??a.class)===canonicalClass)
  &&(mode===null||normalizeMode(a.mode)===canonicalMode)
  &&(pi===null||a.pi===pi)
 ).reduce((best,a)=>best===null||a.time<best.time?a:best,null);
}

function summarizeRoute(route,{demo=false,driverIds=null,strictPI=false,category=null}={}){
 const attempts=Array.isArray(route?.attempts)?route.attempts.filter(a=>a&&typeof a==="object"):[];
 const ids=Array.isArray(driverIds)&&driverIds.length===2?driverIds.slice():
   [...new Set(attempts.map(a=>a.driver_id??a.driver).filter(d=>typeof d==="string"||typeof d==="number"))].slice(0,2);
 if(!driverIds&&(ids.includes("A")||ids.includes("B"))){ids[0]="A";ids[1]="B";}
 if(ids.length<2)ids.push(null);
 const [idA,idB]=ids;
 const allA=attempts.filter(a=>(a.driver_id??a.driver)===idA&&classifyAttempt(a,{demo}).eligible);
 const allB=attempts.filter(a=>(a.driver_id??a.driver)===idB&&classifyAttempt(a,{demo}).eligible);
 const shortest=items=>items.reduce((best,a)=>best===null||a.time<best.time?a:best,null);
 const reasons=[];
 if(!allA.length||!allB.length)reasons.push("missing_eligible_driver_lap");
 const key=a=>{
   const cl=normalizeCarClass(a.car_class??a.class),md=normalizeMode(a.mode);
   return cl!==null&&md!==null?JSON.stringify(strictPI?[cl,md,a.pi]:[cl,md]):null;
 };
 const groups=new Map();
 for(const a of allA){
  const k=key(a);if(k===null)continue;
  const curr=groups.get(k)||{a:null,b:null,carClass:normalizeCarClass(a.car_class??a.class),mode:normalizeMode(a.mode)};
  if(curr.a===null||a.time<curr.a.time)curr.a=a;
  groups.set(k,curr);
 }
 for(const b of allB){
  const k=key(b);if(k===null)continue;
  const curr=groups.get(k);if(!curr)continue;
  if(curr.b===null||b.time<curr.b.time)curr.b=b;
 }
 const candidates=[...groups.values()].filter(g=>g.a&&g.b);
 const directionReasons=[];
 const viable=candidates.filter(g=>{
  const da=typeof g.a.route_direction==="string"&&g.a.route_direction.trim()?g.a.route_direction.trim().toLowerCase():null;
  const db=typeof g.b.route_direction==="string"&&g.b.route_direction.trim()?g.b.route_direction.trim().toLowerCase():null;
  if(Boolean(da)!==Boolean(db)){directionReasons.push("direction_unverified");return false}
  if(da!==null&&da!==db){directionReasons.push("different_direction");return false}
  return category===null||g.carClass===normalizeCarClass(category);
 }).sort((x,y)=>Math.min(x.a.time,x.b.time)-Math.min(y.a.time,y.b.time)||x.carClass.localeCompare(y.carClass)||x.mode.localeCompare(y.mode));
 const pair=viable[0]??null;
 const a=pair?.a??shortest(allA);
 const b=pair?.b??shortest(allB);
 if(!pair&&allA.length&&allB.length){
  if(directionReasons.length)reasons.push(...new Set(directionReasons));
  else if(allA.some(x=>normalizeMode(x.mode)===null)||allB.some(x=>normalizeMode(x.mode)===null))reasons.push("event_mode_unknown");
  else if(!allA.some(x=>allB.some(y=>normalizeCarClass(x.car_class??x.class)===normalizeCarClass(y.car_class??y.class))))reasons.push("different_class");
  else if(strictPI&&!allA.some(x=>allB.some(y=>x.pi===y.pi&&normalizeCarClass(x.car_class??x.class)===normalizeCarClass(y.car_class??y.class)&&normalizeMode(x.mode)===normalizeMode(y.mode))))reasons.push("different_pi");
  else reasons.push("no_equivalent_category");
 }
 if(demo){
  if(route?.ranked!==true)reasons.push("demo_route_not_comparable");
 } else if(route?.competitive_equivalence!=="verified")reasons.push("route_or_rules_not_verified");
 const comparable=Boolean(pair)&&reasons.length===0;
 const margin_s=comparable?Math.abs(a.time-b.time):null;
 const tie=comparable&&margin_s<=0.0005;
 return {a,b,driverIds:ids,category:pair?{class:pair.carClass,mode:pair.mode}:null,
  comparable,reasons,winner:comparable&&!tie?(a.time<b.time?idA:idB):null,tie,margin_s,
  candidate_categories:candidates.map(g=>({class:g.carClass,mode:g.mode}))};
}

function formatLapTime(value){
 if(typeof value!=="number"||!Number.isFinite(value)||value<=0)return "—";
 const ms=Math.round(value*1000),minutes=Math.floor(ms/60000);
 return `${minutes}:${Math.floor((ms%60000)/1000).toString().padStart(2,"0")}.${(ms%1000).toString().padStart(3,"0")}`;
}
const api=Object.freeze({normalizeCarClass,normalizeMode,classifyAttempt,bestAttempt,summarizeRoute,formatLapTime});
if(typeof module!=="undefined"&&module.exports)module.exports=api;
root.SplitTimeDomain=api;
})(typeof globalThis!=="undefined"?globalThis:this);
