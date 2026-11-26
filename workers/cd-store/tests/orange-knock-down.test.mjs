
import test from "node:test";
import assert from "node:assert/strict";
import {WIDTH,GROUND,initialOrange,layout,freshLevel,simulateShot,applyOrange,validShot,fruiterChance,tangieChance,FEATURES,featureProgress,DESIGN_NAMES} from "../../../script/orange-knock-down-core.mjs";
import {orangeWithStorage} from "../orange-knock-down.mjs";
test("starter pack and increasing orchard",()=>{
 const s=initialOrange(123);assert.deepEqual(s.inventory,{aqualily:3,bulky:3,sploder:3,sniper:3});assert.ok(s.board.marina>=5);assert.ok(layout(30,123).branches.length>layout(1,123).branches.length);assert.ok(layout(30,123).branches.some(b=>b.hp===2));assert.deepEqual(layout(10,123),layout(10,123));
});
test("deterministic replay ignores client damage",()=>{
 const s=initialOrange(123),map=layout(1,s.seed),shot={type:"marina",angle:35,power:80},a=simulateShot(map,s.board,shot,true),b=simulateShot(map,s.board,shot);
 assert.deepEqual(a.hp,b.hp);assert.deepEqual(a.remaining,b.remaining);assert.deepEqual(a.events,b.events);assert.ok(a.frames.length>0);assert.equal(validShot({type:"marina",angle:500,power:100}),false);
 const r=applyOrange(s,{kind:"shot",shot:{...shot,damage:999,remaining:[]}},()=>.5);assert.equal(r.state.board.marina,s.board.marina-1);assert.deepEqual(r.state.board.remaining,b.remaining);assert.equal(s.board.marina,layout(1,123).shots);
});
test("split, heavy, burst and sniper powers",()=>{
 const s=initialOrange(123),map=layout(1,s.seed);assert.equal(simulateShot(map,s.board,{type:"aqualily",angle:35,power:80},true).frames[0].length,3);
 const custom={branches:[{id:0,x1:200,y1:390,x2:300,y2:390,hp:2}],oranges:[{id:0,branch:0,x:230,y:414},{id:1,branch:0,x:270,y:414}]},board={hp:[2],remaining:[0,1],marina:5,won:false},hit={angle:0,power:100};
 assert.equal(simulateShot(custom,board,{type:"bulky",...hit}).hp[0],0);assert.equal(simulateShot(custom,board,{type:"sploder",...hit}).remaining.length,0);assert.equal(simulateShot(custom,board,{type:"marina",...hit}).hp[0],1);
 assert.equal(simulateShot(map,s.board,{type:"sniper",target:0}).remaining.length,s.board.remaining.length-1);
});
test("charges persist, retry restores Marina only",()=>{
 const s=initialOrange(123);let r=applyOrange(s,{kind:"shot",shot:{type:"sniper",target:0}});assert.equal(r.state.inventory.sniper,2);assert.equal(r.state.board.marina,s.board.marina);
 r=applyOrange(r.state,{kind:"retry"});assert.equal(r.state.inventory.sniper,2);assert.deepEqual(r.state.board,s.board);
 r=applyOrange(r.state,{kind:"buy",type:"sniper"});assert.equal(r.coins,-100);assert.equal(r.state.inventory.sniper,3);
 r.state.inventory.sniper=0;assert.equal(applyOrange(r.state,{kind:"shot",shot:{type:"sniper",target:0}}).applied,false);
});
test("reward gates and no repeated level awards",()=>{
 const s=initialOrange(123);s.board.remaining=[0];let r=applyOrange(s,{kind:"shot",shot:{type:"sniper",target:0}},()=>0);assert.equal(r.coins,10);assert.deepEqual(r.rewards,["fruiter"]);assert.equal(applyOrange(r.state,{kind:"retry"}).applied,false);assert.equal(applyOrange(r.state,{kind:"shot",shot:{type:"sniper",target:0}}).coins,0);
 r=applyOrange(r.state,{kind:"next"});assert.equal(r.state.level,2);assert.equal(r.state.inventory.sniper,2);
 s.level=11;s.board=freshLevel(11,s.seed);s.board.remaining=[0];r=applyOrange(s,{kind:"shot",shot:{type:"sniper",target:0}},()=>0);assert.deepEqual(r.rewards,["fruiter","tangie"]);
 assert.equal(fruiterChance(1),1/10000);assert.ok(fruiterChance(2)>fruiterChance(1));assert.equal(tangieChance(10),0);
});
test("atomic and idempotent wallet, stale requests",async()=>{
 const root="documents",uid="u",user="users/u",path=user+"/privateGames/orangeKnockDown",wp=user+"/wallets/starCoins";
 const store=new Map([[user,{updateTime:"1",fields:{status:{stringValue:"active"}}}],[wp,{updateTime:"2",fields:{balance:{integerValue:"150"}}}]]);let commits=0;
 const read=async p=>store.get(p)||null,commit=async writes=>{commits++;for(const w of writes)if(w.update)store.set(w.update.name.slice(root.length+1),{updateTime:String(commits+2),fields:w.update.fields});return true;};
 const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
 const call=(kind,n,revision,extra={})=>orangeWithStorage({read,commit,root,uid,input:{kind,requestId:id(n),revision,...extra},seed:()=>123,rng:()=>0,clock:()=>1700000000000});
 const a=await call("state",1,0);assert.equal(a.state.inventory.sniper,3);
 const b=await call("buy",2,0,{type:"sniper"});assert.equal(b.wallet,50);assert.equal(b.state.inventory.sniper,4);
 const again=await call("buy",2,0,{type:"sniper"});assert.equal(again.wallet,50);assert.equal(commits,2);
 const poor=await call("buy",3,b.state.revision,{type:"bulky"});assert.equal(poor.applied,false);assert.equal(commits,2);
 const stale=await call("shot",4,0,{shot:{type:"sniper",target:0}});assert.equal(stale.conflict,true);
 const rec=JSON.parse(store.get(path).fields.payload.stringValue);rec.state.board.remaining=[0];store.get(path).fields.payload.stringValue=JSON.stringify(rec);
 const win=await call("shot",5,b.state.revision,{shot:{type:"sniper",target:0}});assert.equal(win.wallet,60);assert.ok(store.has(user+"/axolotls/fruiter"));
 const replay=await call("shot",5,b.state.revision,{shot:{type:"sniper",target:0}});assert.equal(replay.wallet,60);assert.equal(commits,3);
});

test("materials unlock progressively, support collapse and legacy saves are preserved",()=>{
 const m=l=>new Set(layout(l,123).branches.map(b=>b.material));
 assert.ok(m(1).has("wood"));assert.ok(!m(1).has("wall"));assert.ok(m(3).has("glass"));assert.ok(m(5).has("wall"));assert.ok(m(8).has("stone"));assert.ok(m(12).has("reflector"));assert.ok(m(16).has("steel"));
 const map={branches:[{id:0,x1:200,y1:360,x2:200,y2:450,hp:1,width:12},{id:1,x1:200,y1:360,x2:300,y2:360,hp:3,supports:[0]}],oranges:[{id:0,branch:1,x:260,y:339}]};
 const result=simulateShot(map,{hp:[1,3],remaining:[0]},{type:"marina",angle:0,power:100});
 assert.deepEqual(result.hp,[0,0]);assert.equal(result.remaining.length,0);
 const old=initialOrange(123);delete old.layoutVersion;old.version=1;old.board=freshLevel(1,123,1);
 const retry=applyOrange(old,{kind:"retry"});assert.deepEqual(retry.state.board,old.board);
 old.board.remaining=[0];const win=applyOrange(old,{kind:"shot",shot:{type:"sniper",target:0}},()=>.5);const next=applyOrange(win.state,{kind:"next"});assert.equal(next.state.layoutVersion,4);assert.deepEqual(next.state.board,freshLevel(2,123,4));
});
test("two-hit walls stop direct shots, reflectors reverse motion and resist blasts",()=>{
 const map={branches:[{id:0,x1:220,y1:290,x2:220,y2:480,hp:2,width:26,material:"wall"}],oranges:[{id:0,branch:-1,x:290,y:390}]},board={hp:[2],remaining:[0]},shot={type:"marina",angle:0,power:100};
 const a=simulateShot(map,board,shot,true);assert.equal(a.hp[0],1);assert.deepEqual(a.remaining,[0]);const b=simulateShot(map,{hp:a.hp,remaining:a.remaining},shot);assert.equal(b.hp[0],0);
 map.branches[0]={...map.branches[0],hp:1,reflect:true,material:"reflector"};const r=simulateShot(map,{hp:[1],remaining:[0]},shot,true);assert.equal(r.hp[0],1);assert.ok(r.events.some(e=>e.kind==="bounce"));assert.ok(r.frames.some((f,i)=>i>0&&f[0]&&r.frames[i-1][0]&&f[0].x<r.frames[i-1][0].x));assert.deepEqual(r.remaining,[0]);
 const blast=simulateShot(map,{hp:[1],remaining:[0]},{...shot,type:"sploder"});assert.equal(blast.hp[0],1);
});

test("feature progress is interval-based, reaches 100% only at milestone, and reveals in order",()=>{
 const a=featureProgress(0);assert.equal(a.latest.id,"wood");assert.equal(a.next.id,"glass");assert.equal(a.next.percent,0);
 assert.equal(featureProgress(1).next.percent,50);assert.equal(featureProgress(2).latest.id,"glass");assert.equal(featureProgress(3).next.percent,50);
 assert.equal(featureProgress(35).latest.id,"crate");assert.equal(featureProgress(35).next,null);
});
test("varied puzzle families, valid structures, deterministic maps and old-layout compatibility",()=>{
 const names=new Set();
 for(let l=1;l<=60;l++){const m=layout(l,123);names.add(m.design);assert.deepEqual(m,layout(l,123));assert.ok(m.oranges.length<=32);assert.ok(m.oranges.every(o=>o.x>=0&&o.x<=WIDTH&&o.y>=0&&o.y<GROUND&&m.branches[o.branch]));assert.ok(m.branches.every((b,i)=>b.id===i&&b.supports.every(x=>x!==i&&m.branches[x])));}
 assert.equal(names.size,DESIGN_NAMES.length);
 const old=initialOrange(123);old.version=2;old.layoutVersion=2;old.board=freshLevel(1,123,2);assert.deepEqual(applyOrange(old,{kind:"retry"}).state.board,old.board);
});
test("spring bounce boosts speed and burst crates chain without damaging reflectors",()=>{
 const map={branches:[{id:0,x1:220,y1:290,x2:220,y2:480,hp:1,width:19,reflect:true,spring:true}],oranges:[{id:0,branch:-1,x:400,y:390}]};
 const shot={type:"marina",angle:0,power:70},result=simulateShot(map,{hp:[1],remaining:[0]},shot,true);
 assert.ok(result.events.some(e=>e.kind==="bounce"&&e.spring));assert.equal(result.hp[0],1);
 const crates={branches:[{id:0,x1:200,y1:370,x2:200,y2:420,hp:1,burst:true},{id:1,x1:290,y1:370,x2:290,y2:420,hp:1,burst:true},{id:2,x1:380,y1:370,x2:380,y2:420,hp:1,reflect:true}],oranges:[{id:0,branch:-1,x:400,y:400}]};
 const r=simulateShot(crates,{hp:[1,1,1],remaining:[0]},{type:"marina",angle:0,power:100});assert.deepEqual(r.hp,[0,0,1]);assert.equal(r.remaining.length,0);assert.equal(r.events.filter(e=>e.kind==="blast").length,2);
});

test("trampolines unlock at 27, preserve v3 layouts, and boost falling shots upward without taking damage",()=>{
 assert.ok(!layout(26,123).branches.some(b=>b.trampoline));assert.ok(layout(27,123).branches.some(b=>b.trampoline));assert.ok(!layout(27,123,3).branches.some(b=>b.trampoline));
 assert.equal(featureProgress(25).next.id,"trampoline");assert.equal(featureProgress(25).next.percent,66);assert.equal(featureProgress(26).latest.id,"trampoline");
 const pad={id:0,x1:230,y1:465,x2:340,y2:465,width:12,hp:1,reflect:true,trampoline:true};
 const map={branches:[pad],oranges:[{id:0,branch:-1,x:560,y:220}]};
 const result=simulateShot(map,{hp:[1],remaining:[0]},{type:"marina",angle:-12,power:45},true);
 const event=result.events.find(e=>e.trampoline);assert.ok(event);assert.equal(result.hp[0],1);
 assert.ok(result.frames.slice(event.t+1).some(frame=>frame[0]&&frame[0].y<event.y-100));
 const old=initialOrange(123);old.level=27;old.layoutVersion=3;old.board=freshLevel(27,123,3);
 assert.deepEqual(applyOrange(old,{kind:"retry"}).state.board,old.board);
});
