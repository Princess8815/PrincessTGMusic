
export const ROUND_MS=30000,PEACH_COUNT=52,MASTERY_SCORE=240;
export const PEACH_AXOLOTLS=[["peachiboo","Peachiboo","#ffc7a5","#eb8d8d","peach"]];
export const PEACH_TROPHY=["peach-panic-mastery","Peach Panic Mastery","Score 240 points or higher in one 30-second Peach Panic game."];
export const SLOTS=[[19,36],[35,31],[51,28],[67,31],[82,36],[13,54],[31,50],[49,47],[69,51],[88,55],[30,68],[70,68]];
function random(seed){let x=seed|0;x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0||1;}
export function orchard(seed){
 const free=SLOTS.map(()=>0),out=[];let state=seed>>>0||1;
 for(let id=0;id<PEACH_COUNT;id++){
  const born=id*500;
  state=random(state);const ripen=2800+state%1001;
  state=random(state);const available=free.map((time,i)=>time<=born?i:-1).filter(i=>i>=0);
  if(!available.length)throw Error("Orchard slot scheduling failed.");
  const slot=available[state%available.length];
  state=random(state);const blue=state%12===0,expires=born+ripen+1400;
  free[slot]=expires;
  out.push({id,slot,born,ripen,expires,blue});
 }
 return out;
}
export function peachPoints(p,at){
 const age=at-p.born;if(age<0||at>=p.expires||at>=ROUND_MS)return 0;
 const delta=Math.abs(age-p.ripen);
 const points=delta<=150?5:delta<=350?4:delta<=650?3:delta<=1000?2:age>=p.ripen*.45?1:0;
 return points*(p.blue?2:1);
}
export function replayPeaches(seed,picks){
 if(!Array.isArray(picks)||picks.length>PEACH_COUNT)throw Error("Invalid harvest log.");
 const peaches=orchard(seed),seen=new Set();let score=0,blue=0,perfect=0,previous=-1;
 for(const pick of picks){
  if(!Array.isArray(pick)||pick.length!==2||!Number.isInteger(pick[0])||!Number.isInteger(pick[1]))throw Error("Invalid peach pick.");
  const [id,at]=pick,p=peaches[id];
  if(!p||seen.has(id)||at<previous||at<p.born||at>=p.expires||at>=ROUND_MS)throw Error("Invalid peach timing.");
  seen.add(id);previous=at;
  const points=peachPoints(p,at);score+=points;
  if(p.blue)blue++;
  if(Math.abs(at-p.born-p.ripen)<=150)perfect++;
 }
 return {score,blue,perfect,picked:picks.length};
}
export const fruiterChance=score=>score>0?Math.min(1,Math.sqrt(score)/10000):0;
export function peachRewards(result,rng){
 const found=[];
 if(result.blue>0&&rng()< -Math.expm1(result.blue*Math.log1p(-.2)))found.push("peachiboo");
 if(result.score>0&&rng()<fruiterChance(result.score))found.push("fruiter");
 if(result.score>=MASTERY_SCORE)found.push(PEACH_TROPHY[0]);
 return found;
}
