
import test from "node:test";
import assert from "node:assert/strict";
import {initialEmpire,makeTree,advance,applyAction,fruitInterval,autoInterval,starChance,caps,yieldPerFruit,treePrice,treeCapacity,slotsPerGrowth,prestigeMultiplier,starMultiplier,starMultiplierUnits,starFraction,STAR_SCALE,upgradePrice,prestigeReady,hasMastery,CHERRY_TROPHY,chanceAtLeastOne,rewardCandidates,binomial,FRUITER_CHANCE} from "../../../script/cherry-empire-core.mjs";
import {orchardWithStorage} from "../cherry-empire.mjs";
const NOW=1700000000000;
test("manual fruit accumulates offline; harvesting many fruits counts as one harvest",()=>{
 const s=initialEmpire(NOW),a=advance(s,NOW+300000,()=>1);
 assert.equal(a.state.trees[0].fruit,10);assert.equal(a.state.cherries,0);assert.equal(a.state.trees[0].pendingStars,1);
 const h=applyAction(a.state,{kind:"harvest",treeId:1},NOW+300000);
 assert.equal(h.state.cherries,10);assert.equal(h.effects.harvests,1);assert.equal(h.effects.coins,1);assert.equal(h.state.trees[0].fruit,0);
 const again=applyAction(h.state,{kind:"harvest",treeId:1},NOW+300000);
 assert.equal(again.effects.harvests,0);assert.equal(again.applied,false);
});
test("offline auto harvests count events, not cherries, and keep leftovers",()=>{
 const s=initialEmpire(NOW);s.cherries=100;
 const a=applyAction(s,{kind:"upgrade",treeId:1,upgrade:"auto"},NOW).state;
 const h=advance(a,NOW+370000);
 assert.equal(h.effects.harvests,3);assert.equal(h.effects.cherries,12);assert.equal(h.state.trees[0].fruit,0);
 const later=advance(h.state,NOW+400000);assert.equal(later.state.trees[0].fruit,1);
 const split=advance(advance(a,NOW+150000).state,NOW+400000).state;
 assert.deepEqual(split,later.state);
});
test("second tree matures on its own clock and unlock eligibility starts after planting",()=>{
 const s=initialEmpire(NOW);s.cherries=treePrice(1);
 const p=applyAction(s,{kind:"buyTree"},NOW);
 assert.equal(p.state.trees.length,2);assert.equal(p.state.cherries,0);
 const t=p.state.trees[1];assert.equal(t.matureAt,NOW+600000);
 const a=advance(p.state,t.matureAt-1);assert.equal(a.state.trees[1].fruit,0);
 const b=applyAction(p.state,{kind:"harvest",treeId:1},NOW+30000);
 assert.equal(b.effects.eligibleHarvests,1);assert.equal(b.effects.harvests,1);
 assert.equal(advance(p.state,t.nextFruitAt).state.trees[1].fruit,1);
});
test("prestige resets normal upgrades, retains star chance, grows longer and raises caps",()=>{
 const s=initialEmpire(NOW),t=s.trees[0];s.cherries=1000;t.speed=caps(t).speed;t.yield=caps(t).yield;t.auto=caps(t).auto;t.capacity=caps(t).capacity;t.star=3;
 t.nextFruitAt=NOW+fruitInterval(t);t.nextAutoAt=NOW+autoInterval(t);
 const p=applyAction(s,{kind:"prestige",treeId:1},NOW);
 const r=p.state.trees[0];assert.equal(p.applied,true);assert.equal(r.prestige,1);assert.equal(r.speed,0);assert.equal(r.yield,0);assert.equal(r.auto,0);assert.equal(r.capacity,0);assert.equal(r.star,3);assert.equal(starChance(r),starChance(t));assert.equal(r.matureAt,NOW+180000);assert.ok(caps(r).speed>caps(t).speed);assert.ok(fruitInterval(r)>fruitInterval(makeTree(1,NOW)));assert.ok(yieldPerFruit(r)>1);
});
test("chance uses independent nonempty harvests; Cheribelle gated by second tree",()=>{
 assert.ok(Math.abs(chanceAtLeastOne(1,FRUITER_CHANCE)-1/20000)<1e-12);
 assert.ok(Math.abs(chanceAtLeastOne(100,FRUITER_CHANCE)-(1-(1-1/20000)**100))<1e-12);
 assert.deepEqual(rewardCandidates({harvests:1,eligibleHarvests:0},()=>.000001),["fruiter"]);
 assert.deepEqual(rewardCandidates({harvests:1,eligibleHarvests:1},()=>.000001),["cheribelle","fruiter"]);
 assert.deepEqual(rewardCandidates({harvests:0,eligibleHarvests:0},()=>0),[]);
});
test("long offline accrual, clock rollback, and upgrade preserve already-grown value",()=>{
 const s=initialEmpire(NOW);s.cherries=100;const a=applyAction(s,{kind:"upgrade",treeId:1,upgrade:"yield"},NOW+60000).state;
 assert.equal(a.trees[0].pendingCherries,2);assert.equal(advance(a,NOW+90000).state.trees[0].pendingCherries,4);
 assert.deepEqual(advance(a,NOW-1).state,a);
 const auto=applyAction(s,{kind:"upgrade",treeId:1,upgrade:"auto"},NOW).state;
 const long=advance(auto,NOW+365*86400000);assert.equal(long.effects.harvests,262800);assert.equal(long.effects.cherries,1051200);
});
test("binomial sampling stays in bounds and has plausible mean",()=>{
 let seed=123456;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;};
 let sum=0;for(let i=0;i<1000;i++){const n=binomial(100000,.01,rng);assert.ok(Number.isInteger(n)&&n>=0&&n<=100000);sum+=n;}
 assert.ok(Math.abs(sum/1000-1000)<10);assert.equal(binomial(100,0,rng),0);assert.equal(binomial(100,1,rng),100);
});
test("storage commits progress and wallet once; retries and stale tabs do not duplicate actions",async()=>{
 const uid="test",root="documents",user="users/test",path=user+"/privateGames/cherryEmpire";
 const store=new Map([[user,{updateTime:"0",fields:{status:{stringValue:"active"}}}]]);let writes=0,coins=0,clock=NOW,rev=0;
 const read=async p=>store.get(p)||null;
 const commit=async batch=>{writes++;for(const w of batch){if(!w.update)continue;const p=w.update.name.slice(root.length+1);
 if(w.updateTransforms){coins+=Number(w.updateTransforms[0].increment.integerValue);continue;}
 store.set(p,{updateTime:String(++rev),fields:w.update.fields});}return true;};
 const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
 const call=(kind,n,revision,treeId)=>orchardWithStorage({read,commit,root,uid,input:{kind,requestId:id(n),revision,treeId},clock:()=>clock,rng:()=>.000001});
 const start=await call("sync",1,0);clock+=30000;
 const first=await call("harvest",2,start.state.revision,1);assert.equal(first.state.cherries,1);assert.equal(coins,1);assert.ok(first.rewards.includes("fruiter"));
 const again=await call("harvest",2,start.state.revision,1);assert.deepEqual(first.state,again.state);assert.equal(coins,1);assert.equal(writes,2);
 const stale=await call("harvest",3,start.state.revision,1);assert.equal(stale.conflict,true);assert.equal(writes,2);assert.ok(store.has(path));assert.ok(store.has(user+"/axolotls/fruiter"));
});

test("tree capacity caps manual growth, increases with upgrades and preserves legacy fruit",()=>{
 const s=initialEmpire(NOW);s.cherries=100;
 const full=advance(s,NOW+86400000).state;
 assert.equal(full.trees[0].fruit,10);assert.equal(full.trees[0].pendingCherries,10);
 const up=applyAction(full,{kind:"upgrade",treeId:1,upgrade:"capacity"},NOW+86400000).state;
 assert.equal(treeCapacity(up.trees[0]),20);assert.equal(advance(up,NOW+86400000+300000).state.trees[0].fruit,20);
 const legacy=initialEmpire(NOW);legacy.version=1;delete legacy.trees[0].capacity;legacy.trees[0].fruit=100;legacy.trees[0].pendingCherries=100;
 const migrated=advance(legacy,NOW+30000).state;assert.equal(migrated.trees[0].fruit,100);assert.equal(migrated.trees[0].capacity,0);
 assert.equal(applyAction(migrated,{kind:"harvest",treeId:1},NOW+30000).effects.cherries,100);
});
test("capped automatic growth matches incremental timestamp simulation",()=>{
 for(let p=0;p<=4;p++)for(let speed=0;speed<=5+2*p;speed++)for(let auto=1;auto<=3+p;auto++){
 const s=initialEmpire(NOW),t=makeTree(1,NOW,0,p);s.trees=[t];t.speed=speed;t.auto=auto;t.yield=(speed+auto)%(caps(t).yield+1);t.nextFruitAt=NOW+fruitInterval(t);t.nextAutoAt=NOW+autoInterval(t);
 const until=NOW+9876543,fast=advance(s,until).state;let slow=s;
 for(let at=NOW+10000;at<until;at+=10000)slow=advance(slow,at).state;slow=advance(slow,until).state;
 assert.deepEqual(fast,slow);
 }
});
test("all four regular caps are required; permanent star upgrades are optional",()=>{
 const s=initialEmpire(NOW),t=s.trees[0];s.cherries=100000;
 for(const k of ["speed","yield","auto","capacity"])t[k]=caps(t)[k];
 assert.equal(prestigeReady(t),true);
 for(const k of ["speed","yield","auto","capacity"]){t[k]--;assert.equal(applyAction(s,{kind:"prestige",treeId:1},NOW).applied,false);t[k]++;}
 assert.equal(applyAction(s,{kind:"prestige",treeId:1},NOW).applied,true);
});
test("mastery is awarded atomically only when every one of twelve trees reaches prestige three",async()=>{
 const uid="test",root="documents",user="users/test",path=user+"/privateGames/cherryEmpire",trophy=user+"/trophies/"+CHERRY_TROPHY[0];
 const s=initialEmpire(NOW);s.trees=Array.from({length:12},(_,i)=>makeTree(i+1,NOW,0,i===11?2:3));s.cherries=100000;
 const t=s.trees[11];for(const k of ["speed","yield","auto","capacity"])t[k]=caps(t)[k];t.nextAutoAt=NOW+autoInterval(t);t.nextFruitAt=NOW+fruitInterval(t);
 assert.equal(hasMastery(s),false);
 assert.equal(hasMastery({...s,trees:s.trees.slice(0,11)}),false);
 const store=new Map([[user,{updateTime:"0",fields:{status:{stringValue:"active"}}}],[path,{updateTime:"1",fields:{payload:{stringValue:JSON.stringify({state:s})}}}]]);let rev=1,trophyWrites=0;
 const read=async p=>store.get(p)||null;
 const commit=async batch=>{for(const w of batch){if(!w.update||w.updateTransforms)continue;const p=w.update.name.slice(root.length+1);if(p===trophy)trophyWrites++;store.set(p,{updateTime:String(++rev),fields:w.update.fields});}return true;};
 const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
 const call=(kind,n,revision)=>orchardWithStorage({read,commit,root,uid,input:{kind,requestId:id(n),revision,treeId:12},clock:()=>NOW,rng:()=>.9});
 const award=await call("prestige",1,0);assert.ok(hasMastery(award.state));assert.deepEqual(award.rewards,[CHERRY_TROPHY[0]]);assert.ok(store.has(trophy));assert.equal(trophyWrites,1);
 const retry=await call("prestige",1,0);assert.deepEqual(retry.rewards,award.rewards);assert.equal(trophyWrites,1);
 const sync=await call("sync",2,1);assert.deepEqual(sync.rewards,[]);assert.equal(trophyWrites,1);
});

test("yield fills slots while prestige multiplies payout only",()=>{
 const s=initialEmpire(NOW),t=makeTree(1,NOW,0,2);s.trees=[t];t.yield=3;
 const interval=fruitInterval(t),first=advance(s,NOW+interval);
 assert.equal(slotsPerGrowth(t),4);assert.equal(prestigeMultiplier(t),5);
 assert.equal(first.state.trees[0].fruit,4);assert.equal(first.state.trees[0].pendingCherries,20);
 const full=advance(first.state,NOW+interval*100);
 assert.equal(full.state.trees[0].fruit,20);assert.equal(full.state.trees[0].pendingCherries,100);
 const harvested=applyAction(full.state,{kind:"harvest",treeId:1},NOW+interval*100);
 assert.equal(harvested.effects.cherries,100);assert.equal(harvested.effects.harvests,1);
});
test("partial growth fills remaining capacity, without extra prestige or star slots",()=>{
 const s=initialEmpire(NOW),t=s.trees[0];t.yield=3;let attempts=0;
 const a=advance(s,NOW+90000,(n,p)=>{attempts+=n;return n;});
 assert.equal(a.state.trees[0].fruit,10);assert.equal(a.state.trees[0].pendingCherries,10);
 assert.equal(a.state.trees[0].pendingStars,3);assert.equal(attempts,3);
 const b=advance(a.state,NOW+180000,()=>{throw Error("Full tree cannot grow");});
 assert.equal(b.state.trees[0].fruit,10);
});
test("version 2 ripe harvests preserve value when migrated to slot occupancy",()=>{
 const s=initialEmpire(NOW),t=makeTree(1,NOW,0,1);s.version=2;s.trees=[t];
 t.fruit=4;t.yield=2;t.pendingCherries=30;t.pendingStars=2;
 const a=advance(s,NOW);
 assert.equal(a.state.version,4);assert.equal(a.state.trees[0].fruit,10);
 assert.equal(a.state.trees[0].pendingCherries,30);assert.equal(a.state.trees[0].pendingStars,2);
 assert.deepEqual(advance(a.state,NOW).state,a.state);
});
test("offline capped auto harvesting agrees with exact event-by-event growth even with partial cycles",()=>{
 for(let p=0;p<5;p++)for(let y=0;y<=5+2*p;y++)for(let c=0;c<3;c++){
  const s=initialEmpire(NOW),t=makeTree(1,NOW,0,p);s.trees=[t];t.yield=y;t.capacity=c;t.speed=5+2*p;t.auto=1;
  t.nextFruitAt=NOW+fruitInterval(t);t.nextAutoAt=NOW+autoInterval(t);
  const until=NOW+1234567,fast=advance(s,until,n=>n).state;let slow=s;
  while(slow.lastAt<until){const tree=slow.trees[0];slow=advance(slow,Math.min(until,tree.nextFruitAt,tree.nextAutoAt),n=>n).state;}
  assert.deepEqual(fast,slow);
 }
});

test("star chance and multiplier have no gameplay cap; chance diminishes after ten percent",()=>{
 const t=makeTree(1,NOW);
 assert.equal(caps(t).star,Infinity);assert.equal(caps(t).starMultiplier,Infinity);
 assert.equal(starChance(t),.001);
 t.star=10;assert.ok(Math.abs(starChance(t)-.016)<1e-12);
 t.star=66;const before=starChance(t);t.star=67;const a=starChance(t);t.star=68;const b=starChance(t);t.star=1000;const c=starChance(t);t.star=1001;const d=starChance(t);
 assert.ok(before<=.1&&a>.1&&b>a&&d>c&&d-c<b-a&&d<1);
 t.starMultiplier=0;assert.equal(starMultiplier(t),1);t.starMultiplier=1;const first=starMultiplier(t);t.starMultiplier=2;const second=starMultiplier(t);t.starMultiplier=1000;assert.ok(first>1&&second-first<first-1&&starMultiplier(t)>second);
 assert.ok(Number.isSafeInteger(upgradePrice(t,"star")));
});
test("both uncapped star upgrades can be purchased beyond level ten and retained on prestige",()=>{
 let s=initialEmpire(NOW);let t=s.trees[0];s.cherries=10000000;t.star=11;t.starMultiplier=11;
 s=applyAction(s,{kind:"upgrade",treeId:1,upgrade:"star"},NOW).state;
 s=applyAction(s,{kind:"upgrade",treeId:1,upgrade:"starMultiplier"},NOW).state;
 t=s.trees[0];assert.equal(t.star,12);assert.equal(t.starMultiplier,12);
 for(const k of ["speed","yield","auto","capacity"])t[k]=caps(t)[k];
 const result=applyAction(s,{kind:"prestige",treeId:1},NOW);
 assert.equal(result.applied,true);assert.equal(result.state.trees[0].star,12);assert.equal(result.state.trees[0].starMultiplier,12);
});
test("fractional star payouts persist across trees, saves, harvests and prestige",()=>{
 let s=initialEmpire(NOW);s.trees.push(makeTree(2,NOW));for(const t of s.trees)t.starMultiplier=20;
 const units=starMultiplierUnits(s.trees[0]);let coins=0;
 for(let i=1;i<=15;i++){
  const g=advance(s,NOW+i*30000,n=>n).state;
  s=applyAction(g,{kind:"harvestAll"},NOW+i*30000).state;
  coins=s.totalStars;s=JSON.parse(JSON.stringify(s));
 }
 assert.equal(coins,Math.floor(30*units/STAR_SCALE));
 assert.equal(s.starCarry,30*units%STAR_SCALE);
 assert.equal(starFraction(s),s.starCarry/STAR_SCALE);
 assert.equal(s.trees[0].pendingStarMicros,0);
 const carry=s.starCarry;s.cherries=1000000;const t=s.trees[0];for(const k of ["speed","yield","auto","capacity"])t[k]=caps(t)[k];
 const p=applyAction(s,{kind:"prestige",treeId:1},s.lastAt);assert.equal(p.state.starCarry,carry);assert.equal(p.state.trees[0].starMultiplier,20);
});
test("offline auto multiplier settlement matches individual harvest events and preserves accrued rates",()=>{
 let s=initialEmpire(NOW);let t=s.trees[0];t.starMultiplier=17;t.auto=1;t.nextAutoAt=NOW+autoInterval(t);
 const until=NOW+86400000,fast=advance(s,until,n=>n).state;let slow=s;
 for(let at=NOW+120000;at<=until;at+=120000)slow=advance(slow,at,n=>n).state;
 assert.deepEqual(fast,slow);
 const old=advance(s,NOW+30000,n=>n).state;const before=old.trees[0].pendingStars*STAR_SCALE+old.trees[0].pendingStarMicros;
 old.cherries=100000;const upgraded=applyAction(old,{kind:"upgrade",treeId:1,upgrade:"starMultiplier"},NOW+30000).state;
 const next=advance(upgraded,NOW+60000,n=>n).state;
 assert.equal(next.trees[0].pendingStars*STAR_SCALE+next.trees[0].pendingStarMicros,before+starMultiplierUnits(upgraded.trees[0]));
});

test("Paid Cherry Empire doubles harvest payouts and never credits a retry",async()=>{
 const uid="test",root="documents",user="users/test",path=user+"/privateGames/cherryEmpire";
 const store=new Map([[user,{updateTime:"0",fields:{status:{stringValue:"active"}}}]]);store.set("memberships/test",{updateTime:"paid",fields:{expiresAt:{timestampValue:new Date(NOW+86400000).toISOString()}}});let writes=0,coins=0,clock=NOW,rev=0;
 const read=async p=>store.get(p)||null;
 const commit=async batch=>{writes++;for(const w of batch){if(!w.update)continue;const p=w.update.name.slice(root.length+1);
 if(w.updateTransforms){coins+=Number(w.updateTransforms[0].increment.integerValue);continue;}
 store.set(p,{updateTime:String(++rev),fields:w.update.fields});}return true;};
 const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
 const call=(kind,n,revision,treeId)=>orchardWithStorage({read,commit,root,uid,input:{kind,requestId:id(n),revision,treeId},clock:()=>clock,rng:()=>.000001});
 const start=await call("sync",1,0);clock+=30000;
 const first=await call("harvest",2,start.state.revision,1);assert.equal(first.state.cherries,1);assert.equal(coins,2);assert.ok(first.rewards.includes("fruiter"));
 store.delete("memberships/test");
 const again=await call("harvest",2,start.state.revision,1);assert.deepEqual(first.state,again.state);assert.equal(coins,2);assert.equal(writes,2);
 const stale=await call("harvest",3,start.state.revision,1);assert.equal(stale.conflict,true);assert.equal(writes,2);assert.ok(store.has(path));assert.ok(store.has(user+"/axolotls/fruiter"));
});
