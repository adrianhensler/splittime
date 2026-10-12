"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../app/static/js/analysis.js'),'utf8');
// Run the actual pure grouping functions without booting charts or a synthetic DOM.
const suggestions=source.slice(source.indexOf('function mergeSuggestions()'),source.indexOf('function dismissMerges('));
const candidates=source.slice(source.indexOf('function mergeCandidates('),source.indexOf('async function mergeRuns('));
function groups(rows){
 const ctx=vm.createContext({state:{allSessions:rows},localStorage:{getItem:()=>null}});
 new vm.Script(suggestions+candidates).runInContext(ctx);
 return ctx;
}
function row(id,driver){return {id,driver_id:driver,route_id:17,car_ordinal:269,started_at:id*60,group_id:null};}
test('automatic sittings and manual candidates stay within each driver',()=>{
 const rows=[row(1,'a'),row(2,'b'),row(3,'a'),row(4,'b')],ctx=groups(rows);
 assert.equal(JSON.stringify(ctx.mergeSuggestions().map(x=>x.cluster.map(s=>s.id))),JSON.stringify([[1,3],[2,4]]));
 assert.equal(JSON.stringify(ctx.mergeCandidates(rows[0]).map(s=>s.id)),JSON.stringify([1,3]));
});
test('legacy recordings group together but never with a configured driver',()=>{
 const rows=[row(1,null),row(2,'legacy'),row(3,'a')],ctx=groups(rows);
 assert.equal(JSON.stringify(ctx.mergeCandidates(rows[0]).map(s=>s.id)),JSON.stringify([1,2]));
});
