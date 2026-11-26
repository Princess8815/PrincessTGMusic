
import test from "node:test";
import assert from "node:assert/strict";
import {initialGarden,makeTree,stage,growthWork,advanceGarden,gardenAction,damage,dropQuarters,dropCoins,makeOpponent,fruiterChance,INVENTORY_CAP,WATER_MS,FERT_MS,FERT_COST,FRUIT_WORK} from "../../../script/giving-tree-core.mjs";
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
 const r=advanceGarden(s,NOW+600000,()=>.99);assert.equal(r.state.inventory.length,INVENTORY_CAP);assert.equal(r.effects.coins,INVENTORY_CAP);assert.equal(r.state.inventory[0].attack,6);assert.equal(r.state.inventory[0].defense,6);
 assert.equal(advanceGarden(r.state,NOW+86400000,mid).effects.coins,0);
 const lower=advanceGarden(mature(planted({attack:4,defense:4})),NOW+FRUIT_WORK,()=>.01);assert.equal(lower.state.inventory[0].attack,3);assert.equal(lower.state.inventory[0].defense,3);
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
