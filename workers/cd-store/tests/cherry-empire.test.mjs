
import test from "node:test";
import assert from "node:assert/strict";
import {initialEmpire,makeTree,advance,applyAction,fruitInterval,autoInterval,starChance,caps,yieldPerFruit,treePrice,chanceAtLeastOne,rewardCandidates,binomial,FRUITER_CHANCE} from "../../../script/cherry-empire-core.mjs";
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
 const s=initialEmpire(NOW),t=s.trees[0];s.cherries=1000;t.speed=caps(t).speed;t.yield=caps(t).yield;t.auto=2;t.star=3;
 t.nextFruitAt=NOW+fruitInterval(t);t.nextAutoAt=NOW+autoInterval(t);
 const p=applyAction(s,{kind:"prestige",treeId:1},NOW);
 const r=p.state.trees[0];assert.equal(p.applied,true);assert.equal(r.prestige,1);assert.equal(r.speed,0);assert.equal(r.yield,0);assert.equal(r.auto,0);assert.equal(r.star,3);assert.equal(starChance(r),starChance(t));assert.equal(r.matureAt,NOW+180000);assert.ok(caps(r).speed>caps(t).speed);assert.ok(fruitInterval(r)>fruitInterval(makeTree(1,NOW)));assert.ok(yieldPerFruit(r)>1);
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
