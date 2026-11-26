
export const MAX_TREES=12,MAX_PRESTIGE=20,STAR_SCALE=1000000;
export const CHERRY_TROPHY=["cherry-garden-mastery","Cherry Garden Mastery","Prestige all 12 cherry trees at least three times."];
export const masteryCount=s=>s.trees.filter(t=>t.prestige>=3).length;
export const hasMastery=s=>s.trees.length===MAX_TREES&&masteryCount(s)===MAX_TREES;
export const CHERRY_AXOLOTLS=[["cheribelle","Cheribelle","#ffc0d0","#c83962","cherries"]];
export const FRUITER_CHANCE=1/20000,CHERIBELLE_CHANCE=1/100;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export const caps=t=>({speed:5+2*t.prestige,yield:5+2*t.prestige,auto:3+t.prestige,capacity:5+2*t.prestige,star:Infinity,starMultiplier:Infinity});
export const fruitInterval=t=>Math.max(5000,Math.round(30000*(1+.4*t.prestige)/(1+.22*t.speed)));
export const autoInterval=t=>Math.max(fruitInterval(t),Math.round(120000/(1+.65*Math.max(0,t.auto-1))));
export const slotsPerGrowth=t=>1+t.yield;
export const prestigeMultiplier=t=>1+2*t.prestige;
export const yieldPerFruit=t=>prestigeMultiplier(t)*slotsPerGrowth(t);
export const treeCapacity=t=>10+5*t.prestige+10*(t.capacity||0);
export const prestigeReady=t=>t.prestige<MAX_PRESTIGE&&["speed","yield","auto","capacity"].every(k=>(t[k]||0)>=caps(t)[k]);
export function starChance(t){
 const linear=.001+.0015*t.star;
 if(linear<=.1)return linear;
 const excess=linear-.1;
 return Math.min(1-Number.EPSILON,.1+.9*excess/(.9+excess));
}
// Starts near +5 percentage points per level; marginal gains decrease
// logarithmically, with no game-defined level or multiplier cap.
export const starMultiplier=t=>1+2.5*Math.log1p((t.starMultiplier||0)/50);
export const starMultiplierUnits=t=>Math.round(starMultiplier(t)*STAR_SCALE);
export const starFraction=s=>(s.starCarry||0)/STAR_SCALE;
export const pendingStarValue=t=>t.pendingStars+(t.pendingStarMicros||0)/STAR_SCALE;
export const treePrice=count=>Math.ceil(80*Math.pow(2.25,count-1));
export const growDuration=count=>600000*count;
export const prestigePrice=t=>250*(t.prestige+1)**2;
export function upgradePrice(t,kind){
 const l=t[kind]||0;
 if(kind==="star")return Math.ceil(l<=10?100*1.7**l:100*1.7**10*(1+(l-10)/8)**2);
 if(kind==="starMultiplier")return Math.ceil(150*(l+1)**1.7);
 return ({speed:5,yield:8,auto:20,capacity:10}[kind]||0)*(1+t.prestige)*(l+1)**2;
}
export function makeTree(id,now,delay=0,prestige=0,star=0,starMultiplier=0){
 const t={id,prestige,star,starMultiplier,speed:0,yield:0,auto:0,capacity:0,matureAt:now+delay,fruit:0,pendingCherries:0,pendingStars:0,pendingStarMicros:0,nextFruitAt:0,nextAutoAt:0};
 t.nextFruitAt=t.matureAt+fruitInterval(t);return t;
}
export function initialEmpire(now){return {version:4,revision:0,cherries:0,starCarry:0,trees:[makeTree(1,now)],totalHarvests:0,totalCherries:0,totalStars:0,lastAt:now};}
export const countDue=(first,interval,now)=>first>0&&first<=now?Math.floor((now-first)/interval)+1:0;
export function chanceAtLeastOne(n,p){return n<=0?0:p>=1?1:-Math.expm1(n*Math.log1p(-p));}
// Exact binomial sampling via beta order-statistic splitting: large offline
// balances do not require one random draw per fruit. Gamma rejection is constant
// expected work; the recursion reduces n geometrically.
function normal(rng){return Math.sqrt(-2*Math.log(rng()))*Math.cos(2*Math.PI*rng());}
function gamma(shape,rng){const d=shape-1/3,c=1/Math.sqrt(9*d);for(;;){const x=normal(rng);let v=1+c*x;if(v<=0)continue;v=v**3;const u=rng();if(u<1-.0331*x**4||Math.log(u)<.5*x*x+d*(1-v+Math.log(v)))return d*v;}}
export function binomial(n,p,rng){
 if(n<=0||p<=0)return 0;if(p>=1)return n;
 if(p>.5)return n-binomial(n,1-p,rng);
 if(n<=32){let k=0;for(let i=0;i<n;i++)if(rng()<p)k++;return k;}
 if(n*p<16){let k=0,pos=0;const log=Math.log1p(-p);for(;;){pos+=Math.floor(Math.log(rng())/log)+1;if(pos>n)return k;k++;}}
 const a=Math.floor(n/2)+1,b=n-a+1,x=gamma(a,rng),y=gamma(b,rng),v=x/(x+y);
 return v>=p?binomial(a-1,clamp(p/v,0,1),rng):a+binomial(b-1,clamp((p-v)/(1-v),0,1),rng);
}
const copy=s=>({starCarry:0,...s,version:4,trees:s.trees.map(t=>{
 const next={capacity:0,starMultiplier:0,pendingStarMicros:0,...t};
 // Previously fruit counted growth cycles, not the actual fruit occupying slots.
 // Preserve all existing ripe value and stars, including over-cap legacy crops.
 if((s.version||1)<3)next.fruit=Math.max(next.fruit,Math.ceil(next.pendingCherries/prestigeMultiplier(next)));
 return next;
})});
const emptyEffects=()=>({cherries:0,coins:0,harvests:0,eligibleHarvests:0});
function credit(s,t,fx,count){
 if(!t.fruit||count<=0)return;
 const carry=(s.starCarry||0)+(t.pendingStarMicros||0);
 const whole=t.pendingStars+Math.floor(carry/STAR_SCALE);
 s.starCarry=carry%STAR_SCALE;
 s.cherries+=t.pendingCherries;s.totalCherries+=t.pendingCherries;s.totalStars+=whole;s.totalHarvests+=count;
 fx.cherries+=t.pendingCherries;fx.coins+=whole;fx.harvests+=count;
 if(s.trees.length>=2)fx.eligibleHarvests+=count;
 t.fruit=0;t.pendingCherries=0;t.pendingStars=0;t.pendingStarMicros=0;
}
function addFruit(t,slots,cycles,sample){
 if(slots<=0)return;
 t.fruit+=slots;t.pendingCherries+=slots*prestigeMultiplier(t);
 // Keep the existing Star Coin probability per successful growth cycle.
 const hits=sample(cycles,starChance(t));
 if(hits){
  // Exact fixed-point accumulation; only whole coins leave the orchard.
  const micros=BigInt(hits)*BigInt(starMultiplierUnits(t))+BigInt(t.pendingStarMicros||0);
  t.pendingStars+=Number(micros/BigInt(STAR_SCALE));
  t.pendingStarMicros=Number(micros%BigInt(STAR_SCALE));
 }
}
function grow(t,until,sample){
 const interval=fruitInterval(t),n=countDue(t.nextFruitAt,interval,until);
 if(n){
  const slots=Math.min(n*slotsPerGrowth(t),Math.max(0,treeCapacity(t)-t.fruit));
  addFruit(t,slots,Math.ceil(slots/slotsPerGrowth(t)),sample);
  t.nextFruitAt+=n*interval;
 }
}
// Process the first auto harvest separately (it may contain existing fruit).
// Later intervals contain either floor or ceil(autoInterval/fruitInterval)
// growth cycles. Count both kinds, applying the capacity independently to each.
// This is exact even when a yield upgrade only partly fits the remaining slots.
export function advance(state,now,sample=()=>0){
 const s=copy(state),fx=emptyEffects();now=Math.max(s.lastAt,Math.floor(now));
 for(const t of s.trees){
  if(t.auto>0){
   const interval=autoInterval(t),n=countDue(t.nextAutoAt,interval,now);
   if(n){
    const first=t.nextAutoAt,last=first+(n-1)*interval;
    grow(t,first,sample);credit(s,t,fx,1);
    if(n>1){
     const arrivals=countDue(t.nextFruitAt,fruitInterval(t),last);
     const periods=n-1,low=Math.floor(interval/fruitInterval(t));
     const highCount=arrivals-periods*low,lowCount=periods-highCount;
     const per=slotsPerGrowth(t),cap=treeCapacity(t);
     const lowSlots=Math.min(cap,low*per),highSlots=Math.min(cap,(low+1)*per);
     const slots=lowCount*lowSlots+highCount*highSlots;
     const cycles=lowCount*Math.ceil(lowSlots/per)+highCount*Math.ceil(highSlots/per);
     addFruit(t,slots,cycles,sample);
     t.nextFruitAt+=arrivals*fruitInterval(t);
     credit(s,t,fx,n-1);
    }
    t.nextAutoAt+=n*interval;
   }
  }
  grow(t,now,sample);
 }
 s.lastAt=now;return {state:s,effects:fx};
}
export function applyAction(state,action,now,sample=()=>0){
 const result=advance(state,now,sample),s=result.state,fx=result.effects;let message="";
 const pay=n=>{if(!Number.isSafeInteger(n)||n<0||s.cherries<n)return false;s.cherries-=n;return true;};
 const bad=m=>({...result,message:m,applied:false});
 now=s.lastAt;
 if(action.kind==="sync")return {...result,message,applied:true};
 if(action.kind==="buyTree"){
  if(s.trees.length>=MAX_TREES)return bad("Your orchard is at its tree limit.");
  if(!pay(treePrice(s.trees.length)))return bad("Not enough cherries for another tree.");
  s.trees.push(makeTree(s.trees.length+1,now,growDuration(s.trees.length)));message="A new cherry tree has been planted!";
 }else if(action.kind==="harvestAll"){
  for(const t of s.trees)credit(s,t,fx,1);
  if(!fx.harvests)return bad("There are no ripe cherries to harvest.");
  message="Orchard harvested.";
 }else{
  const i=s.trees.findIndex(t=>t.id===action.treeId),t=s.trees[i];
  if(!t)return bad("Tree not found.");
  if(action.kind==="harvest"){
   if(!t.fruit)return bad("This tree has no ripe cherries.");
   credit(s,t,fx,1);message="Tree harvested.";
  }else if(action.kind==="upgrade"){
   const k=action.upgrade;
   if(!["speed","yield","auto","capacity","star","starMultiplier"].includes(k))return bad("Unknown upgrade.");
   if(t[k]>=caps(t)[k])return bad("Upgrade is at its current cap.");
   if(!pay(upgradePrice(t,k)))return bad("Not enough cherries for that upgrade.");
   const oldInterval=fruitInterval(t),oldAuto=t.auto?autoInterval(t):0,oldNext=t.nextFruitAt,oldNextAuto=t.nextAutoAt;
   t[k]++;
   // Preserve fraction of elapsed growth; never create a free harvest on upgrade.
   if(k==="speed"){
    const start=Math.max(now,t.matureAt);
    t.nextFruitAt=start+Math.max(1,Math.ceil(clamp((oldNext-start)/oldInterval,0,1)*fruitInterval(t)));
   }
   if(t.auto&&(k==="speed"||k==="auto")){
    const start=Math.max(now,t.matureAt);
    t.nextAutoAt=start+(oldAuto?Math.max(1,Math.ceil(clamp((oldNextAuto-start)/oldAuto,0,1)*autoInterval(t))):autoInterval(t));
   }
   message=k==="star"?"Permanent Star Coin chance improved.":k==="starMultiplier"?"Permanent Star Coin multiplier improved.":"Tree upgrade purchased.";
  }else if(action.kind==="prestige"){
   if(t.prestige>=MAX_PRESTIGE)return bad("This tree has reached its prestige limit.");
   if(!prestigeReady(t))return bad("Maximize fruit speed, cherry yield, auto harvester and tree capacity before prestige.");
   if(!pay(prestigePrice(t)))return bad("Not enough cherries to prestige.");
   credit(s,t,fx,1);
   const next=t.prestige+1;s.trees[i]=makeTree(t.id,now,180000*next,next,t.star,t.starMultiplier);
   message="Tree prestiged! Permanent Star Coin upgrades were retained.";
  }else return bad("Unknown action.");
 }
 return {...result,message,applied:true};
}
export function rewardCandidates(effects,rng){
 const ids=[];
 if(effects.eligibleHarvests>0&&rng()<chanceAtLeastOne(effects.eligibleHarvests,CHERIBELLE_CHANCE))ids.push("cheribelle");
 if(effects.harvests>0&&rng()<chanceAtLeastOne(effects.harvests,FRUITER_CHANCE))ids.push("fruiter");
 return ids;
}
