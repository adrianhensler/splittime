"use strict";
(async function(){
 const $=id=>document.getElementById(id);
 const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
 const num=(value,digits=2)=>typeof value==="number"&&Number.isFinite(value)?value.toFixed(digits):"—";
 const params=new URLSearchParams(location.search);
 const descriptions={
  route_equivalence_unverified:'Route direction, checkpoints and event timing rules have not been verified. This comparison is exploratory.',
  lap_clock_discontinuous:'A lap clock ran backwards. Segment times are diagnostic only; a negative interval is not a valid time gain.',
  arrival_time_unverified:'Timing uses packet arrival over the network, so it cannot establish a competitive result.',
  too_few_samples:'There are too few captured samples for a reliable comparison.',
  different_timing_source:'The two laps use different clock sources.',
  laps_cover_different_distance:'The laps cover different portions of the route.',
  different_start_position:'The laps start at different positions.',
  no_shared_distance:'The laps have no shared route-position range.'
 };
 const describe=value=>descriptions[value]||String(value).replaceAll('_',' ');
 // ?laps=a,b like the other pair views; ?lap_a=&lap_b= from older links
 const laps=(params.get("laps")||"").split(",");
 const ids=laps.length===2?laps:[params.get("lap_a"),params.get("lap_b")];
 async function get(url){const response=await fetch(url,{cache:"no-store"});if(!response.ok)throw Error("HTTP "+response.status);return response.json();}
 function plot(a,b,key,title,maximum){
  const extent=Math.max(...a.dist,...b.dist,1);
  const series=[a,b].map(lap=>lap.dist.map((s,i)=>[s,lap.channels[key][i]])
   .filter(([s,v])=>Number.isFinite(s)&&Number.isFinite(v)));
  const peak=maximum||Math.max(...series.flat().map(p=>p[1]),1);
  const lines=series.map((points,i)=>'<polyline fill="none" stroke="'+(i?'#eec081':'#6ce0cb')+'" stroke-width="2" points="'+
   points.map(([s,v])=>(45+410*s/extent).toFixed(2)+','+(165-140*v/peak).toFixed(2)).join(' ')+'"/>').join('');
  return '<article class="panel"><h2>'+title+'</h2><svg viewBox="0 0 480 200" role="img" aria-label="'+title+' for laps A and B">'+
   '<path d="M45 20V165H455" fill="none" stroke="#344b60"/><text x="0" y="25">'+num(peak,0)+'</text><text x="20" y="170">0</text>'+lines+
   '<text x="45" y="195">0</text><text x="455" y="195" text-anchor="end">'+num(extent,0)+'</text></svg><p class="muted">Route position (game parameter)</p></article>';
 }
 try{
  if(ids.some(id=>!id||!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id))))throw Error("Choose two laps from the Rivalry page.");
  const [result,a,b]=await Promise.all([
   get('api/corners/compare?lap_a='+ids[0]+'&lap_b='+ids[1]),
   ...ids.map(id=>get('api/laps/'+id+'/data?max_points=1200'))]);
  $('status').textContent='A: '+(result.a.driver_name||'lap')+' #'+ids[0]+' · B: '+(result.b.driver_name||'lap')+' #'+ids[1]+' · B − A: negative means B took less time in that segment.';
  const quality=side=>esc(result[side].capture_quality)+' · '+esc(result[side].timing_source)+' · '+num(result[side].gaps,0)+' timestamp gaps';
  const warnings=[...(result.reasons||[]).map(describe),...(result.corners.warnings||[]),
   ...(result.a.warnings||[]).map(w=>'A: '+w),...(result.b.warnings||[]).map(w=>'B: '+w)];
  // Route equivalence is never verified yet (ADR), so on its own it is a caveat, not a fault.
  const onlyRoute=(result.reasons||[]).every(reason=>reason==='route_equivalence_unverified');
  const comparisonState=result.comparable===true?'Telemetry aligned · competitive equivalence remains unverified':
   onlyRoute?'Telemetry aligned · same recorded route; official route equivalence is not verified':
   'Exploratory comparison · see the warnings above';
  $('summary').innerHTML='<div class="panel"><div class="legend"><strong class="alpha">A: '+num(a.lap.lap_time,3)+' s</strong><strong class="beta">B: '+num(b.lap.lap_time,3)+' s</strong></div><p>A: '+quality('a')+'<br>B: '+quality('b')+'</p><p>Explained segment difference: '+num(result.totals?.dt,3)+' s · unexplained residual: '+num(result.sum_check.residual,3)+' s</p><p class="muted">'+
   (warnings.length?warnings.map(esc).join('; '):'No trace-alignment warnings. Competitive equivalence remains unverified.')+'</p><p class="notice">'+comparisonState+'</p></div>';
  $('traces').innerHTML='<p class="legend"><span class="alpha">A</span><span class="beta">B</span></p>'+plot(a,b,'speed_kmh','Speed (km/h)')+plot(a,b,'throttle','Throttle (%)',100)+plot(a,b,'brake','Brake (%)',100);
  const corners=result.segments.filter(s=>s.kind==='corner');
  const largest=(result.largest||[]).slice(0,3).map(n=>corners.find(s=>s.n===n)).filter(Boolean);
  const rows=corners.map(s=>'<tr><td>'+s.n+(s.partial?' (partial)':'')+'</td><td>'+num(s.dt,3)+'</td><td>'+num(s.a?.brake_onset_s)+' / '+num(s.b?.brake_onset_s)+'</td><td>'+num(s.a?.min_kmh)+' / '+num(s.b?.min_kmh)+'</td><td>'+num(s.a?.throttle_on_s)+' / '+num(s.b?.throttle_on_s)+'</td><td>'+num(s.a?.exit_kmh)+' / '+num(s.b?.exit_kmh)+'</td></tr>').join('');
  $('corners').innerHTML='<div class="panel"><h2>Corner measurements</h2><p>Largest differences: '+(largest.map(s=>'#'+s.n+': '+num(s.dt,3)+' s').join(' · ')||'No detected corners')+'</p><p class="muted">Values are A / B. Brake and throttle positions use the route parameter. Corner numbering uses reference lap #'+esc(result.corners.reference_lap_id)+', and may change with a new reference. Turn direction is unverified.</p><div class="table"><table><thead><tr><th>Corner</th><th>B − A (s)</th><th>Brake onset</th><th>Minimum km/h</th><th>Throttle on</th><th>Exit km/h</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
 }catch(error){$('status').className='error';$('status').textContent='Could not compare laps: '+String(error.message||error);}
})();
