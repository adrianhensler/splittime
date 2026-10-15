"use strict";
// Analysis "Hide discarded": finished sessions with no timed lap (menus,
// result screens, given-up runs kept for diagnosis) can be hidden from the
// list, the choice persists, and a session still recording always shows.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../..');
const browseSrc=fs.readFileSync(path.join(root,'app/static/js/browse.js'),'utf8');
const html=fs.readFileSync(path.join(root,'app/static/analysis.html'),'utf8');

function load(saved){
 const store={ls_browse:saved===undefined?null:JSON.stringify(saved)};
 const ctx=vm.createContext({localStorage:{getItem:k=>store[k]??null,setItem(k,v){store[k]=v;}},Date});
 new vm.Script(browseSrc.slice(0,browseSrc.indexOf('const browseActive'))+
  ';this.api={browse,browsePasses,saveBrowse,isDiscarded,HIDE_DISCARDED_DEFAULT};').runInContext(ctx);
 return {...ctx.api,store};
}
const timed={id:1,started_at:1,ended_at:2,lap_count:2};
const empty={id:2,started_at:3,ended_at:4,lap_count:0};
const live={id:3,started_at:5,ended_at:null,lap_count:0};

test('a finished session with no timed lap is discarded; a live one is not',()=>{
 const {isDiscarded}=load();
 assert.equal(isDiscarded(empty),true);
 assert.equal(isDiscarded(timed),false);
 assert.equal(isDiscarded(live),false);
 // a row without a lap count (older payloads) is never hidden
 assert.equal(isDiscarded({id:4,ended_at:2}),false);
});

test('switched on, the option hides discarded sessions only',()=>{
 const {browse,browsePasses}=load();
 browse.hideDiscarded=true;
 assert.equal(browsePasses(empty),false);
 assert.equal(browsePasses(timed),true);
 assert.equal(browsePasses(live),true);
 browse.hideDiscarded=false;
 assert.equal(browsePasses(empty),true);
});

test('the choice is remembered across reloads',()=>{
 const a=load();
 a.browse.hideDiscarded=!a.HIDE_DISCARDED_DEFAULT;
 a.saveBrowse();
 const b=load(JSON.parse(a.store.ls_browse));
 assert.equal(b.browse.hideDiscarded,!a.HIDE_DISCARDED_DEFAULT);
 // a junk stored value falls back to the default
 assert.equal(load({hideDiscarded:'yes'}).browse.hideDiscarded,a.HIDE_DISCARDED_DEFAULT);
});

test('the toggle is a visible button in the bar, not hidden in More',()=>{
 assert.match(html,/<button id="browse-hide"[^>]*>Hide discarded<\/button>/);
});

test('hidden by default on a first visit',()=>{
 const {browse,browsePasses,HIDE_DISCARDED_DEFAULT}=load();
 assert.equal(HIDE_DISCARDED_DEFAULT,true);
 assert.equal(browse.hideDiscarded,true);
 assert.equal(browsePasses(empty),false);
 // a visitor who switched it off keeps it off
 assert.equal(load({hideDiscarded:false}).browse.hideDiscarded,false);
});
