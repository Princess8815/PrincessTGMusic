
export const TICK_MS=50,LANES=5,CHECKPOINT_TICKS=300,MAX_BATCH=340;
export const REEF_REWARDS=[["appey","Appey","#f7a5a2","#a62f46","leaf"],["fruiter","Fruiter","#ffda78","#ee8b62","crown"]];
export const TROPHY=["apple-tree-basket","Orchard Master","Score at least 1,000 points in a single Apple Catcher game."];
export function difficulty(tick){return Math.floor(tick/600);}
export function fruiterDenominator(tick){return Math.max(500,Math.floor(10000/(1+difficulty(tick)*.20)));}
function random(seed){let x=seed|0;x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0||1;}
export function newGame(seed){return {tick:0,seed:seed>>>0||1,score:0,lives:3,lane:2,target:2,nextSpawn:10,apples:[],done:false};}
export function step(s,target=s.target){
 if(s.done)return {state:s,catches:[]};
 const tick=s.tick+1,level=difficulty(tick),lane=tick%2===0?s.lane+Math.sign(target-s.lane):s.lane;
 let {seed,nextSpawn,score,lives}=s,apples=s.apples.slice(),catches=[];
 if(tick>=nextSpawn){
  seed=random(seed);const column=seed%LANES;seed=random(seed);
  const rotten=seed%100<Math.min(25,13+level);
  const flight=Math.max(16,60-level*3);
  // Do not schedule two arrivals on the same tick.
  const due=Math.max(tick+flight,(apples.at(-1)?.due||0)+Math.max(9,24-level));
  apples.push({lane:column,rotten,born:tick,due});
  nextSpawn=tick+Math.max(9,24-level);
 }
 const pending=[];
 for(const apple of apples){
  if(apple.due>tick){pending.push(apple);continue;}
  if(apple.rotten){if(apple.lane===lane)lives--;}
  else if(apple.lane===lane){score++;catches.push({score,tick});}
  else lives--;
 }
 return {state:{tick,seed,score,lives:Math.max(0,lives),lane,target,nextSpawn,apples:pending,done:lives<=0},catches};
}
export function replay(s,to,moves){
 if(!Number.isInteger(to)||to<s.tick||to-s.tick>MAX_BATCH||!Array.isArray(moves)||moves.length>MAX_BATCH)throw Error("Invalid checkpoint.");
 let last=s.tick;for(const m of moves){if(!Array.isArray(m)||m.length!==2||!Number.isInteger(m[0])||m[0]<=last||m[0]>to||!Number.isInteger(m[1])||m[1]<0||m[1]>=LANES)throw Error("Invalid basket movement.");last=m[0];}
 let i=0,catches=[];while(s.tick<to&&!s.done){const target=moves[i]?.[0]===s.tick+1?moves[i++][1]:s.target;const next=step(s,target);s=next.state;catches.push(...next.catches);}
 if(s.tick!==to)throw Error("Checkpoint exceeds the end of the run.");
 return {state:s,catches};
}
export function rollRewards(catches,randomInt){
 const found=new Set();for(const c of catches){
  if(c.score>=50&&randomInt(5)===0)found.add("appey");
  if(randomInt(fruiterDenominator(c.tick))===0)found.add("fruiter");
  if(c.score===1000)found.add("apple-tree-basket");
 }return [...found];
}
