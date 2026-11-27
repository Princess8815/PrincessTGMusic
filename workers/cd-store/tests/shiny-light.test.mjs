import test from "node:test";
import assert from "node:assert/strict";
import {defaultMilestones,validateDesign,proceduralDesign,initialBoard,settleLight,applyMove,difficulty,shinyChance,fruiterChance} from "../../../script/shiny-light-core.mjs";
import {shinyGameAction,shinyEditorAction} from "../shiny-light.mjs";
const tile=(i,type,more={})=>({i,type,...more});
const map=(tiles,stars=[1,2,3],coin=null,w=5,h=5)=>validateDesign({title:"test",width:w,height:h,tiles,stars,coin},1000,defaultMilestones(),false);
const light=d=>settleLight(d,initialBoard(d));
test("RGB adds red and green; exact color gates and filters",()=>{
 const d=map([tile(0,"source",{dir:1,power:3}),tile(1,"changer",{color:1}),tile(2,"changer",{color:2}),tile(3,"colorDoor",{color:3}),tile(4,"coloredFruit",{color:3})]);
 assert.equal(light(d).won,true);
 const bad={...d,tiles:d.tiles.map(t=>t.i===3?{...t,color:5}:t)};assert.equal(light(bad).won,false);
 const f=map([tile(0,"source",{dir:1}),tile(1,"changer",{color:3}),tile(2,"filter",{color:1}),tile(3,"colorDoor",{color:2}),tile(4,"coloredFruit",{color:2})]);assert.equal(light(f).won,true);
});
test("ice pushes only on its axis; mirrors rotate and movable pieces slide only on their axis",()=>{
 const d=map([tile(0,"source",{dir:1}),tile(1,"ice",{axis:"h"}),tile(4,"fruit"),tile(10,"movingMirror",{axis:"h"})],[5,6,7]);
 assert.equal(light(d).board.tiles.find(t=>t.type==="ice").i,3);
 assert.throws(()=>applyMove(d,initialBoard(d),{kind:"move",i:1,dir:1}));
 assert.throws(()=>applyMove(d,initialBoard(d),{kind:"move",i:10,dir:0}));
 const moved=applyMove(d,initialBoard(d),{kind:"move",i:10,dir:1});assert.ok(moved.board.tiles.some(t=>t.i===11&&t.type==="movingMirror"));
 const v={...d,tiles:d.tiles.map(t=>t.type==="ice"?{...t,axis:"v"}:t)};assert.equal(light(v).board.tiles.find(t=>t.type==="ice").i,1);
});
test("latched and continuous switches, intensity and multi-condition doors",()=>{
 const d=map([tile(0,"source",{dir:1,power:3}),tile(1,"button",{id:"A"}),tile(2,"buttonDoor",{id:"A"}),tile(3,"lightDoor",{power:3}),tile(4,"fruit")]);const r=light(d);assert.equal(r.won,true);assert.deepEqual(r.board.latched,["A"]);
 const q=map([tile(0,"source",{dir:1,power:3}),tile(1,"continuous",{id:"B"}),tile(2,"changer",{color:1}),tile(3,"multiDoor",{buttons:["B"],power:3,color:1}),tile(4,"fruit")]);assert.equal(light(q).won,true);assert.deepEqual(light(q).continuous,["B"]);
 const inv=map([tile(0,"source",{dir:1}),tile(1,"button",{id:"A"}),tile(2,"invertedDoor",{id:"A"}),tile(4,"fruit")]);assert.equal(light(inv).won,false);
 const pow=map([tile(0,"source",{dir:1,power:2}),tile(1,"dampener",{power:1}),tile(2,"amplifier",{power:3}),tile(3,"lightDoor",{power:4}),tile(4,"fruit")]);assert.equal(light(pow).won,true);
});
test("T and cross beams emit distinct outgoing branches and fruit must be simultaneous",()=>{
 const d=map([tile(10,"source",{dir:1}),tile(12,"tee"),tile(2,"fruit"),tile(22,"fruit")],[7,17,11]);assert.equal(light(d).won,true);
 const cross=map([...d.tiles.filter(t=>t.type!=="tee"),tile(12,"cross"),tile(14,"fruit")],[7,17,11]);assert.equal(light(cross).won,true);
 const tee={...cross,tiles:cross.tiles.map(t=>t.type==="cross"?{...t,type:"tee"}:t)};assert.equal(light(tee).won,false);
});
test("portals, rotating portals, linked mirrors and black-hole resets",()=>{
 const d=map([tile(0,"source",{dir:1}),tile(1,"portal",{id:"P"}),tile(20,"portal",{id:"P"}),tile(24,"fruit")],[1,20,23]);assert.equal(light(d).won,true);
 const q=map([tile(0,"source",{dir:1}),tile(1,"rotatingPortal",{id:"P",dir:0}),tile(10,"rotatingPortal",{id:"P",dir:1}),tile(20,"fruit")],[1,10,15]);assert.equal(light(q).won,true);
 const linked=map([tile(0,"source",{dir:1}),tile(4,"linked",{id:"L",dir:0}),tile(24,"linked",{id:"L",dir:1}),tile(20,"fruit")],[1,9,23]);const r=applyMove(linked,initialBoard(linked),{kind:"rotate",i:4});assert.deepEqual(r.board.tiles.filter(t=>t.type==="linked").map(t=>t.dir),[1,2]);
 const black=map([tile(0,"source",{dir:1}),tile(1,"mirror",{dir:0}),tile(6,"blackHole"),tile(24,"fruit")],[2,3,4]);const z=applyMove(black,initialBoard(black),{kind:"rotate",i:1});assert.equal(z.black,true);assert.deepEqual(z.board,initialBoard(black));
});
test("combiner merges separate directions and adds intensity",()=>{
 const d=map([tile(14,"source",{dir:1,power:2}),tile(15,"cross"),tile(1,"mirror",{dir:0}),tile(4,"mirror",{dir:1}),tile(18,"combiner",{dir:1}),tile(19,"lightDoor",{power:4}),tile(20,"fruit")],[8,16,20],null,7,5);
 assert.equal(light(d).won,true);
 const bad={...d,tiles:d.tiles.map(t=>t.i===4?{...t,dir:0}:t)};assert.equal(light(bad).won,false);
});
test("procedural fallback solvability, grid range and difficulty schedule",()=>{
 for(const l of [...Array.from({length:250},(_,i)=>i+1),1000,10000,1000000]){
  const solved=proceduralDesign(l,defaultMilestones(),true),r=light(solved);assert.ok(solved.width>=3&&solved.width<=15);assert.equal(r.won,true);assert.equal(r.stars.length,3);assert.equal(light(proceduralDesign(l)).won,false);
 }
 assert.equal(difficulty(14),"normal");assert.equal(difficulty(24),"hard");assert.equal(difficulty(29),"super-hard");assert.equal(difficulty(34),"hard");assert.equal(difficulty(39),"super-hard");
 assert.equal(shinyChance(10),0);assert.ok(shinyChance(11)>0);assert.ok(fruiterChance(2)>fruiterChance(1));
});
test("trusted reward commits are idempotent, replay/reset cannot duplicate coins and stars reset",async()=>{
 const uid="test-user",user="users/"+uid,root="docs",wp=user+"/wallets/starCoins";
 const design=map([tile(0,"source",{dir:1}),tile(2,"fruit")],[1,2,4],1,3,3);
 const json=x=>({fields:{payload:{stringValue:JSON.stringify(x)}},updateTime:"0"});
 const docs=new Map([[user,{fields:{status:{stringValue:"active"},role:{stringValue:"user"}},updateTime:"0"}],["shinyLightLevels/1",json(design)]]);
 let commits=0;
 const read=async k=>docs.get(k)||null,commit=async writes=>{commits++;for(const w of writes){if(w.update)docs.set(w.update.name.slice(root.length+1),{fields:w.update.fields,updateTime:String(commits)});if(w.delete)docs.delete(w.delete.slice(root.length+1));}return true;};
 const call=(kind,n,revision,extra={})=>shinyGameAction({read,commit,root,uid,input:{kind,requestId:"00000000-0000-4000-8000-"+String(n).padStart(12,"0"),revision,...extra},rng:()=>.99});
 let r=await call("state",0,0);assert.equal(r.wallet,0);
 r=await call("check",1,0);assert.equal(r.coins,11);assert.equal(r.state.totalStars,2);assert.equal(r.wallet,11);
 const prior=commits;r=await call("check",1,0);assert.equal(r.wallet,11);assert.equal(commits,prior);
 r=await call("resetCampaign",2,1);assert.equal(r.state.totalStars,0);assert.equal(r.wallet,11);
 r=await call("check",3,2);assert.equal(r.state.totalStars,2);assert.equal(r.coins,0);assert.equal(r.wallet,11);
 assert.equal(Number(docs.get(wp).fields.balance.integerValue),11);
 await assert.rejects(()=>shinyEditorAction({read,commit,root,uid,input:{action:"config"}}),/Administrator/);
});
