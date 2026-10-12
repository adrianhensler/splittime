"use strict";
// The app is served under a URL prefix behind a gateway (ADR 16), so every
// request the pages make must be relative to the page. An absolute "/api/..."
// would hit the gateway's own API instead of this app.
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"../../app/static");
const files=[...fs.readdirSync(root).filter(f=>f.endsWith(".html")).map(f=>path.join(root,f)),
 ...fs.readdirSync(path.join(root,"js")).filter(f=>f.endsWith(".js")&&!/^uplot/i.test(f))
  .map(f=>path.join(root,"js",f))];
test("no page or script uses an absolute app URL",()=>{
 assert.ok(files.length>=8);
 const bad=[];
 for(const file of files){
  fs.readFileSync(file,"utf8").split("\n").forEach((line,i)=>{
   if(/["'`]\/(api|ws|js|css|static)\//.test(line)||/(href|src)="\/[^/]/.test(line))
    bad.push(path.relative(root,file)+":"+(i+1)+" "+line.trim().slice(0,90));
  });
 }
 assert.deepEqual(bad,[]);
});
