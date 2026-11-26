
import test from "node:test";
import assert from "node:assert/strict";
import {initialGarden,makeTree,stage,growthWork,advanceGarden,gardenAction,damage,dropQuarters,dropCoins,makeOpponent,fruiterChance,sortedPears,geneticsRandom,INVENTORY_CAP,INVENTORY_MAX,inventoryCapacity,inventoryUpgradeCost,WATER_MS,FERT_MS,FERT_COST,FRUIT_WORK} from "../../../script/giving-tree-core.mjs";
import {gardenWithStorage} from "../giving-tree.mjs";
const NOW=1700000000000,mid=()=>.5;
function planted(pear={attack:1,defense:1}){const s=initialGarden(NOW);s.inventory[0]={id:1,...pear};return gardenAction(s,{kind:"plant",plot:0,fruitId:1},NOW,0,mid).state;}
function mature(s){const t=s.plots[0];t.growth=growthWork(t);t.water=WATER_MS;return s;}
test("four empty plots, 1:1 starter, inherited stats and mature-only cutting",()=>{
 const s=initialGarden(NOW);assert.equal(s.plots.length,4);assert.ok(s.plots.every(t=>!t));assert.deepEqual(s.inventory,[{id:1,attack:1,defense:1}]);
 const t=planted({attack:7,defense:4});assert.equal(t.plots[0].attack,7);assert.equal(t.plots[0].defense,4);assert.equal(t.inventory.length,0);assert.ok(t.enemiesUnlocked&&t.bossesUnlocked);assert.equal(gardenAction(t,{kind:"cut",plot:0},NOW,0,mid).applied,false);
});
test("water, four growth stages, higher stat growth time and fruit reward",()=>{
 let s=planted();assert.equal(advanceGarden(s,NOW+60000,mid).state.plots[0].growth,0);
 s=gardenAction(s,{kind:"water",plot:0},NOW,0,mid).state;
 for(const [ms,st] of [[0,0],[60000,1],[120000,2],[180000,3]])assert.equal(stage(advanceGarden(s,NOW+ms,mid).state.plots[0]),st);
 assert.ok(growthWork(makeTree({attack:2,defense:1}))>growthWork(s.plots[0]));
 const r=advanceGarden(s,NOW+180000+FRUIT_WORK,mid);assert.equal(r.effects.fruits,1);assert.equal(r.effects.coins,1);assert.equal(r.state.inventory[0].attack,1);
});
test("paid stackable fertilizer works four times faster with no gameplay pack cap",()=>{
 let s=planted();s=gardenAction(s,{kind:"water",plot:0},NOW,0,mid).state;
 assert.equal(gardenAction(s,{kind:"fertilize",plot:0,quantity:1},NOW,4,mid).applied,false);
 const b=gardenAction(s,{kind:"fertilize",plot:0,quantity:100000},NOW,500000,mid);assert.equal(b.applied,true);assert.equal(b.effects.spent,500000);assert.equal(b.state.plots[0].fertilizer,100000*FERT_MS);
 const r=advanceGarden(b.state,NOW+45000,mid).state;assert.equal(stage(r.plots[0]),3);assert.equal(r.plots[0].water,WATER_MS-45000);assert.equal(r.plots[0].fertilizer,100000*FERT_MS-45000);
 assert.equal(gardenAction(s,{kind:"fertilize",plot:0,quantity:-1},NOW,999,mid).applied,false);
});
test("inventory limit, fruit generation payouts and both mutation directions",()=>{
 const s=mature(planted({attack:4,defense:4}));s.plots[0].fertilizer=2*FERT_MS;
 const r=advanceGarden(s,NOW+600000,()=>.99);assert.equal(r.state.inventory.length,INVENTORY_CAP);assert.equal(r.effects.coins,INVENTORY_CAP);assert.equal(r.state.inventory[0].attack,4.49);assert.equal(r.state.inventory[0].defense,4.49);
 assert.equal(advanceGarden(r.state,NOW+86400000,mid).effects.coins,0);
 const lower=advanceGarden(mature(planted({attack:4,defense:4})),NOW+FRUIT_WORK,()=>.01);assert.equal(lower.state.inventory[0].attack,3.51);assert.equal(lower.state.inventory[0].defense,3.51);
 assert.equal(advanceGarden(mature(planted()),NOW+FRUIT_WORK,()=>.01).state.inventory[0].attack,1);
});
test("offline timestamp integration equals incremental updates",()=>{
 let s=initialGarden(NOW);s.inventory=[];for(let i=0;i<4;i++){const t=makeTree({attack:i+1,defense:2});t.water=WATER_MS-i*15000;t.fertilizer=i*70000;t.growth=i*23000;s.plots[i]=t;}
 const end=NOW+86400000,fast=advanceGarden(s,end,mid).state;let slow=s;for(let now=NOW+5000;now<=NOW+WATER_MS;now+=5000)slow=advanceGarden(slow,now,mid).state;slow=advanceGarden(slow,end,mid).state;assert.deepEqual(slow,fast);
});
test("OR unlock thresholds and safe recovery seed",()=>{
 let s=planted({attack:1,defense:2});assert.equal(s.enemiesUnlocked,true);assert.equal(s.bossesUnlocked,false);
 s=mature(planted({attack:5,defense:1}));assert.equal(s.bossesUnlocked,true);
 const r=gardenAction(s,{kind:"cut",plot:0},NOW,0,mid);assert.equal(r.applied,true);assert.ok(r.state.plots.every(t=>!t));assert.equal(r.state.bossesUnlocked,true);assert.equal(r.state.inventory.length,1);assert.equal(r.effects.coins,0);
});
test("combat consumes pears, checks both stats and gives exact damage and enemy payout",()=>{
 const s=mature(planted({attack:5,defense:5})),op=s.enemy;
 assert.equal(damage({attack:99,defense:op.attack-1},op),0);assert.equal(damage({attack:op.defense,defense:op.attack},op),0);assert.equal(damage({attack:op.defense+3,defense:op.attack},op),3);
 s.inventory=[{id:3,attack:100,defense:1},{id:4,attack:5,defense:5},{id:5,attack:5,defense:5}];
 const b=gardenAction(s,{kind:"throw",target:"enemy",fruitId:3},NOW,0,mid);assert.equal(b.state.enemy.hp,op.hp);assert.equal(b.state.inventory.length,2);
 const h=gardenAction(b.state,{kind:"throw",target:"enemy",fruitId:4},NOW,0,mid);assert.equal(h.state.enemy.hp,1);
 const k=gardenAction(h.state,{kind:"throw",target:"enemy",fruitId:5},NOW,0,mid);assert.equal(k.state.enemiesDefeated,1);assert.equal(k.effects.coins,6);assert.equal(dropCoins(op),5+(op.attack+op.defense)*.25);
});
test("boss full heal after 30 seconds, fixed deadline, exponential growth and payout",()=>{
 const s=mature(planted({attack:5,defense:5}));s.inventory=[{id:3,attack:8,defense:5},{id:4,attack:8,defense:5},{id:5,attack:30,defense:5}];
 const max=s.boss.maxHp;let r=gardenAction(s,{kind:"throw",target:"boss",fruitId:3},NOW,0,mid);assert.equal(r.state.boss.hp,max-3);assert.equal(r.state.boss.deadline,NOW+30000);
 r=gardenAction(r.state,{kind:"throw",target:"boss",fruitId:4},NOW+10000,0,mid);assert.equal(r.state.boss.deadline,NOW+30000);
 assert.equal(advanceGarden(r.state,NOW+29999,mid).state.boss.hp,max-6);assert.equal(advanceGarden(r.state,NOW+30000,mid).state.boss.hp,max);
 const b=gardenAction(r.state,{kind:"throw",target:"boss",fruitId:5},NOW+30000,0,mid);assert.equal(b.state.bossesDefeated,1);assert.equal(b.effects.coins,15);assert.ok(b.state.boss.maxHp>max);assert.equal(dropCoins(s.boss),10+(s.boss.attack+s.boss.defense)*.5);assert.ok(makeOpponent("boss",5).attack>makeOpponent("boss",4).attack);
});
test("fractional battle rewards accumulate internally",()=>{
 let s=mature(planted({attack:10,defense:10}));s.enemiesDefeated=1;s.enemy=makeOpponent("enemy",1);s.inventory=[{id:3,attack:100,defense:100},{id:4,attack:100,defense:100},{id:5,attack:100,defense:100}];let earned=0,expected=0;
 for(const id of [3,4,5]){expected+=dropQuarters(s.enemy);const r=gardenAction(s,{kind:"throw",target:"enemy",fruitId:id},NOW,0,mid);earned+=r.effects.coins;s=r.state;}
 assert.equal(earned,Math.floor(expected/4));assert.equal(s.coinQuarters,expected%4);
});
test("Pearlie requires first boss and Fruiter improves per boss",()=>{
 const s=mature(planted());let r=advanceGarden(s,NOW+FRUIT_WORK,()=>.000001);assert.deepEqual(r.effects.rewards,["fruiter"]);s.bossesDefeated=1;r=advanceGarden(s,NOW+FRUIT_WORK,()=>.000001);assert.deepEqual(r.effects.rewards,["pearlie","fruiter"]);assert.equal(fruiterChance(0),1/10000);assert.ok(fruiterChance(2)>fruiterChance(1)&&fruiterChance(1)>fruiterChance(0));
});
test("atomic wallet, fertilizer purchases, stale revision and duplicate request protection",async()=>{
 const root="documents",uid="test",user="users/test",path=user+"/privateGames/givingTree",wp=user+"/wallets/starCoins";
 const store=new Map([[user,{updateTime:"0",fields:{status:{stringValue:"active"}}}],[wp,{updateTime:"1",fields:{balance:{integerValue:"10"}}}]]);let rev=1,clock=NOW,commits=0;
 const read=async p=>store.get(p)||null,commit=async writes=>{commits++;for(const w of writes)if(w.update)store.set(w.update.name.slice(root.length+1),{updateTime:String(++rev),fields:w.update.fields});return true;};
 const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
 const call=(kind,n,revision,extra={})=>gardenWithStorage({read,commit,root,uid,input:{kind,requestId:id(n),revision,...extra},clock:()=>clock,rng:()=>.000001});
 let a=await call("sync",1,0);a=await call("plant",2,a.state.revision,{plot:0,fruitId:1});a=await call("water",3,a.state.revision,{plot:0});
 const v=a.state.revision,b=await call("fertilize",4,v,{plot:0,quantity:1});assert.equal(b.wallet,5);assert.equal(b.effects.spent,5);
 const again=await call("fertilize",4,v,{plot:0,quantity:1});assert.equal(again.wallet,5);assert.equal(commits,4);
 const stale=await call("fertilize",5,v,{plot:0,quantity:1});assert.equal(stale.conflict,true);assert.equal(commits,4);
 clock=NOW+56250;const grown=await call("sync",6,b.state.revision);assert.equal(grown.effects.fruits,1);assert.equal(grown.wallet,6);assert.ok(store.has(user+"/axolotls/fruiter"));assert.ok(store.has(path));
 const retry=await call("sync",6,b.state.revision);assert.equal(retry.wallet,6);assert.equal(commits,5);
});

test("inventory upgrades migrate old saves, debit correct costs and raise offline production limits",()=>{
 let s=mature(planted());s.version=1;delete s.inventoryCapacity;
 s.inventory=Array.from({length:40},(_,i)=>({id:i+2,attack:1,defense:1}));s.nextFruitId=42;
 assert.equal(inventoryCapacity(s),40);assert.equal(inventoryUpgradeCost(s),25);
 const denied=gardenAction(s,{kind:"upgradeInventory"},NOW,24,mid);assert.equal(denied.applied,false);assert.equal(denied.effects.spent,0);
 const a=gardenAction(s,{kind:"upgradeInventory"},NOW,25,mid);assert.equal(a.applied,true);assert.equal(a.effects.spent,25);assert.equal(inventoryCapacity(a.state),50);assert.equal(a.state.inventory.length,40);
 const r=advanceGarden(a.state,NOW+600000,mid);assert.equal(r.state.inventory.length,50);assert.equal(r.effects.coins,10);assert.equal(r.state.inventoryCapacity,50);
 const b=gardenAction(r.state,{kind:"upgradeInventory"},r.state.lastAt,40,mid);assert.equal(b.effects.spent,40);assert.equal(inventoryCapacity(b.state),60);
 b.state.inventoryCapacity=INVENTORY_MAX;assert.equal(gardenAction(b.state,{kind:"upgradeInventory"},b.state.lastAt,99999,mid).applied,false);
});
test("independent decimal mutations stay within half a point and preserve fractional seed and combat stats",()=>{
 const s=mature(planted({attack:3.27,defense:2.13}));let n=0;const rng=()=>[0,.999999,.5][n++%3];
 const r=advanceGarden(s,NOW+FRUIT_WORK,rng);const p=r.state.inventory[0];
 assert.equal(p.attack,2.77);assert.equal(p.defense,2.63);
 const a=gardenAction(r.state,{kind:"plant",plot:1,fruitId:p.id},r.state.lastAt,0,mid);assert.equal(a.state.plots[1].attack,2.77);assert.equal(a.state.plots[1].defense,2.63);
 assert.equal(damage({attack:2.01,defense:2},{attack:2,defense:2}),.01);
 assert.equal(damage({attack:3.5,defense:1.99},{attack:2,defense:2}),0);
 let b=mature(planted({attack:3.27,defense:2.13}));b.enemy.hp=.03;b.inventory=[{id:2,attack:2.01,defense:2},{id:3,attack:2.02,defense:2}];
 b=gardenAction(b,{kind:"throw",target:"enemy",fruitId:2},NOW,0,mid).state;assert.equal(b.enemy.hp,.02);
 const k=gardenAction(b,{kind:"throw",target:"enemy",fruitId:3},NOW,0,mid);assert.equal(k.state.enemiesDefeated,1);assert.equal(k.effects.coins,6);
});
test("inventory purchase is atomically debited once even when the same request is retried",async()=>{
 const root="documents",uid="capacity-test",user="users/"+uid,wp=user+"/wallets/starCoins";
 const store=new Map([[user,{updateTime:"1",fields:{status:{stringValue:"active"}}}],[wp,{updateTime:"2",fields:{balance:{integerValue:"100"}}}]]);
 let commits=0;const read=async p=>store.get(p)||null,commit=async writes=>{commits++;for(const w of writes)if(w.update)store.set(w.update.name.slice(root.length+1),{updateTime:String(commits+2),fields:w.update.fields});return true;};
 const input={kind:"upgradeInventory",requestId:"00000000-0000-4000-8000-000000000001",revision:0};
 const call=()=>gardenWithStorage({read,commit,root,uid,input,clock:()=>NOW,rng:mid});
 const a=await call(),b=await call();assert.equal(a.wallet,75);assert.equal(b.wallet,75);assert.equal(a.state.inventoryCapacity,50);assert.equal(b.state.inventoryCapacity,50);assert.equal(commits,1);
});

test("sorting is descending, stable by newest tie, and does not mutate stored fruit",()=>{
 const pears=[{id:1,attack:4.2,defense:1},{id:2,attack:2,defense:5},{id:3,attack:3,defense:4},{id:4,attack:4.2,defense:1.1}];
 assert.deepEqual(sortedPears(pears,"attack").map(p=>p.id),[4,1,3,2]);
 assert.deepEqual(sortedPears(pears,"defense").map(p=>p.id),[2,3,4,1]);
 assert.deepEqual(sortedPears(pears,"total").map(p=>p.id),[3,2,4,1]);
 assert.deepEqual(sortedPears(pears,"newest").map(p=>p.id),[4,3,2,1]);
 assert.deepEqual(pears.map(p=>p.id),[1,2,3,4]);
});
test("bulk discard validates exact IDs and leaves trees, other fruit and earned coins intact",()=>{
 const s=mature(planted({attack:3,defense:3}));s.inventory=[{id:2,attack:3,defense:3},{id:3,attack:3.2,defense:2.9},{id:4,attack:3.4,defense:3}];s.nextFruitId=5;
 for(const fruitIds of [[2,2],[2,99],[],["2"]]){
  const bad=gardenAction(s,{kind:"discardMany",fruitIds},NOW,0,mid);assert.equal(bad.applied,false);assert.equal(bad.state.inventory.length,3);
 }
 const r=gardenAction(s,{kind:"discardMany",fruitIds:[2,4]},NOW,0,mid);assert.equal(r.applied,true);assert.deepEqual(r.state.inventory.map(p=>p.id),[3]);assert.equal(r.effects.coins,0);assert.equal(r.state.plots[0].attack,3);
 const refused=gardenAction(s,{kind:"clearInventory",fruitIds:[2]},NOW,0,mid);assert.equal(refused.applied,false);
 const clear=gardenAction(s,{kind:"clearInventory",fruitIds:[2,3,4]},NOW+FRUIT_WORK,0,mid);assert.equal(clear.applied,true);assert.deepEqual(clear.state.inventory.map(p=>p.id),[5]);assert.equal(clear.effects.coins,1);
});
test("clear all never softlocks a garden and combat still rejects bulk fruit IDs",()=>{
 const s=initialGarden(NOW),r=gardenAction(s,{kind:"clearInventory",fruitIds:[1]},NOW,0,mid);
 assert.equal(r.applied,true);assert.equal(r.state.inventory.length,1);assert.equal(r.state.inventory[0].attack,1);assert.equal(r.effects.coins,0);
 const b=mature(planted({attack:5,defense:5}));b.inventory=[{id:2,attack:5,defense:5},{id:3,attack:5,defense:5}];
 const blocked=gardenAction(b,{kind:"throw",target:"enemy",fruitId:2,fruitIds:[2,3]},NOW,0,mid);assert.equal(blocked.applied,false);assert.equal(blocked.state.inventory.length,2);
 const hit=gardenAction(b,{kind:"throw",target:"enemy",fruitId:2},NOW,0,mid);assert.equal(hit.applied,true);assert.equal(hit.state.inventory.length,1);assert.equal(hit.state.enemy.hp,1);
});
test("bulk discard is atomic, saved and idempotent on server retries",async()=>{
 const root="documents",uid="bulk-test",user="users/"+uid,path=user+"/privateGames/givingTree";
 const s=mature(planted({attack:3,defense:3}));s.inventory=[{id:2,attack:3,defense:3},{id:3,attack:3.2,defense:3},{id:4,attack:3,defense:3.4}];s.nextFruitId=5;
 const store=new Map([[user,{updateTime:"1",fields:{status:{stringValue:"active"}}}],[path,{updateTime:"2",fields:{payload:{stringValue:JSON.stringify({state:s})}}}]]);let commits=0;
 const read=async p=>store.get(p)||null,commit=async writes=>{commits++;for(const w of writes)if(w.update)store.set(w.update.name.slice(root.length+1),{updateTime:String(commits+2),fields:w.update.fields});return true;};
 const input={kind:"discardMany",fruitIds:[2,4],requestId:"00000000-0000-4000-8000-000000000001",revision:s.revision};
 const call=()=>gardenWithStorage({read,commit,root,uid,input,clock:()=>NOW,rng:mid});
 const a=await call(),b=await call();assert.deepEqual(a.state.inventory.map(p=>p.id),[3]);assert.deepEqual(a.state,b.state);assert.equal(commits,1);
});

test("seeded genetics match across live projection, batched settlement and different reward RNG",()=>{
 let s=initialGarden(NOW);s.inventory=[];s.geneticsSeed=123456789;
 for(let i=0;i<4;i++){const t=makeTree({attack:2.31+i,defense:1.8+i});t.growth=growthWork(t);t.water=WATER_MS;t.fertilizer=i*50000;t.fruitWork=i*8000;s.plots[i]=t;}
 const at=NOW+200000,server=advanceGarden(s,at,()=>.000001),preview=advanceGarden(s,at,()=>.5);
 assert.deepEqual(preview.state.inventory,server.state.inventory);
 assert.ok(server.effects.rewards.includes("fruiter"));assert.deepEqual(preview.effects.rewards,[]);
 let incremental=s;for(let t=NOW+1000;t<=at;t+=1000)incremental=advanceGarden(incremental,t,()=>.5).state;
 assert.deepEqual(incremental.inventory,server.state.inventory);assert.equal(incremental.totalFruit,server.state.totalFruit);
 assert.ok(geneticsRandom(s.geneticsSeed,1,0)!==geneticsRandom(s.geneticsSeed,1,1));
});
test("newly projected pears can be planted, thrown or bulk discarded before periodic save",()=>{
 const s=mature(planted({attack:5,defense:5}));s.geneticsSeed=42;
 const at=NOW+FRUIT_WORK*2,p=advanceGarden(s,at,mid).state.inventory;
 assert.equal(p.length,2);
 const plant=gardenAction(s,{kind:"plant",plot:1,fruitId:p[0].id},at,0,mid);assert.equal(plant.applied,true);assert.equal(plant.state.plots[1].attack,p[0].attack);
 const hit=gardenAction(s,{kind:"throw",target:"enemy",fruitId:p[0].id},at,0,mid);assert.equal(hit.applied,true);assert.equal(hit.state.inventory.length,1);
 const clear=gardenAction(s,{kind:"clearInventory",fruitIds:p.map(x=>x.id)},at+FRUIT_WORK,0,mid);assert.equal(clear.applied,true);assert.equal(clear.state.inventory.length,1);assert.equal(clear.effects.coins,3);
 const discard=gardenAction(s,{kind:"discardMany",fruitIds:[p[0].id]},at,0,mid);assert.equal(discard.applied,true);assert.deepEqual(discard.state.inventory,[p[1]]);
});
test("server migrates a legacy garden to a stable genetics seed and settles projected fruit exactly once",async()=>{
 const root="documents",uid="live-preview",user="users/"+uid,path=user+"/privateGames/givingTree";
 const old=mature(planted({attack:2.7,defense:3.1}));
 const store=new Map([[user,{updateTime:"1",fields:{status:{stringValue:"active"}}}],[path,{updateTime:"2",fields:{payload:{stringValue:JSON.stringify({state:old})}}}]]);let commits=0,clock=NOW;
 const read=async p=>store.get(p)||null,commit=async writes=>{commits++;for(const w of writes)if(w.update)store.set(w.update.name.slice(root.length+1),{updateTime:String(commits+2),fields:w.update.fields});return true;};
 const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
 const call=(kind,n,revision,extra={})=>gardenWithStorage({read,commit,root,uid,input:{kind,requestId:id(n),revision,...extra},clock:()=>clock,rng:()=>.125});
 const a=await call("sync",1,0);assert.ok(Number.isInteger(a.state.geneticsSeed));
 clock+=FRUIT_WORK;
 const expected=advanceGarden(a.state,clock,mid).state.inventory[0];
 const b=await call("plant",2,a.state.revision,{plot:1,fruitId:expected.id});
 assert.equal(b.applied,true);assert.equal(b.state.plots[1].attack,expected.attack);assert.equal(b.state.plots[1].defense,expected.defense);assert.equal(b.wallet,1);
 const retry=await call("plant",2,a.state.revision,{plot:1,fruitId:expected.id});assert.equal(retry.wallet,1);assert.equal(commits,2);assert.equal(b.state.geneticsSeed,a.state.geneticsSeed);
});
