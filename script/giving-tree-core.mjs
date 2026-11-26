
export const PLOTS=4,INVENTORY_CAP=40,INVENTORY_STEP=10,INVENTORY_MAX=1000,WATER_MS=600000,FERT_MS=300000,FERT_COST=5,FERT_SPEED=4,FRUIT_WORK=45000;
export const inventoryCapacity=s=>Math.max(INVENTORY_CAP,s?.inventoryCapacity||INVENTORY_CAP,s?.inventory?.length||0);
export const inventoryUpgradeCost=s=>25+15*Math.floor((inventoryCapacity(s)-INVENTORY_CAP)/INVENTORY_STEP);
export const PEAR_AXOLOTLS=[["pearlie","Pearlie","#d9ef9c","#89b75d","pear"]];
export const PEARLIE_CHANCE=.01;
export const fruiterChance=bosses=>Math.min(1,(1+.25*bosses)/10000);
export const growthWork=t=>Math.ceil(180000*(1+.12*(t.attack+t.defense-2)));
export const stage=t=>t.growth>=growthWork(t)?3:Math.min(2,Math.floor(t.growth/growthWork(t)*3));
export const stageNames=["Seedling","Sapling","Young tree","Fully grown"];
export function makeTree(pear){return {attack:pear.attack,defense:pear.defense,growth:0,fruitWork:0,water:0,fertilizer:0};}
export function makeOpponent(kind,index){
 const boss=kind==="boss";
 const attack=boss?Math.min(1e12,Math.ceil(5*1.28**index)):2+Math.floor(index/2);
 const defense=boss?Math.min(1e12,Math.ceil(5*1.25**index)):2+Math.ceil(index/2);
 const maxHp=boss?Math.min(1e12,Math.ceil(18*1.32**index)):4+Math.floor(index*1.5);
 return {kind,index,attack,defense,maxHp,hp:maxHp,deadline:0};
}
export function initialGarden(now){
 return {version:2,revision:0,lastAt:now,inventoryCapacity:INVENTORY_CAP,plots:[null,null,null,null],inventory:[{id:1,attack:1,defense:1}],nextFruitId:2,enemiesUnlocked:false,bossesUnlocked:false,enemiesDefeated:0,bossesDefeated:0,enemy:makeOpponent("enemy",0),boss:makeOpponent("boss",0),totalFruit:0,totalCoins:0,coinQuarters:0};
}
const copy=s=>({...s,version:2,inventoryCapacity:inventoryCapacity(s),plots:s.plots.map(t=>t?{...t}:null),inventory:s.inventory.map(p=>({...p})),enemy:{...s.enemy},boss:{...s.boss}});
const effects=()=>({coins:0,spent:0,fruits:0,rewards:[],enemies:0,bosses:0});
function credit(s,fx,quarters){
 const units=s.coinQuarters+quarters,whole=Math.floor(units/4);
 s.coinQuarters=units%4;s.totalCoins+=whole;fx.coins+=whole;return whole;
}
function unlock(s){
 if(s.plots.some(t=>t&&Math.max(t.attack,t.defense)>=2))s.enemiesUnlocked=true;
 if(s.plots.some(t=>t&&Math.max(t.attack,t.defense)>=5))s.bossesUnlocked=true;
}
function variant(stat,rng){
 // Uniform independent hundredth-point changes from -0.50 to +0.50.
 // Integer hundredths avoid floating-point drift over generations.
 const delta=Math.max(-50,Math.min(50,Math.floor(rng()*101)-50));
 return Math.max(100,Math.min(Number.MAX_SAFE_INTEGER-100,Math.round(stat*100)+delta))/100;
}
// Only genetics are deterministic. Collectible rolls remain private server RNG.
export function geneticsRandom(seed,id,axis){
 let x=(seed^Math.imul(id,0x9e3779b1)^Math.imul(axis+1,0x85ebca6b))>>>0;
 x=Math.imul(x^(x>>>16),0x7feb352d);
 x=Math.imul(x^(x>>>15),0x846ca68b);
 return ((x^(x>>>16))>>>0)/4294967296;
}
function fruit(s,t,fx,rng){
 const id=s.nextFruitId++;
 const statRng=axis=>Number.isInteger(s.geneticsSeed)?()=>geneticsRandom(s.geneticsSeed,id,axis):rng;
 s.inventory.push({id,attack:variant(t.attack,statRng(0)),defense:variant(t.defense,statRng(1))});
 s.totalFruit++;fx.fruits++;credit(s,fx,4);
 if(s.bossesDefeated>0&&rng()<PEARLIE_CHANCE&&!fx.rewards.includes("pearlie"))fx.rewards.push("pearlie");
 if(rng()<fruiterChance(s.bossesDefeated)&&!fx.rewards.includes("fruiter"))fx.rewards.push("fruiter");
}
function need(t){return stage(t)<3?growthWork(t)-t.growth:Math.max(0,FRUIT_WORK-t.fruitWork);}
function active(t,space){return t&&(stage(t)<3||space)&&t.water>0;}
function timeToEvent(t,space){
 if(!t||stage(t)===3&&!space)return Infinity;
 const work=need(t);if(!work)return 0;
 if(!active(t,space))return Infinity;
 const fast=Math.min(t.water,t.fertilizer);
 const dt=work<=fast*FERT_SPEED?Math.ceil(work/FERT_SPEED):fast+work-fast*FERT_SPEED;
 return dt<=t.water?dt:Infinity;
}
function progress(t,dt,space){
 if(!active(t,space)||dt<=0)return;
 const used=Math.min(dt,t.water),boost=Math.min(used,t.fertilizer),work=used+(FERT_SPEED-1)*boost;
 t.water-=used;t.fertilizer-=boost;
 if(stage(t)<3){const required=growthWork(t)-t.growth,applied=Math.min(required,work);t.growth+=applied;t.fruitWork+=work-applied;}
 else t.fruitWork+=work;
}
function heal(s,now){
 if(s.boss.deadline&&now>=s.boss.deadline){s.boss.hp=s.boss.maxHp;s.boss.deadline=0;}
}
export function advanceGarden(state,now,rng=Math.random){
 const s=copy(state),fx=effects();now=Math.max(s.lastAt,Math.floor(now));let at=s.lastAt;
 // At most four maturity events plus available inventory slots. Work is
 // integrated in timestamp chunks, never one loop per second offline.
 for(;;){
  const space=s.inventory.length<inventoryCapacity(s);
  let dt=Math.min(now-at,...s.plots.map(t=>timeToEvent(t,space)));
  if(!Number.isFinite(dt)||dt<0)throw Error("Invalid garden time.");
  for(const t of s.plots)if(t)progress(t,dt,space);
  at+=dt;
  let emitted=false;
  for(const t of s.plots){
   if(t&&stage(t)===3&&t.fruitWork>=FRUIT_WORK&&s.inventory.length<inventoryCapacity(s)){
    t.fruitWork-=FRUIT_WORK;fruit(s,t,fx,rng);emitted=true;
   }
  }
  if(at>=now)break;
  // Maturity transitions use positive dt; zero-time ripe fruit can be
  // collected after a previous action freed inventory space.
  if(dt===0&&!emitted)throw Error("Garden failed to advance.");
 }
 s.lastAt=now;heal(s,now);unlock(s);return {state:s,effects:fx};
}
export function sortedPears(inventory,sort="newest"){
 const stat=p=>sort==="attack"?p.attack:sort==="defense"?p.defense:p.attack+p.defense;
 return [...inventory].sort((a,b)=>sort==="newest"?b.id-a.id:stat(b)-stat(a)||b.id-a.id);
}
export function damage(pear,opponent){
 return pear.defense<opponent.attack||pear.attack<=opponent.defense?0:Math.max(0,Math.round(pear.attack*100)-Math.round(opponent.defense*100))/100;
}
export function dropQuarters(opponent){
 return opponent.kind==="boss"?40+2*(opponent.attack+opponent.defense):20+opponent.attack+opponent.defense;
}
export const dropCoins=opponent=>dropQuarters(opponent)/4;
function ensureSeed(s){
 if(!s.plots.some(Boolean)&&!s.inventory.length)s.inventory.push({id:s.nextFruitId++,attack:1,defense:1});
}
export function gardenAction(state,action,now,wallet=0,rng=Math.random){
 const result=advanceGarden(state,now,rng),s=result.state,fx=result.effects;
 const done=(applied,message)=>({...result,applied,message});
 const bad=m=>done(false,m);
 const idx=Number.isInteger(action.plot)&&action.plot>=0&&action.plot<PLOTS?action.plot:-1,t=s.plots[idx];
 const pi=s.inventory.findIndex(p=>p.id===action.fruitId),pear=s.inventory[pi];
 if(action.kind==="sync")return done(true,"");
 if(action.kind==="upgradeInventory"){
  const current=inventoryCapacity(s),cost=inventoryUpgradeCost(s);
  if(current>=INVENTORY_MAX)return bad("Inventory has reached its storage limit.");
  if(wallet+fx.coins<cost)return bad("Not enough Star Coins to expand inventory.");
  s.inventoryCapacity=Math.min(INVENTORY_MAX,current+INVENTORY_STEP);fx.spent=cost;
  return done(true,"Inventory expanded to "+s.inventoryCapacity.toLocaleString()+" pear slots.");
 }
 if(action.kind==="plant"){
  if(idx<0||t||!pear)return bad("Select a pear and an empty plot.");
  s.plots[idx]=makeTree(pear);s.inventory.splice(pi,1);unlock(s);
  return done(true,"A new pear seedling has been planted. Water it to begin growing.");
 }
 if(action.kind==="water"){
  if(!t)return bad("Plant a tree first.");
  t.water=WATER_MS;return done(true,"Tree watered.");
 }
 if(action.kind==="fertilize"){
  if(!t)return bad("Plant a tree first.");
  const quantity=action.quantity,cost=quantity*FERT_COST;
  if(!Number.isSafeInteger(quantity)||quantity<1||!Number.isSafeInteger(cost)||!Number.isSafeInteger(t.fertilizer+quantity*FERT_MS))return bad("Invalid fertilizer quantity.");
  if(wallet+fx.coins<cost)return bad("Not enough Star Coins for fertilizer.");
  t.fertilizer+=quantity*FERT_MS;fx.spent=cost;
  return done(true,"Fertilizer applied. Growth is four times faster while watered.");
 }
 if(action.kind==="cut"){
  if(!t||stage(t)!==3)return bad("Only fully grown trees can be cut down.");
  s.plots[idx]=null;ensureSeed(s);return done(true,"Tree removed. Its plot is ready for a new pear.");
 }
 if(action.kind==="discard"||action.kind==="discardMany"||action.kind==="clearInventory"){
  // Use IDs from the confirmed view, not the newly generated inventory.
  // Fruit generated during the request survives a bulk clear.
  const ids=action.kind==="discard"?[action.fruitId]:action.fruitIds;
  if(!Array.isArray(ids)||!ids.length||ids.length>INVENTORY_MAX||ids.some(id=>!Number.isSafeInteger(id)||id<1))return bad("Invalid pear selection.");
  const targets=new Set(ids);
  if(targets.size!==ids.length)return bad("Duplicate pear selection.");
  const known=new Set(s.inventory.map(p=>p.id));
  if(ids.some(id=>!known.has(id)))return bad("Your inventory changed. Select pears again.");
  if(action.kind==="clearInventory"&&state.inventory.some(p=>!targets.has(p.id)))return bad("Review the full inventory before clearing.");
  s.inventory=s.inventory.filter(p=>!targets.has(p.id));ensureSeed(s);
  return done(true,targets.size.toLocaleString()+" pear"+(targets.size===1?"":"s")+" discarded.");
 }
 if(action.kind==="throw"){
  const kind=action.target;
  if(!["enemy","boss"].includes(kind)||!s[kind==="enemy"?"enemiesUnlocked":"bossesUnlocked"])return bad("That battle is not unlocked.");
  if(!pear||action.fruitIds!==undefined)return bad("Select exactly one pear to throw.");
  const op=s[kind],hit=damage(pear,op);
  s.inventory.splice(pi,1);
  if(kind==="boss"&&!op.deadline)op.deadline=s.lastAt+30000;
  if(hit===0){ensureSeed(s);return done(true,"The pear was blocked! It dealt no damage.");}
  op.hp=Math.max(0,Math.round(op.hp*100)-Math.round(hit*100))/100;
  if(op.hp===0){
   const earned=credit(s,fx,dropQuarters(op));
   if(kind==="boss"){s.bossesDefeated++;fx.bosses++;s.boss=makeOpponent(kind,s.bossesDefeated);}
   else{s.enemiesDefeated++;fx.enemies++;s.enemy=makeOpponent(kind,s.enemiesDefeated);}
   ensureSeed(s);return done(true,(kind==="boss"?"Boss":"Enemy")+" defeated! "+earned.toLocaleString()+" whole Star Coins credited.");
  }
  ensureSeed(s);return done(true,"Pear dealt "+hit.toLocaleString()+" damage.");
 }
 return bad("Unknown garden action.");
}
