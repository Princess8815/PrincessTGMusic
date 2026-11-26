
export const WIDTH=960,HEIGHT=540,GROUND=502,SLING={x:115,y:390},PRICE=100,WIN_COINS=10;
export const SPECIALS=["aqualily","bulky","sploder","sniper"],TYPES=["marina",...SPECIALS];
export const AXOLOTLS={
 marina:{name:"Marina",color:"#ffa9c3",gill:"#e85f91",description:"Your regular slingshot friend."},
 aqualily:{name:"Aqualily",color:"#9ce8ef",gill:"#7ca9e2",description:"Splits into three flying axolotls."},
 bulky:{name:"Bulky",color:"#b0cf93",gill:"#698f65",description:"Heavy enough to break thick branches."},
 sploder:{name:"Sploder",color:"#ffc77c",gill:"#f1855a",description:"A harmless burst knocks nearby oranges loose."},
 sniper:{name:"Sniper",color:"#c5b2f6",gill:"#8874ce",description:"Choose any remaining orange for a guaranteed hit."}
};
export const ORANGE_AXOLOTLS=[["tangie","Tangie","#ffb75d","#ee7943","orange"]];
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
function layoutRandom(seed){let x=seed>>>0;return ()=>{x=(x+0x6d2b79f5)>>>0;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export const fruiterChance=level=>Math.min(1,(1+.25*(level-1))/10000);
export const tangieChance=level=>level>10?.01:0;
export function layout(level,seed){
 const rng=layoutRandom((seed^Math.imul(level,0x9e3779b1))>>>0),count=Math.min(8,3+Math.floor((level-1)/3)),branches=[],oranges=[];
 const slots=[{x:420,y:320},{x:680,y:225},{x:510,y:125},{x:780,y:365},{x:370,y:215},{x:750,y:105},{x:540,y:415},{x:615,y:295}];
 for(let i=0;i<count;i++){
  const a=slots[i],x=a.x+Math.round((rng()-.5)*34),y=a.y+Math.round((rng()-.5)*26),length=95+Math.floor(rng()*55),slope=Math.round((rng()-.5)*32);
  const hp=level>=5&&i%3===1?2:1;
  branches.push({id:i,x1:x,y1:y,x2:x+length,y2:y+slope,hp});
  const n=2+(level>=4&&rng()<.65?1:0);
  for(let j=0;j<n;j++){const u=(j+1)/(n+1);oranges.push({id:oranges.length,branch:i,x:Math.round(x+length*u),y:Math.round(y+slope*u+24)});}
 }
 return {branches,oranges,shots:branches.reduce((n,b)=>n+b.hp,0)+2};
}
export function freshLevel(level,seed){const map=layout(level,seed);return {hp:map.branches.map(b=>b.hp),remaining:map.oranges.map(o=>o.id),marina:map.shots,won:false};}
export function initialOrange(seed){return {version:1,revision:0,seed:seed>>>0,level:1,cleared:0,inventory:Object.fromEntries(SPECIALS.map(t=>[t,3])),board:freshLevel(1,seed)};}
export function validShot(shot){
 if(!shot||!TYPES.includes(shot.type))return false;
 if(shot.type==="sniper")return Number.isInteger(shot.target)&&shot.target>=0&&shot.target<32;
 return Number.isInteger(shot.angle)&&shot.angle>=-20&&shot.angle<=80&&Number.isInteger(shot.power)&&shot.power>=1&&shot.power<=100;
}
export function velocity(angle,power){const rad=angle*Math.PI/180,speed=5+power*.19;return {vx:Math.cos(rad)*speed,vy:-Math.sin(rad)*speed};}
function distanceSegment(x,y,b){const dx=b.x2-b.x1,dy=b.y2-b.y1,u=clamp(((x-b.x1)*dx+(y-b.y1)*dy)/(dx*dx+dy*dy),0,1);return Math.hypot(x-b.x1-u*dx,y-b.y1-u*dy);}
export function simulateShot(map,board,shot,trace=false){
 if(!validShot(shot))throw Error("Invalid shot.");
 const hp=[...board.hp],remaining=new Set(board.remaining),events=[],frames=[];
 const drop=(id,t)=>{if(remaining.delete(id))events.push({kind:"orange",id,t});};
 const damageBranch=(id,amount,t)=>{if(!hp[id])return;hp[id]=Math.max(0,hp[id]-amount);events.push({kind:"damage",id,hp:hp[id],t});if(!hp[id]){events.push({kind:"branch",id,t});for(const o of map.oranges)if(o.branch===id)drop(o.id,t);}};
 const blast=(x,y,t)=>{events.push({kind:"blast",x,y,t});for(const b of map.branches)if(hp[b.id]&&distanceSegment(x,y,b)<115)damageBranch(b.id,2,t);for(const o of map.oranges)if(remaining.has(o.id)&&Math.hypot(x-o.x,y-o.y)<130)drop(o.id,t);};
 if(shot.type==="sniper"){
  const o=map.oranges.find(o=>o.id===shot.target&&remaining.has(o.id));if(!o)throw Error("Choose a remaining orange.");
  if(trace)for(let t=0;t<=28;t++){const u=t/28;frames.push([{x:SLING.x+(o.x-SLING.x)*u,y:SLING.y+(o.y-SLING.y)*u-80*Math.sin(Math.PI*u),type:"sniper",r:15}]);}
  drop(o.id,28);
 }else{
  const particles=(shot.type==="aqualily"?[-9,0,9]:[0]).map(a=>({...velocity(shot.angle+a,shot.power),x:SLING.x,y:SLING.y,type:shot.type,r:shot.type==="bulky"?23:shot.type==="aqualily"?11:15,active:true,hit:new Set()}));
  for(let t=0;t<230&&particles.some(p=>p.active);t++){
   if(trace)frames.push(particles.filter(p=>p.active).map(({x,y,type,r})=>({x,y,type,r})));
   for(const p of particles){if(!p.active)continue;p.vy+=.34;
    for(let step=0;step<4&&p.active;step++){
     p.x+=p.vx/4;p.y+=p.vy/4;
     if(p.x>WIDTH+50||p.x<-50||p.y>GROUND-p.r||p.y<-360){if(p.type==="sploder"&&p.y>=GROUND-p.r)blast(p.x,p.y,t);p.active=false;break;}
     for(const o of map.oranges){if(!remaining.has(o.id)||Math.hypot(p.x-o.x,p.y-o.y)>p.r+15)continue;drop(o.id,t);if(p.type==="sploder"){blast(p.x,p.y,t);p.active=false;break;}p.vx*=.88;p.vy*=.88;}
     if(!p.active)break;
     for(const b of map.branches){if(!hp[b.id]||p.hit.has(b.id)||distanceSegment(p.x,p.y,b)>p.r+6)continue;p.hit.add(b.id);if(p.type==="sploder"){blast(p.x,p.y,t);p.active=false;break;}damageBranch(b.id,p.type==="bulky"?3:1,t);if(hp[b.id]){p.vx*=.38;p.vy=-Math.abs(p.vy)*.4-1;}else{p.vx*=.76;p.vy*=.76;}}
    }
   }
  }
 }
 return {hp,remaining:[...remaining],events,frames};
}
export function applyOrange(state,action,rng=Math.random){
 const s={...state,inventory:{...state.inventory},board:{...state.board,hp:[...state.board.hp],remaining:[...state.board.remaining]}};
 const done=(applied,message,coins=0,rewards=[])=>({state:s,applied,message,coins,rewards});
 if(action.kind==="buy"){if(!SPECIALS.includes(action.type))return done(false,"Choose a power-up.");if(s.inventory[action.type]>=9999)return done(false,"Power-up storage is full.");s.inventory[action.type]++;return done(true,AXOLOTLS[action.type].name+" added.",-PRICE);}
 if(action.kind==="retry"){if(s.board.won)return done(false,"This level is already complete.");s.board=freshLevel(s.level,s.seed);return done(true,"Level reset. Used power-ups are not refunded.");}
 if(action.kind==="next"){if(!s.board.won)return done(false,"Clear all the oranges first.");if(s.level>=1000000)return done(false,"Maximum supported level reached.");s.level++;s.board=freshLevel(s.level,s.seed);return done(true,"Level "+s.level+" ready.");}
 if(action.kind!=="shot"||!validShot(action.shot))return done(false,"Invalid shot.");
 if(s.board.won)return done(false,"Level already complete.");
 const shot=action.shot,type=shot.type;if(type==="marina"?s.board.marina<=0:s.inventory[type]<=0)return done(false,"No "+AXOLOTLS[type].name+" throws left.");
 let result;try{result=simulateShot(layout(s.level,s.seed),s.board,shot);}catch(e){return done(false,e.message);}
 if(type==="marina")s.board.marina--;else s.inventory[type]--;
 s.board.hp=result.hp;s.board.remaining=result.remaining;
 if(!result.remaining.length){s.board.won=true;s.cleared=Math.max(s.cleared,s.level);const rewards=[];if(rng()<fruiterChance(s.level))rewards.push("fruiter");if(s.level>10&&rng()<tangieChance(s.level))rewards.push("tangie");return done(true,"Level "+s.level+" cleared! +10 Star Coins.",WIN_COINS,rewards);}
 return done(true,result.remaining.length+" oranges left.");
}
