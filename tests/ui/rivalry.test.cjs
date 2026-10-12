"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.join(__dirname,"..","..");
const html=fs.readFileSync(path.join(root,"app/static/rivalry.html"),"utf8");
const source=fs.readFileSync(path.join(root,"app/static/js/rivalry.js"),"utf8");

function page(payload,requestFailure=false){
 const controls=new Map();
 function elt(id){
  if(!controls.has(id)){
   controls.set(id,{
    textContent:"",innerHTML:"",value:"all",className:"",listeners:{},
    addEventListener(name,listener){this.listeners[name]=listener;}
   });
  }
  return controls.get(id);
 }
 const calls=[];
 const fetch=async (url,options)=>{
  calls.push({url,options});
  if(requestFailure)throw new Error("offline");
  return {ok:true,json:async()=>payload};
 };
 const ctx=vm.createContext({document:{getElementById:elt},fetch});
 new vm.Script(source).runInContext(ctx,{timeout:1500});
 const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
 return {elt,calls,settle};
}
const examples={
 version:1,source:"recorded_index",scoring:"exploratory_only",
 drivers:[{id:"alpha",name:"Alex"},{id:"beta",name:"Blair"}],
 categories:[
  {route_id:12,route_name:"Test Circuit",car_class_label:"A",total_attempts:3,
   best_by_driver:{
    alpha:{time_s:92.418,car_name:"Car #40",car_pi:800},
    beta:{time_s:93.06,car_name:"Car #48",car_pi:750}
   },
   uncertainty:["game_mode_unknown","capture_quality_unknown"],
   attempts:[
    {driver_name:"Alex",time_s:92.418,completion:"complete",validity:"accepted",started_at_utc:"2026-10-12T00:00:00Z",car_pi:800},
    {driver_name:"Blair",time_s:null,completion:"incomplete",validity:"unknown",started_at_utc:"2026-10-10T00:00:00Z",car_pi:750},
    {driver_name:"Blair",time_s:91.2,completion:"provisional",validity:"suspect",started_at_utc:"2026-10-11T00:00:00Z",car_pi:750}
   ]},
  {route_id:null,route_name:"Unknown route",car_class_label:"S1",total_attempts:0,
   best_by_driver:{},uncertainty:["route_unidentified"],attempts:[]}
 ]};
test("JS script parses and entry page links to the script",()=>{
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(html,/<script src="js\/rivalry\.js"><\/script>/);
});
test("page fetches real API, renders candidate records without winners",async()=>{
 const {elt,calls,settle}=page(examples);await settle();
 assert.equal(calls[0].url,"api/rivalry");
 assert.equal(elt("routeCount").textContent,"2");
 assert.equal(elt("attemptCount").textContent,"3");
 assert.equal(elt("driverCount").textContent,"2");
 const body=elt("catalog").innerHTML;
 assert.match(body,/1:32\.418/);assert.match(body,/1:33\.060/);
 assert.match(body,/Unverified · no winner/);
 assert.match(body,/incomplete/);assert.match(body,/provisional/);
 assert.doesNotMatch(body,/Winner:/);
});
test("filter picks only selected route/class",async()=>{
 const {elt,settle}=page(examples);await settle();
 elt("routeSelect").value="1";
 elt("routeSelect").listeners.change();
 assert.doesNotMatch(elt("catalog").innerHTML,/Test Circuit/);
 assert.match(elt("catalog").innerHTML,/Unknown route/);
});
test("untrusted track and name strings get escaped",async()=>{
 const malicious=JSON.parse(JSON.stringify(examples));
 malicious.categories[0].route_name='<img src=x onerror="alert(1)">';
 malicious.drivers[0].name="<svg onload=evil()>";
 const {elt,settle}=page(malicious);await settle();
 const body=elt("catalog").innerHTML;
 assert.doesNotMatch(body,/<img/);assert.doesNotMatch(body,/<svg/);
 assert.match(body,/&lt;img/);assert.match(body,/&lt;svg/);
});
test("empty dataset and network errors remain explicit",async()=>{
 const empty=page({...examples,categories:[]});await empty.settle();
 assert.match(empty.elt("catalog").innerHTML,/No recorded sessions yet/);
 const broken=page(null,true);await broken.settle();
 assert.match(broken.elt("message").textContent,/Could not load recordings/);
 assert.match(broken.elt("catalog").innerHTML,/No data was changed/);
});

test('comparison A/B follows configured driver order despite API object order',async()=>{
 const data=JSON.parse(JSON.stringify(examples));
 data.categories[0].best_by_driver={beta:{lap_id:12,time_s:93},alpha:{lap_id:11,time_s:92},legacy:{lap_id:13,time_s:94}};
 const {elt,settle}=page(data);await settle();
 assert.match(elt('catalog').innerHTML,/compare.html\?lap_a=11&amp;lap_b=12/);
 assert.equal(elt('driverCount').textContent,'2');
});
