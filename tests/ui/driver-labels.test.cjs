"use strict";
// Two drivers share the site: every sidebar card, merged ones included, and
// the browse filter must say whose session it is.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../..');
const analysis=fs.readFileSync(path.join(root,'app/static/js/analysis.js'),'utf8');
const browseSrc=fs.readFileSync(path.join(root,'app/static/js/browse.js'),'utf8');
const cut=(src,from,to)=>{
 const a=src.indexOf(from),b=src.indexOf(to,a+1);
 assert.ok(a>=0&&b>a,'marker moved: '+from);return src.slice(a,b);
};
function cards(){
 const parts={};
 const el=()=>({dataset:{},textContent:"",prepend(){},append(){}});
 const ctx=vm.createContext({
  document:{createElement:el},
  $:(sel)=>(parts[sel]||=el()),
  cardBody(){},cardWrap:c=>c,selectGroup(){},selectSession(){},
  fmtDate:()=>"Oct 12",fmtLap:()=>"1:08.712",lapWord:()=>"laps",
  displayName:s=>s.route_name,
 });
 new vm.Script(cut(analysis,'const driverLabel','/* ---------------- sessions sidebar')+
  cut(analysis,'function groupCard(','function cardBody(')+
  cut(analysis,'function sessionCard(','  card.onclick = () => selectSession')+'}').runInContext(ctx);
 return {ctx,parts};
}
const mine={id:1,group_id:4,driver_id:'captn-compass',driver_name:'Captn Compass',
 route_name:'Narai-Juku Circuit',lap_count:1,best_lap:68.712,started_at:100};
test('a single session card opens with the driver name',()=>{
 const {ctx,parts}=cards();ctx.sessionCard(mine);
 assert.match(parts['.sub'].textContent,/^Captn Compass · /);
});
test('a merged group card opens with the driver name',()=>{
 const {ctx,parts}=cards();ctx.groupCard([mine],[mine,{...mine,id:2}]);
 assert.match(parts['.sub'].textContent,/^Captn Compass · Oct 12 · 2 sessions/);
});
test('falls back to the driver id, and to nothing for an unowned recording',()=>{
 const {ctx,parts}=cards();
 ctx.sessionCard({...mine,driver_name:null});
 assert.match(parts['.sub'].textContent,/^captn-compass · /);
 ctx.sessionCard({...mine,driver_name:null,driver_id:null});
 assert.doesNotMatch(parts['.sub'].textContent,/^ · |null|undefined/);
});
function browse(){
 const ctx=vm.createContext({localStorage:{getItem:()=>null,setItem(){}},Date});
 new vm.Script(browseSrc.slice(0,browseSrc.indexOf('const browseActive'))+
  ';this.api={FACETS,browse,browsePasses,browseMatchesText};').runInContext(ctx);
 return ctx.api;
}
test('Driver is the first filter and narrows the list to one driver',()=>{
 const {FACETS,browse:b,browsePasses}=browse();
 assert.equal(FACETS[0].key,'driver');assert.equal(FACETS[0].bar,true);
 const other={...mine,driver_id:'fishfighterns',driver_name:'FishFighterNS'};
 assert.equal(FACETS[0].text(other),'FishFighterNS');
 assert.equal(FACETS[0].text({driver_id:null}),'Unknown driver');
 assert.ok(browsePasses(mine)&&browsePasses(other));
 b.driver.add(FACETS[0].value(mine));
 assert.equal(browsePasses(mine),true);assert.equal(browsePasses(other),false);
 // a facet's own menu counts ignore its own selection
 assert.equal(browsePasses(other,'driver'),true);
});
test('typing a driver name in the search box finds their sessions',()=>{
 const {browseMatchesText}=browse();
 assert.equal(browseMatchesText(mine,'captn'),true);
 assert.equal(browseMatchesText(mine,'fishfighter'),false);
});
