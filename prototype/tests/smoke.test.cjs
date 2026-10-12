"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const inline=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
test("browser inline script parses",()=>{assert.ok(inline);assert.doesNotThrow(()=>new vm.Script(inline));});
function boot(){
 const els=new Map(),downloads=[];
 function el(id){
  if(!els.has(id))els.set(id,{id,textContent:"",innerHTML:"",value:"0",attrs:{},
   setAttribute(key,value){this.attrs[key]=value;},
   getTotalLength(){return 100;},getPointAtLength(len){return {x:len,y:100-len}}});
  return els.get(id);
 }
 const document={getElementById:el,createElement:()=>({click(){downloads.push(this.download)}})};
 const ctx=vm.createContext({document,SplitTimeDomain:require("../domain.js"),Blob,
  URL:{createObjectURL(){return "blob:synthetic";},revokeObjectURL(){}},setTimeout(){}});
 new vm.Script(inline).runInContext(ctx,{timeout:3000});
 return {el,downloads};
}
test("demo renders records and ineligible reasons",()=>{
 const {el}=boot();
 assert.equal(el("scoreA").textContent,"1:32.418");
 assert.equal(el("scoreB").textContent,"1:33.060");
 assert.match(el("winner").textContent,/A 0\.642s/);
 assert.match(el("attempts").innerHTML,/Ineligible: not complete/);
 assert.match(el("attempts").innerHTML,/Ineligible: not accepted/);
});
test("route, channel and slider controls work",()=>{
 const {el}=boot(),before=el("lineA").attrs.d;
 el("route").onchange({target:{value:"1"}});
 assert.equal(el("scoreA").textContent,"2:08.040");
 assert.match(el("winner").textContent,/Exploratory/);
 assert.notEqual(el("lineA").attrs.d,before);
 el("channel").onchange({target:{value:"brake"}});
 assert.equal(el("unitsLabel").textContent,"Brake (%)");
 el("seek").oninput({target:{value:"73"}});
 assert.match(el("cursor").textContent,/73%/);
});
test("export stays labelled as simulated",()=>{
 const {el,downloads}=boot();el("export").onclick();
 assert.deepEqual(downloads,["splittime-synthetic-demo.csv"]);
});
