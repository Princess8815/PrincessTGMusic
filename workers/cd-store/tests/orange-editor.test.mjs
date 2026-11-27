import test from "node:test";
import assert from "node:assert/strict";
import {FEATURES} from "../../../script/orange-knock-down-core.mjs";
import {editorAction} from "../orange-editor.mjs";
const design={title:"Editor test",shots:5,two:1,three:3,pieces:[],oranges:[{x:500,y:300,branch:-1}]};
const id="00000000-0000-4000-8000-000000000001";
function fixture(){const root="documents",store=new Map(),writes=[];for(const [uid,role] of [["a","user"],["b","user"],["admin","admin"],["banned","banned"]])store.set("users/"+uid,{updateTime:"1",fields:{role:{stringValue:role},status:{stringValue:"active"}}});const read=async p=>store.get(p)||null,commit=async batch=>{writes.push(batch);for(const w of batch){if(w.update)store.set(w.update.name.slice(root.length+1),{updateTime:String(writes.length+1),fields:w.update.fields});if(w.delete)store.delete(w.delete.slice(root.length+1));}return true;};return {store,writes,call:(uid,input)=>editorAction({uid,input,read,commit,root,list:async()=>({documents:[]}),makeId:()=>id,clock:()=>0})};}
test("community creator can save, load, modify and delete; others cannot mutate",async()=>{const f=fixture();await assert.rejects(()=>f.call(null,{action:"save",design}));await assert.rejects(()=>f.call("banned",{action:"save",design}));assert.equal((await f.call("a",{action:"save",design})).id,id);assert.equal((await f.call(null,{action:"load",id})).design.title,design.title);await assert.rejects(()=>f.call("b",{action:"save",id,design}));await assert.rejects(()=>f.call("b",{action:"delete",id}));await f.call("a",{action:"save",id,design:{...design,title:"Changed"}});assert.equal((await f.call(null,{action:"load",id})).design.title,"Changed");await f.call("a",{action:"delete",id});assert.equal(f.store.has("orangeCommunityLevels/"+id),false);});
test("only staff can publish or alter unlock schedule, and locked pieces are rejected",async()=>{const f=fixture(),milestones=Object.fromEntries(FEATURES.map(f=>[f.id,f.level]));await assert.rejects(()=>f.call("a",{action:"publish",level:1,design}));await assert.rejects(()=>f.call("a",{action:"milestones",milestones}));const locked={...design,pieces:[{material:"steel",x:500,y:300,angle:0,length:100,supports:[]}]};await assert.rejects(()=>f.call("admin",{action:"publish",level:1,design:locked}));await f.call("admin",{action:"publish",level:1,design});assert.equal((await f.call(null,{action:"official",level:1})).design.title,design.title);milestones.steel=2;await f.call("admin",{action:"milestones",milestones});await f.call("admin",{action:"publish",level:2,design:locked});assert.equal((await f.call(null,{action:"config"})).milestones.steel,2);});

test("built-in official levels load in editor and staff edits take precedence",async()=>{
 const f=fixture();
 for(const level of [2,3,4]){const r=await f.call(null,{action:"official",level});assert.equal(r.builtIn,true);assert.ok(r.design.pieces.every(p=>p.material==="wood"));const edited={...r.design,title:"Edited "+level};await assert.rejects(()=>f.call("a",{action:"publish",level,design:edited}));await f.call("admin",{action:"publish",level,design:edited});const loaded=await f.call(null,{action:"official",level});assert.equal(loaded.builtIn,false);assert.equal(loaded.design.title,edited.title);}
});

test("glass starter levels are loadable and editable by staff",async()=>{const f=fixture();for(const level of [5,6,7,8,9]){const r=await f.call(null,{action:"official",level});assert.ok(r.design.pieces.some(p=>p.material==="glass"));await f.call("admin",{action:"publish",level,design:{...r.design,title:"Edited glass "+level}});assert.equal((await f.call(null,{action:"official",level})).design.title,"Edited glass "+level);}});

test("staff can promote a saved community map as an independent official snapshot",async()=>{
 const f=fixture();
 await f.call("a",{action:"save",design});
 await assert.rejects(()=>f.call("a",{action:"promote",id,level:1}));
 await f.call("admin",{action:"promote",id,level:1});
 const saved=f.store.get("orangeOfficialLevels/1").fields;
 assert.equal(saved.authorUid.stringValue,"a");assert.equal(saved.sourceCommunityId.stringValue,id);assert.equal(saved.publishedBy.stringValue,"admin");
 await f.call("a",{action:"save",id,design:{...design,title:"Changed later"}});
 assert.equal((await f.call(null,{action:"official",level:1})).design.title,design.title);
 await f.call("a",{action:"delete",id});assert.equal((await f.call(null,{action:"official",level:1})).design.title,design.title);
});
