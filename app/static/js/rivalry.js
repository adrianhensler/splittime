"use strict";
(function(){
 const $=id=>document.getElementById(id);
 const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
 const fmt=value=>{
  if(typeof value!=="number"||!Number.isFinite(value)||value<=0)return "—";
  const ms=Math.round(value*1000);
  return Math.floor(ms/60000)+":"+String(Math.floor((ms%60000)/1000)).padStart(2,"0")+
   "."+String(ms%1000).padStart(3,"0");
 };
 // the game never says what kind of event a lap came from; the server guesses
 const event=lap=>({rivals:"probably Rivals",race:"race (other cars ahead)"}[lap.event_mode]||"unknown");
 let data=null;
 function render(){
  const groups=Array.isArray(data?.categories)?data.categories:[];
  const pick=$("routeSelect").value;
  const shown=pick==="all"?groups:groups.filter((g,i)=>String(i)===pick);
  const drivers=Array.isArray(data?.drivers)?data.drivers:[];
  const driverIds=[...new Set([...drivers.map(d=>String(d.id)),...groups.flatMap(g=>
    Object.keys(g.best_by_driver||{}))])];
  $("routeCount").textContent=String(groups.length);
  $("attemptCount").textContent=String(groups.reduce((n,g)=>n+(g.total_attempts||0),0));
  $("driverCount").textContent=String(drivers.length);
  if(!groups.length){
   $("catalog").innerHTML='<div class="empty">No recorded sessions yet. Configure both UDP destinations and complete an event. This page never substitutes fictional results.</div>';
   $("message").textContent="No stored recordings available.";return;
  }
  $("message").textContent=groups.length+" route/class groups · exploratory comparisons only";
  $("catalog").innerHTML=shown.map(group=>{
   const best=group.best_by_driver||{};
   const ids=[...new Set([...driverIds,...Object.keys(best)])];
   const cards=ids.map(id=>{
    const person=drivers.find(d=>String(d.id)===id),lap=best[id];
    return '<div class="card"><label>'+esc(person?.name||id)+'</label><strong>'+
     (lap?fmt(lap.time_s):"—")+'</strong><div>'+
     (lap?esc((lap.car_name||"Unknown vehicle")+" · PI "+(lap.car_pi??"?")):
      "No eligible completed lap")+'</div></div>';
   }).join("")||'<p class="muted">No configured drivers.</p>';
   const laps=Array.isArray(group.attempts)?group.attempts:[];
   const rows=laps.map(lap=>{
    const state=lap.completion!=="complete"?lap.completion||"incomplete":
     lap.validity!=="accepted"?lap.validity||"unknown":"candidate";
    const css=state==="candidate"?"ok":"warn";
    return '<tr><td>'+esc(lap.driver_name||lap.driver_id)+'</td><td>'+
     fmt(lap.time_s)+'</td><td class="'+css+'">'+esc(state)+'</td><td>'+
     esc(lap.started_at_utc||"unknown")+'</td><td>'+esc(lap.car_pi??"?")+'</td><td>'+
     esc(event(lap))+'</td></tr>';
   }).join("");
   const uncertainty=(Array.isArray(group.uncertainty)?group.uncertainty:[])
    .map(s=>esc(String(s).replaceAll("_"," "))).join("; ");
   const pair=ids.map(id=>best[id]).filter(lap=>lap&&Number.isSafeInteger(lap.lap_id)&&lap.lap_id>0).slice(0,2);
   const comparison=group.route_id!=null&&pair.length===2?
    '<p><a href="compare.html?lap_a='+pair[0].lap_id+'&amp;lap_b='+pair[1].lap_id+'">Compare candidate laps · traces and corners</a></p>':
    '<p class="muted">Corner comparison needs candidate laps from two drivers on a known route.</p>';
   return '<article class="route"><div class="routeHead"><div><h2>'+
    esc(group.route_name||"Unknown route")+'</h2><p class="muted">'+
    esc(group.car_class_label||"?")+" class · "+esc(group.total_attempts??0)+
    ' attempts</p></div><span class="pill">Unverified · no winner</span></div>'+
    '<div class="cards">'+cards+'</div>'+comparison+'<details><summary>Inspect attempts and missing evidence ('+
    laps.length+')</summary><p class="muted">'+uncertainty+'</p><div class="table"><table><thead><tr>'+
    '<th>Driver</th><th>Lap time</th><th>Status</th><th>Started (UTC)</th><th>PI</th><th>Event (guess)</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div></details></article>';
  }).join("")||'<div class="empty">No routes match this filter.</div>';
 }
 function setOptions(){
  const cats=data.categories;
  $("routeSelect").innerHTML='<option value="all">All routes</option>'+
   cats.map((g,i)=>'<option value="'+i+'">'+
    esc((g.route_name||"Unknown route")+" · "+(g.car_class_label||"?"))+'</option>').join("");
  $("routeSelect").value="all";
 }
 async function load(){
  $("message").textContent="Loading recordings…";
  $("message").className="";
  try{
   const response=await fetch("api/rivalry",{headers:{Accept:"application/json"},cache:"no-store"});
   if(!response.ok)throw Error("HTTP "+response.status);
   const payload=await response.json();
   if(!payload||!Array.isArray(payload.categories))throw Error("invalid rivalry API response");
   data=payload;setOptions();render();
  }catch(error){
   $("message").className="error";
   $("message").textContent="Could not load recordings: "+String(error.message||error);
   $("catalog").innerHTML='<div class="empty">No data was changed. Check that SplitTime is running and the gateway forwards <code>api/rivalry</code> correctly.</div>';
  }
 }
 $("routeSelect").addEventListener("change",render);
 $("refresh").addEventListener("click",load);
 load();
})();
