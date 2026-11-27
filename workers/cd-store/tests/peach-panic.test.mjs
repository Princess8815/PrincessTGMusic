
import test from "node:test";
import assert from "node:assert/strict";
import {ROUND_MS,PEACH_COUNT,MASTERY_SCORE,PEACH_TROPHY,orchard,peachPoints,peachCoins,replayPeaches,fruiterChance,peachRewards} from "../../../script/peach-panic-core.mjs";
import {peachWithStorage} from "../peach-panic.mjs";
const NOW=1700000000000;
const perfectLog=seed=>orchard(seed).map(p=>[p.id,p.born+p.ripen]).sort((a,b)=>a[1]-b[1]);
test("all scheduled peaches fit in the round, no occupied slots overlap",()=>{
 let min=Infinity,max=0,blueTotal=0;
 for(let seed=1;seed<=300;seed++){
  const list=orchard(seed);assert.equal(list.length,PEACH_COUNT);assert.deepEqual(list,orchard(seed));
  const slots=new Map();for(const p of list){assert.ok(p.born+p.ripen<ROUND_MS);assert.ok((slots.get(p.slot)||0)<=p.born);slots.set(p.slot,p.expires);if(p.blue)blueTotal++;}
  const result=replayPeaches(seed,perfectLog(seed));min=Math.min(min,result.score);max=Math.max(max,result.score);
  assert.equal(result.perfect,PEACH_COUNT);assert.equal(result.coins,PEACH_COUNT*2);assert.ok(result.score>=MASTERY_SCORE);
 }
 assert.ok(min>=260);assert.ok(max>min);assert.ok(blueTotal>900&&blueTotal<1700);
});
test("early, near-perfect, perfect and overripe scoring; blue doubles points",()=>{
 const p={born:0,ripen:3000,expires:4400,blue:false};
 assert.equal(peachPoints(p,100),0);assert.equal(peachPoints(p,1800),1);assert.equal(peachPoints(p,2200),2);assert.equal(peachPoints(p,2500),3);assert.equal(peachPoints(p,2700),4);assert.equal(peachPoints(p,2850),5);
 assert.equal(peachPoints(p,3150),5);assert.equal(peachPoints(p,3350),4);assert.equal(peachPoints(p,4400),0);
 assert.equal(peachPoints({...p,blue:true},3000),10);
});
test("reject forged IDs, times, duplicate fruit and nonchronological logs",()=>{
 const p=orchard(42)[0],valid=[p.id,p.born+p.ripen];
 assert.throws(()=>replayPeaches(42,[valid,valid]));
 assert.throws(()=>replayPeaches(42,[[99,0]]));
 assert.throws(()=>replayPeaches(42,[[0,p.expires]]));
 assert.throws(()=>replayPeaches(42,[[1,0]]));
 assert.throws(()=>replayPeaches(42,[[0,ROUND_MS]]));
 assert.throws(()=>replayPeaches(42,[[0,1.5]]));
 assert.throws(()=>replayPeaches(42,[[0,1000],[1,500]]));
});
test("Peachiboo rolls per blue peach; Fruiter rolls once and scales from score one",()=>{
 assert.equal(fruiterChance(1),1/10000);assert.equal(fruiterChance(0),0);
 assert.equal(fruiterChance(100),1/1000);assert.ok(fruiterChance(240)>fruiterChance(100));
 assert.deepEqual(peachRewards({blue:1,score:0},()=>.19),["peachiboo"]);
 assert.deepEqual(peachRewards({blue:1,score:0},()=>.21),[]);
 assert.deepEqual(peachRewards({blue:2,score:0},()=>.35),["peachiboo"]);
 let calls=0;assert.deepEqual(peachRewards({blue:0,score:100},()=>{calls++;return .0005;}),["fruiter"]);assert.equal(calls,1);
 assert.deepEqual(peachRewards({blue:0,score:MASTERY_SCORE-1},()=>.99),[]);
 assert.deepEqual(peachRewards({blue:0,score:MASTERY_SCORE},()=>.99),[PEACH_TROPHY[0]]);
});
test("a strong but imperfect run can reach the trophy without all perfect picks",()=>{
 const seed=42,list=orchard(seed),log=list.filter((p,i)=>i%13!==0).map((p,i)=>[p.id,p.born+p.ripen+(i%5===0?250:90)]).sort((a,b)=>a[1]-b[1]);
 const r=replayPeaches(seed,log);assert.ok(r.perfect<PEACH_COUNT);assert.ok(r.score>=MASTERY_SCORE);
});
test("server persists best score and permanent rewards, rejects early finish and duplicate payout",async()=>{
 const root="documents",uid="test",user="users/test",path=user+"/privateGames/peachPanic";
 const store=new Map([[user,{updateTime:"0",fields:{status:{stringValue:"active"}}}]]);let clock=NOW,rev=0,commits=0,wallet=0;
 const read=async p=>store.get(p)||null;
 const commit=async writes=>{commits++;for(const w of writes){if(w.updateTransforms){assert.equal(w.update.name,root+"/"+user+"/wallets/starCoins");wallet+=Number(w.updateTransforms[0].increment.integerValue);}if(w.update)store.set(w.update.name.slice(root.length+1),{updateTime:String(++rev),fields:w.update.fields});}return true;};
 const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
 const call=(action,n,picks)=>peachWithStorage({read,commit,root,uid,input:{action,runId:id(n),picks},clock:()=>clock,rng:()=>.000001,seed:()=>42});
 const start=await call("start",1);assert.equal(start.startAt,NOW+1000);assert.equal(start.closed,false);
 await assert.rejects(()=>call("finish",1,perfectLog(42)));await assert.rejects(()=>call("start",2));assert.equal(commits,1);
 clock=start.startAt+ROUND_MS;
 const result=await call("finish",1,perfectLog(42));assert.equal(result.closed,true);assert.equal(result.best,result.result.score);assert.ok(result.rewards.includes("fruiter"));assert.ok(result.rewards.includes("peachiboo"));assert.ok(store.has(user+"/trophies/"+PEACH_TROPHY[0]));assert.ok(store.has(user+"/axolotls/peachiboo"));assert.equal(commits,2);assert.equal(wallet,104);
 const again=await call("finish",1,[]);assert.deepEqual(again,result);assert.equal(commits,2);assert.equal(wallet,104);
 const next=await call("start",2);assert.equal(next.best,result.best);clock=next.startAt+ROUND_MS;
 const last=await call("finish",2,perfectLog(42));assert.deepEqual(last.rewards,[]);assert.equal(commits,4);assert.equal(wallet,208);assert.ok(store.has(path));
});

test("Star Coin payout matches visual ripeness windows, regardless of blue color or score",()=>{
 const p={born:500,ripen:3000,expires:4900,blue:false};
 for(const blue of [false,true]){
  const fruit={...p,blue};
  assert.equal(peachCoins(fruit,499),0);
  assert.equal(peachCoins(fruit,500),1);
  assert.equal(peachCoins(fruit,3349),1);
  assert.equal(peachCoins(fruit,3350),2);
  assert.equal(peachCoins(fruit,3500),2);
  assert.equal(peachCoins(fruit,3650),2);
  assert.equal(peachCoins(fruit,3651),0);
  assert.equal(peachCoins(fruit,4899),0);
  assert.equal(peachCoins(fruit,4900),0);
 }
 const list=orchard(42),log=[[0,list[0].born],[1,list[1].born+list[1].ripen],[2,list[2].born+list[2].ripen+500]].sort((a,b)=>a[1]-b[1]);
 assert.equal(replayPeaches(42,log).coins,3);
});

test("Paid Peach Panic doubles round payout and preserves it on retry",async()=>{
 const root="documents",uid="test",user="users/test",path=user+"/privateGames/peachPanic";
 const store=new Map([[user,{updateTime:"0",fields:{status:{stringValue:"active"}}}]]);store.set("memberships/test",{updateTime:"paid",fields:{expiresAt:{timestampValue:new Date(NOW+86400000).toISOString()}}});let clock=NOW,rev=0,commits=0,wallet=0;
 const read=async p=>store.get(p)||null;
 const commit=async writes=>{commits++;for(const w of writes){if(w.updateTransforms){assert.equal(w.update.name,root+"/"+user+"/wallets/starCoins");wallet+=Number(w.updateTransforms[0].increment.integerValue);}if(w.update)store.set(w.update.name.slice(root.length+1),{updateTime:String(++rev),fields:w.update.fields});}return true;};
 const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
 const call=(action,n,picks)=>peachWithStorage({read,commit,root,uid,input:{action,runId:id(n),picks},clock:()=>clock,rng:()=>.000001,seed:()=>42});
 const start=await call("start",1);assert.equal(start.startAt,NOW+1000);assert.equal(start.closed,false);
 await assert.rejects(()=>call("finish",1,perfectLog(42)));await assert.rejects(()=>call("start",2));assert.equal(commits,1);
 clock=start.startAt+ROUND_MS;
 const result=await call("finish",1,perfectLog(42));assert.equal(result.closed,true);assert.equal(result.best,result.result.score);assert.ok(result.rewards.includes("fruiter"));assert.ok(result.rewards.includes("peachiboo"));assert.ok(store.has(user+"/trophies/"+PEACH_TROPHY[0]));assert.ok(store.has(user+"/axolotls/peachiboo"));assert.equal(commits,2);assert.equal(wallet,208);
 store.delete("memberships/test");
 const again=await call("finish",1,[]);assert.deepEqual(again,result);assert.equal(commits,2);assert.equal(wallet,208);
 const next=await call("start",2);assert.equal(next.best,result.best);clock=next.startAt+ROUND_MS;
 const last=await call("finish",2,perfectLog(42));assert.deepEqual(last.rewards,[]);assert.equal(commits,4);assert.equal(wallet,312);assert.ok(store.has(path));
});
