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
// a minimal element tree: enough to run the real card builders and read
// back what ended up inside the title
function el(){
 return {dataset:{},className:"",textContent:"",children:[],
  append(...c){this.children.push(...c.filter(Boolean));},
  prepend(...c){this.children.unshift(...c);},insertAdjacentHTML(){}};
}
const find=(node,cls)=>{
 for(const c of node.children||[]){
  if(String(c.className).split(" ").includes(cls))return c;
  const hit=find(c,cls);if(hit)return hit;
 }
 return null;
};
function cards(picks=[]){
 const ctx=vm.createContext({
  document:{createElement:el},
  $:(sel,root)=>find(root,sel.slice(1)),
  state:{picks},
  trackBadge:()=>"",condBadge:()=>"",carChip:()=>el(),
  cardWrap:c=>c,selectGroup(){},selectSession(){},
  fmtDate:()=>"Oct 12",fmtLap:()=>"1:08.712",lapWord:()=>"laps",
  lapLabel:(k,n)=>"Lap "+n,
 });
 new vm.Script(cut(analysis,'function shortName(','/* The number a lap wears')+
  cut(analysis,'function chipLabel(','/* dirty-lap markers')+
  'const lapNo=(lap)=>lap.lap_number+1;'+
  cut(analysis,'function displayName(','/* Two drivers share this site')+
  cut(analysis,'/* Two drivers share this site','/* ---------------- sessions sidebar')+
  cut(analysis,'function groupCard(','/* A card is one button')+
  cut(analysis,'function sessionCard(','  card.onclick = () => selectSession')+'return card;}').runInContext(ctx);
 return ctx;
}
const mine={id:1,group_id:4,driver_id:'captn-compass',driver_name:'Captn Compass',
 route_name:'Narai-Juku Circuit',lap_count:1,best_lap:68.712,started_at:100};
const theirs={...mine,id:9,driver_id:'fishfighterns',driver_name:'FishFighterNS'};
const badge=card=>find(find(card,'title'),'driver-badge');
test('a session card shows the driver beside the track name',()=>{
 const card=cards().sessionCard(mine),title=find(card,'title');
 assert.equal(title.textContent,'Narai-Juku Circuit');
 assert.equal(badge(card).textContent,'Captn Compass');
 assert.doesNotMatch(find(card,'sub').textContent,/Captn Compass/); // once, not twice
});
test('a merged group card shows the driver beside the track name',()=>{
 const card=cards().groupCard([mine],[mine,{...mine,id:2}]);
 assert.equal(badge(card).textContent,'Captn Compass');
});
test('falls back to the driver id, and to no badge for an unowned recording',()=>{
 const ctx=cards();
 assert.equal(badge(ctx.sessionCard({...mine,driver_name:null})).textContent,'captn-compass');
 assert.equal(badge(ctx.sessionCard({...mine,driver_name:null,driver_id:null})),null);
});
test('picked laps are told apart by driver once both drivers are in the comparison',()=>{
 const lap={lap_number:0};
 const both=[{session:mine,lap},{session:theirs,lap}];
 const ctx=cards(both);
 assert.equal(ctx.chipLabel(both[0],true),'Captn Compass · L1');
 assert.equal(ctx.chipLabel(both[1],true),'FishFighterNS · L1');
 // one driver's own sessions keep the session name, which is what differs
 const solo=[{session:mine,lap},{session:{...mine,id:2,name:'Evening run'},lap}];
 assert.equal(cards(solo).chipLabel(solo[1],true),'Evening run · L1');
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
