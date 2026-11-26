
import test from "node:test";
import assert from "node:assert/strict";
import {builtInOrangeDesign,settleGravity,sceneMap,validateDesign,designMap,boardFromMap,stateMap,starRating,validateMilestones,checkDesignUnlocks,campaignMap,practiceOrange,orangeGameOver,ORANGE_TROPHY,hasOrangeMastery,WIDTH,GROUND,initialOrange,layout,freshLevel,simulateShot,applyOrange,validShot,fruiterChance,tangieChance,FEATURES,featureProgress,DESIGN_NAMES,bouncePad} from "../../../script/orange-knock-down-core.mjs";
import {orangeWithStorage,configuredOrangeLevel} from "../orange-knock-down.mjs";
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
 old.board.remaining=[0];const win=applyOrange(old,{kind:"shot",shot:{type:"sniper",target:0}},()=>.5);const next=applyOrange(win.state,{kind:"next"});assert.equal(next.state.layoutVersion,5);assert.deepEqual(next.state.board,freshLevel(2,123,5));
});
test("two-hit walls stop direct shots, reflectors reverse motion and resist blasts",()=>{
 const map={branches:[{id:0,x1:220,y1:290,x2:220,y2:480,hp:2,width:26,material:"wall"}],oranges:[{id:0,branch:-1,x:290,y:390}]},board={hp:[2],remaining:[0]},shot={type:"marina",angle:0,power:100};
 const a=simulateShot(map,board,shot,true);assert.equal(a.hp[0],1);assert.deepEqual(a.remaining,[0]);const b=simulateShot(map,{hp:a.hp,remaining:a.remaining},shot);assert.equal(b.hp[0],0);
 map.branches[0]={...map.branches[0],hp:1,reflect:true,material:"reflector"};const r=simulateShot(map,{hp:[1],remaining:[0]},shot,true);assert.equal(r.hp[0],1);assert.ok(r.events.some(e=>e.kind==="bounce"));assert.ok(r.frames.some((f,i)=>i>0&&f[0]&&r.frames[i-1][0]&&f[0].x<r.frames[i-1][0].x));assert.deepEqual(r.remaining,[0]);
 const blast=simulateShot(map,{hp:[1],remaining:[0]},{...shot,type:"sploder"});assert.equal(blast.hp[0],1);
});

test("feature progress is interval-based, reaches 100% only at milestone, and reveals in order",()=>{
 const a=featureProgress(0);assert.equal(a.latest.id,"wood");assert.equal(a.next.id,"glass");assert.equal(a.next.percent,0);
 assert.equal(featureProgress(1).next.percent,25);assert.equal(featureProgress(3).next.percent,75);assert.ok(featureProgress(4).features.find(f=>f.id==="glass").unlocked);assert.equal(featureProgress(4).next.id,"stone");
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

test("directional bounce pads obey reflection at arbitrary angles and preserve old boards",()=>{
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7);
 for(const degrees of [-75,-45,-12,0,30,45,90,135,179]){
  const angle=degrees*Math.PI/180,tx=Math.cos(angle),ty=Math.sin(angle),nx=-ty,ny=tx;
  const b={x1:100-tx*40,y1:100-ty*40,x2:100+tx*40,y2:100+ty*40,width:12};
  for(const sign of [-1,1]){
   const p={x:100+nx*20*sign,y:100+ny*20*sign,vx:tx*12-nx*9*sign,vy:ty*12-ny*9*sign,r:15};
   assert.ok(bouncePad(p,b));const speed=Math.hypot(p.vx,p.vy);
   near((p.vx*tx+p.vy*ty)/speed,12/15);near((p.vx*nx+p.vy*ny)/speed,sign*9/15);assert.ok(speed>15&&speed<=32);
  }
 }
 const old=layout(27,123,4).branches.filter(b=>b.trampoline);assert.equal(old.length,1);assert.equal(old[0].y1,old[0].y2);
 const pads=layout(40,123).branches.filter(b=>b.trampoline);assert.equal(pads.length,3);assert.ok(pads.some(b=>b.y1!==b.y2));assert.ok(pads.every(b=>b.directional&&b.reflect));
 const s=initialOrange(123);s.level=27;s.layoutVersion=4;s.board=freshLevel(27,123,4);assert.deepEqual(applyOrange(s,{kind:"retry"}).state.board,s.board);
});
test("two directional pads chain a bank shot around a barrier",()=>{
 // A horizontal incoming shot bounces up off a diagonal surface, then
 // a second diagonal surface sends it right toward a fruit.
 const pad=(id,x,y,deg)=>{const a=deg*Math.PI/180;return {id,x1:x-45*Math.cos(a),y1:y-45*Math.sin(a),x2:x+45*Math.cos(a),y2:y+45*Math.sin(a),width:12,hp:1,reflect:true,trampoline:true,directional:true};};
 const map={branches:[pad(0,260,400,-45),pad(1,216,220,-45)],oranges:[{id:0,branch:-1,x:390,y:220}]};
 const r=simulateShot(map,{hp:[1,1],remaining:[0]},{type:"marina",angle:0,power:90},true);
 const ids=r.events.filter(e=>e.trampoline).map(e=>e.padId);
 assert.ok(ids.includes(0));assert.ok(ids.includes(1));assert.deepEqual(r.hp,[1,1]);
});

test("orange mastery requires completing level 1000, not entering it, and awards once",async()=>{
 const root="documents",uid="orange-trophy",user="users/"+uid,path=user+"/privateGames/orangeKnockDown",dest=user+"/trophies/"+ORANGE_TROPHY[0];
 const s=initialOrange(123);s.level=1000;s.cleared=999;s.board=freshLevel(1000,s.seed);s.board.remaining=[0];
 assert.equal(hasOrangeMastery(s),false);
 const store=new Map([[user,{updateTime:"1",fields:{status:{stringValue:"active"}}}],[path,{updateTime:"2",fields:{payload:{stringValue:JSON.stringify({state:s})}}}]]);let commits=0;
 const read=async p=>store.get(p)||null,commit=async writes=>{commits++;for(const w of writes)if(w.update)store.set(w.update.name.slice(root.length+1),{updateTime:String(commits+2),fields:w.update.fields});return true;};
 const call=(kind,n,revision,extra={})=>orangeWithStorage({read,commit,root,uid,input:{kind,requestId:"00000000-0000-4000-8000-"+String(n).padStart(12,"0"),revision,...extra},clock:()=>1700000000000,rng:()=>.99});
 await call("state",1,0);assert.equal(store.has(dest),false);
 const win=await call("shot",2,0,{shot:{type:"sniper",target:0}});assert.equal(win.state.cleared,1000);assert.equal(win.coins,10);assert.ok(win.rewards.includes(ORANGE_TROPHY[0]));assert.ok(store.has(dest));assert.equal(store.has(user+"/axolotls/"+ORANGE_TROPHY[0]),false);
 const again=await call("shot",2,0,{shot:{type:"sniper",target:0}});assert.equal(again.wallet,win.wallet);assert.equal(commits,1);
 const next=await call("next",3,win.state.revision);assert.ok(!next.rewards.includes(ORANGE_TROPHY[0]));
 // Existing qualifying saves can backfill without changing their action revision.
 store.delete(dest);const saved=JSON.parse(store.get(path).fields.payload.stringValue);delete saved.state.level1000TrophyAwarded;store.get(path).fields.payload.stringValue=JSON.stringify(saved);
 const backfill=await call("state",4,saved.state.revision);assert.ok(backfill.rewards.includes(ORANGE_TROPHY[0]));assert.equal(backfill.state.revision,saved.state.revision);assert.ok(store.has(dest));
 const repeat=await call("state",5,saved.state.revision);assert.equal(repeat.rewards.length,0);assert.equal(commits,3);
});

test("last Marina throw ends the attempt even with specials, retry preserves specials",()=>{
 const s=initialOrange(123);s.board.marina=1;
 const miss=applyOrange(s,{kind:"shot",shot:{type:"marina",angle:-20,power:1}},()=>.99);
 assert.equal(miss.applied,true);assert.equal(miss.state.board.marina,0);assert.equal(orangeGameOver(miss.state.board),true);assert.equal(miss.coins,0);
 const special=applyOrange(miss.state,{kind:"shot",shot:{type:"sniper",target:miss.state.board.remaining[0]}});
 assert.equal(special.applied,false);assert.deepEqual(special.state.inventory,s.inventory);
 const retry=applyOrange(miss.state,{kind:"retry"});assert.equal(orangeGameOver(retry.state.board),false);assert.deepEqual(retry.state.board,freshLevel(1,s.seed));assert.deepEqual(retry.state.inventory,s.inventory);
});
test("clearing the orchard on the last Marina shot is a victory, not game over",()=>{
 const s=initialOrange(123);s.board.marina=1;const map=layout(1,s.seed);let shot=null;
 for(let angle=0;angle<=80&&!shot;angle+=4)for(let power=25;power<=100&&!shot;power+=5){
  const q={type:"marina",angle,power};if(!simulateShot(map,s.board,q).remaining.length)shot=q;
 }
 assert.ok(shot);
 const win=applyOrange(s,{kind:"shot",shot},()=>.99);assert.equal(win.state.board.marina,0);assert.equal(win.state.board.won,true);assert.equal(orangeGameOver(win.state.board),false);assert.equal(win.coins,10);
 assert.equal(applyOrange(win.state,{kind:"next"}).state.level,2);
});

const editorExample=()=>({title:"Bank shot",shots:5,two:1,three:3,pieces:[{material:"wood",x:400,y:360,angle:90,length:100,supports:[]},{material:"trampoline",x:600,y:320,angle:37,length:100,supports:[0]}],oranges:[{x:440,y:360,branch:0}]});
test("editor grid validation, arbitrary pad angle and support validation",()=>{
 const d=editorExample(),map=designMap(d);assert.equal(map.branches[1].directional,true);assert.equal(map.shots,5);assert.ok(map.branches[1].x1!==map.branches[1].x2&&map.branches[1].y1!==map.branches[1].y2);
 for(const corrupt of [d=>d.pieces[0].x=401,d=>d.pieces[0].length=0,d=>d.pieces[0].supports=[1],d=>d.oranges[0].branch=9,d=>d.three=5,d=>d.pieces[0].material="fake"]){const d=editorExample();corrupt(d);assert.throws(()=>validateDesign(d));}
});
test("official map snapshot survives retry and practice awards no rewards",()=>{
 const s=initialOrange(123);s.levelMap=designMap(editorExample());s.board=boardFromMap(s.levelMap);
 const miss=applyOrange(s,{kind:"shot",shot:{type:"marina",angle:-20,power:1}});assert.equal(miss.state.board.marina,4);
 const again=applyOrange(miss.state,{kind:"retry"});assert.deepEqual(again.state.board,s.board);assert.deepEqual(stateMap(again.state),s.levelMap);
 const win=practiceOrange(s,{kind:"shot",shot:{type:"sniper",target:0}});assert.equal(win.state.board.won,true);assert.equal(win.state.board.stars,3);assert.equal(win.coins,0);assert.deepEqual(win.rewards,[]);
 assert.equal(starRating(s.levelMap,{won:true,marina:2}),2);assert.equal(starRating(s.levelMap,{won:true,marina:0}),1);
});
test("custom feature schedule changes progress and generated availability",()=>{
 const config=Object.fromEntries(FEATURES.map(f=>[f.id,f.level]));config.trampoline=2;config.glass=100;validateMilestones(config);
 assert.equal(featureProgress(0,config).next.id,"trampoline");assert.equal(featureProgress(1,config).latest.id,"trampoline");assert.ok(campaignMap(2,123,config).branches.some(b=>b.trampoline));assert.ok(!campaignMap(30,123,config).branches.some(b=>b.material==="glass"));assert.throws(()=>checkDesignUnlocks(editorExample(),1,config));assert.ok(checkDesignUnlocks(editorExample(),2,config));
});
test("campaign uses official design from trusted storage only when entering level",async()=>{
 const s=initialOrange(123);s.level=27;
 const config=Object.fromEntries(FEATURES.map(f=>[f.id,f.level]));const d=editorExample();
 const docs={"orangeConfig/milestones":{fields:{payload:{stringValue:JSON.stringify(config)}}},"orangeOfficialLevels/27":{fields:{payload:{stringValue:JSON.stringify(d)}}}};
 await configuredOrangeLevel(async path=>docs[path]||null,s);assert.equal(s.levelMap.design,d.title);assert.equal(s.board.marina,5);
 docs["orangeOfficialLevels/27"].fields.payload.stringValue=JSON.stringify({...d,shots:10});const retry=applyOrange(s,{kind:"retry"});assert.equal(retry.state.board.marina,5);
});

test("campaign reset preserves paid inventory and lifetime reward eligibility but restarts progression",()=>{
 const s=initialOrange(123);s.level=11;s.cleared=10;s.inventory.sniper=7;s.levelMap=designMap(editorExample());s.board=boardFromMap(s.levelMap);s.milestones={wood:1};const r=applyOrange(s,{kind:"resetCampaign"});
 assert.equal(r.state.level,1);assert.equal(r.state.cleared,0);assert.equal(r.state.rewardedThrough,10);assert.deepEqual(r.state.inventory,s.inventory);assert.equal(r.state.levelMap,undefined);assert.deepEqual(r.state.board,freshLevel(1,s.seed));assert.equal(r.coins,0);
 r.state.board.remaining=[0];const win=applyOrange(r.state,{kind:"shot",shot:{type:"sniper",target:0}},()=>0);
 assert.equal(win.state.board.won,true);assert.equal(win.state.board.rewarded,false);assert.equal(win.state.cleared,1);assert.equal(win.coins,0);assert.deepEqual(win.rewards,[]);
 assert.equal(applyOrange(win.state,{kind:"resetCampaign"}).state.rewardedThrough,10);
 const later=applyOrange(win.state,{kind:"next"}).state;later.level=11;later.board=freshLevel(11,s.seed);later.board.remaining=[0];const first=applyOrange(later,{kind:"shot",shot:{type:"sniper",target:0}},()=>0);assert.equal(first.coins,10);assert.equal(first.state.rewardedThrough,11);assert.ok(first.rewards.includes("tangie"));
});
test("reset server transaction preserves wallet, loads official level one and is idempotent",async()=>{
 const root="documents",uid="reset-player",user="users/"+uid,path=user+"/privateGames/orangeKnockDown",wp=user+"/wallets/starCoins";
 const s=initialOrange(123);s.level=51;s.cleared=50;s.board=freshLevel(51,s.seed);s.inventory.sniper=5;s.revision=8;
 const design={...editorExample(),pieces:[],oranges:[{x:440,y:360,branch:-1}]};
 const store=new Map([[user,{updateTime:"1",fields:{status:{stringValue:"active"}}}],[path,{updateTime:"2",fields:{payload:{stringValue:JSON.stringify({state:s})}}}],[wp,{updateTime:"3",fields:{balance:{integerValue:"500"}}}],["orangeOfficialLevels/1",{fields:{payload:{stringValue:JSON.stringify(design)}}}]]);let commits=0;
 const read=async p=>store.get(p)||null,commit=async writes=>{commits++;for(const w of writes)if(w.update)store.set(w.update.name.slice(root.length+1),{updateTime:String(commits+3),fields:w.update.fields});return true;};
 const call=(kind,n,revision,extra={})=>orangeWithStorage({read,commit,root,uid,input:{kind,requestId:"00000000-0000-4000-8000-"+String(n).padStart(12,"0"),revision,...extra},configure:configuredOrangeLevel,rng:()=>0});
 const r=await call("resetCampaign",1,8);assert.equal(r.state.level,1);assert.equal(r.state.rewardedThrough,50);assert.equal(r.state.levelMap.design,design.title);assert.equal(r.wallet,500);assert.equal(r.state.inventory.sniper,5);assert.equal(r.state.revision,9);
 const repeat=await call("resetCampaign",1,8);assert.equal(repeat.state.revision,9);assert.equal(commits,1);
 const stale=await call("resetCampaign",2,8);assert.equal(stale.conflict,true);
 const win=await call("shot",3,9,{shot:{type:"sniper",target:0}});assert.equal(win.state.board.won,true);assert.equal(win.coins,0);assert.equal(win.wallet,500);assert.deepEqual(win.rewards,[]);
});

test("gravity settles unsupported pieces and fruit without clearing ground fruit at start",()=>{
 const d={title:"Gravity stack",gravity:true,shots:5,two:1,three:3,pieces:[{material:"wood",x:400,y:440,angle:0,length:100,supports:[]},{material:"wood",x:400,y:300,angle:0,length:100,supports:[]}],oranges:[{x:400,y:180,branch:-1},{x:660,y:200,branch:-1}]};
 const map=designMap(d),board=boardFromMap(map),scene=sceneMap(map,board);
 assert.equal(scene.branches[0].y1,GROUND-6);assert.equal(scene.branches[1].y1,GROUND-18);assert.equal(scene.oranges[0].y,GROUND-38);assert.equal(scene.oranges[1].y,GROUND-14);assert.equal(board.remaining.length,2);
 assert.deepEqual(settleGravity(map,board),{pieceOffsets:board.pieceOffsets,orangeOffsets:board.orangeOffsets});
});
test("gravity collapse preserves intact beams, drops debris and persists settled poses",()=>{
 const d={title:"Gravity collapse",gravity:true,shots:5,two:1,three:3,pieces:[{material:"wood",x:400,y:400,angle:90,length:160,supports:[]},{material:"steel",x:400,y:220,angle:0,length:100,supports:[0]}],oranges:[{x:400,y:160,branch:1},{x:700,y:300,branch:-1}]};
 const map=designMap(d),board=boardFromMap(map);let shot,result;
 for(let a=-20;a<=80&&!shot;a+=2)for(let p=25;p<=100&&!shot;p+=5){const q={type:"marina",angle:a,power:p},r=simulateShot(map,board,q);if(r.hp[0]===0&&r.hp[1]>0){shot=q;result=r;}}
 assert.ok(shot);assert.ok(result.events.some(e=>e.kind==="debris"));assert.ok(result.pieceOffsets[1]>board.pieceOffsets[1]);assert.ok(result.hp[1]>0);assert.deepEqual(result,simulateShot(map,board,shot));
 const s=initialOrange(123);s.levelMap=map;s.board=board;const out=applyOrange(s,{kind:"shot",shot},()=>.99);assert.deepEqual(out.state.board.pieceOffsets,result.pieceOffsets);
});

test("handcrafted wooden levels have fixed geometry, valid gravity, Marina-only solutions and override priority",async()=>{
 const solutions={"2":[{"type":"marina","angle":2,"power":100},{"type":"marina","angle":18,"power":95}],"3":[{"type":"marina","angle":76,"power":90},{"type":"marina","angle":-4,"power":95}],"4":[{"type":"marina","angle":28,"power":90}]};
 for(const level of [2,3,4]){
  const s=initialOrange(123);s.level=level;s.cleared=level-1;
  await configuredOrangeLevel(async()=>null,s);
  const d=builtInOrangeDesign(level);assert.deepEqual(s.levelMap,designMap(d));assert.ok(s.levelMap.branches.every(b=>b.material==="wood"));assert.equal(s.board.remaining.length,d.oranges.length);
  let state=s;for(const shot of solutions[level]){const result=applyOrange(state,{kind:"shot",shot},()=>.99);assert.equal(result.applied,true);state=result.state;}
  assert.equal(state.board.won,true);assert.ok(state.board.stars>=1);
  const changed={...d,title:"Owner edit"};await configuredOrangeLevel(async path=>path==="orangeOfficialLevels/"+level?{fields:{payload:{stringValue:JSON.stringify(changed)}}}:null,s);assert.equal(s.levelMap.design,"Owner edit");
 }
});
