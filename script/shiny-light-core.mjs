// Shared deterministic, bounded grid light simulation. 0=N,1=E,2=S,3=W.
export const MAX_LEVEL=1000000, MAX_POWER=9;
export const SHINY_AXOLOTLS=[["shiny","Shiny","#fff2a0","#f9b64c","star"]];
export const FEATURES=[
 ["source","Light source",1],["fruit","Banana",1],["mirror","Mirror",1],["barrier","Barrier",2],
 ["ice","Light-pushed ice",4],["button","Button",6],["buttonDoor","Button door",6],
 ["tee","T-beam splitter",9],["cross","Crossbeam splitter",12],["dampener","Dampener",15],
 ["amplifier","Amplifier",17],["lightDoor","Light door",18],["portal","Portal",21],
 ["changer","Color changer",25],["colorDoor","Color door",25],["coloredFruit","Colored banana",27],
 ["oneWay","One-way mirror",30],["blackHole","Black hole",33],["filter","Color filter",36],
 ["combiner","Beam combiner",40],["linked","Linked mirrors",44],["invertedDoor","Inverted door",48],
 ["continuous","Continuous switch",52],["rotatingPortal","Rotating portal",56],["multiDoor","Multi-condition door",60],
 ["movingMirror","Movable mirror",8],["movingTee","Movable T-beam",10],["movingCross","Movable crossbeam",13],
 ["movingOneWay","Movable one-way mirror",32],["movingBarrier","Movable barrier",5],
 ["movingChanger","Movable color changer",28],["movingFilter","Movable color filter",38],
 ["movingDampener","Movable dampener",16],["movingAmplifier","Movable amplifier",19]
].map(([id,name,level])=>({id,name,level}));
export const TYPES=FEATURES.map(f=>f.id);
export const MOVABLE=new Set(["movingMirror","movingTee","movingCross","movingOneWay","movingBarrier","movingChanger","movingFilter","movingDampener","movingAmplifier"]);
export const ROTATABLE=new Set(["mirror","movingMirror","oneWay","movingOneWay","linked"]);
const baseType=t=>({movingMirror:"mirror",movingTee:"tee",movingCross:"cross",movingOneWay:"oneWay",movingBarrier:"barrier",movingChanger:"changer",movingFilter:"filter",movingDampener:"dampener",movingAmplifier:"amplifier"}[t]||t);
const DX=[0,1,0,-1],DY=[-1,0,1,0],mod=n=>(n+4)%4;
const int=(n,a,b)=>Number.isInteger(n)&&n>=a&&n<=b;
const assert=(ok,m)=>{if(!ok)throw Error(m);};
export const COLORS=["Clear","Red","Green","Yellow","Blue","Magenta","Cyan","White"];
export const COLOR_HEX=["#fff1a1","#ff5151","#55ee78","#ffe13d","#64a8ff","#f778ff","#64f4fa","#ffffff"];
export function difficulty(level){return level>=29&&level%10===9?"super-hard":level>=24&&level%10===4?"hard":"normal";}
export function defaultMilestones(){return Object.fromEntries(FEATURES.map(f=>[f.id,f.level]));}
export function validateMilestones(raw){
 assert(raw&&typeof raw==="object","Invalid unlock schedule.");
 const out=defaultMilestones();
 for(const k of Object.keys(raw)){assert(TYPES.includes(k)&&int(raw[k],1,MAX_LEVEL),"Invalid unlock level.");out[k]=raw[k];}
 for(const k of ["source","fruit","mirror"])assert(out[k]===1,"Source, fruit and mirrors must be available at level 1.");
 return out;
}
const identifier=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,20}$/.test(x);
export function validateDesign(raw,level=1,milestones=defaultMilestones(),checkUnlocks=true){
 assert(raw&&int(raw.width,3,15)&&int(raw.height,3,15),"Grid must be 3 to 15 cells per side.");
 const {width,height}=raw,n=width*height;
 assert(Array.isArray(raw.tiles)&&raw.tiles.length<=n,"Invalid tiles.");
 assert(Array.isArray(raw.stars)&&raw.stars.length===3&&new Set(raw.stars).size===3&&raw.stars.every(i=>int(i,0,n-1)),"Place exactly three distinct stars.");
 const seen=new Set(),tiles=raw.tiles.map(t=>{
  assert(t&&int(t.i,0,n-1)&&!seen.has(t.i)&&TYPES.includes(t.type),"Invalid or overlapping tile.");seen.add(t.i);
  assert(!checkUnlocks||milestones[t.type]<=level,"Feature locked at this level: "+t.type);
  const v={i:t.i,type:t.type,dir:t.dir??0,axis:t.axis??"h",color:t.color??1,power:t.power??1,id:t.id??"A",buttons:t.buttons??[]};
  assert(int(v.dir,0,3)&&["h","v"].includes(v.axis)&&int(v.color,0,7)&&int(v.power,1,MAX_POWER)&&identifier(v.id),"Invalid tile settings.");
  assert(Array.isArray(v.buttons)&&v.buttons.length<=8&&v.buttons.every(identifier)&&new Set(v.buttons).size===v.buttons.length,"Invalid button IDs.");
  if(t.type==="coloredFruit"||t.type==="colorDoor"||t.type==="changer"||baseType(t.type)==="filter"||baseType(t.type)==="changer")assert(v.color>0,"Select an RGB color.");
  return v;
 }).sort((a,b)=>a.i-b.i);
 assert(tiles.filter(t=>t.type==="source").length===1,"Place exactly one Shiny.");
 assert(tiles.some(t=>["fruit","coloredFruit"].includes(t.type)),"Place at least one banana.");
 const coin=raw.coin??null;assert(coin===null||int(coin,0,n-1),"Invalid coin position.");
 for(const type of ["portal","rotatingPortal"]){
  for(const t of tiles.filter(t=>t.type===type))assert(tiles.filter(p=>p.type===type&&p.id===t.id).length===2,"Portal "+t.id+" needs exactly two ends of the same type.");
 }
 for(const t of tiles.filter(t=>["buttonDoor","invertedDoor","multiDoor"].includes(t.type))){
  const ids=t.type==="multiDoor"?t.buttons:[t.id];
  assert(ids.every(id=>tiles.some(p=>["button","continuous"].includes(p.type)&&p.id===id)),"Door references a missing switch.");
 }
 for(const t of tiles.filter(t=>t.type==="linked"))assert(tiles.filter(p=>p.type==="linked"&&p.id===t.id).length>=2,"Linked mirror group needs two mirrors.");
 assert(!raw.stars.some(i=>tiles.some(t=>t.i===i&&["source","barrier","blackHole","ice"].includes(t.type))),"Stars cannot be placed on a source, barrier, ice or black hole.");
 assert(coin===null||!tiles.some(t=>t.i===coin&&["source","barrier","blackHole","ice"].includes(t.type)),"Coin cannot be on a blocked tile.");
 const title=typeof raw.title==="string"?raw.title.trim().slice(0,80):"";
 return {title:title||"Banana puzzle",width,height,tiles,stars:[...raw.stars],coin};
}
export function neighbor(i,d,w,h){const x=i%w+DX[d],y=Math.floor(i/w)+DY[d];return x<0||x>=w||y<0||y>=h?-1:y*w+x;}
export function initialBoard(map){return {tiles:map.tiles.map(t=>({...t})),latched:[]};}
const axisOK=(axis,d)=>axis==="h"?d%2===1:d%2===0;
const reflect=(d,orientation)=>orientation%2===0?(d^1):(3-d);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Trace one pass using prior continuous switch and combiner signals; all beams
// are computed together. Bitsets deduplicate loops, including amplified cycles.
function trace(map,board,continuous,combined){
 const {width:w,height:h}=map,n=w*h,tiles=Array(n).fill(null);
 for(const t of board.tiles)tiles[t.i]=t;
 const source=board.tiles.find(t=>t.type==="source"),active=new Set([...board.latched,...continuous]),latch=new Set(board.latched),switches=new Set();
 const lit=new Map(),edges=new Map(),fruit=new Set(),stars=new Set(),pushes=new Map(),inputs=new Map(),queue=[],visited=new Uint8Array(n*4*8*10);
 let black=false,coin=false,steps=0;
 const send=(i,d,c,p)=>{if(p<=0)return;const next=neighbor(i,d,w,h);if(next<0)return;const key=((next*4+d)*8+c)*10+p;if(visited[key])return;visited[key]=1;queue.push([next,d,c,p,i]);};
 function illuminate(i,c,p){const old=lit.get(i)||[0,0];lit.set(i,[old[0]|c,Math.max(old[1],p)]);if(map.stars.includes(i))stars.add(i);if(map.coin===i)coin=true;}
 send(source.i,source.dir,0,source.power);
 for(const [i,c,p] of combined){const t=tiles[i];if(t?.type==="combiner")send(i,t.dir,c,p);}
 for(let q=0;q<queue.length;q++){
  const [i,d,c,p,from]=queue[q];if(++steps>5000)return {unstable:true};
  const t=tiles[i],type=t?baseType(t.type):"empty";
  edges.set(from+":"+i+":"+c,{from,to:i,color:c,power:p});
  if(type==="source"||type==="barrier")continue;
  if(type==="blackHole"){black=true;continue;}
  if(type==="ice"){const j=neighbor(i,d,w,h);if(axisOK(t.axis,d)&&j>=0&&!tiles[j]&&!pushes.has(i))pushes.set(i,j);continue;}
  if(type==="buttonDoor"&&!active.has(t.id)||type==="invertedDoor"&&active.has(t.id)||type==="lightDoor"&&p<t.power||type==="colorDoor"&&c!==t.color||type==="multiDoor"&&(p<t.power||t.color!==0&&c!==t.color||!t.buttons.every(id=>active.has(id))))continue;
  if(type==="oneWay"&&d!==t.dir)continue;
  illuminate(i,c,p);
  if(type==="fruit"||type==="coloredFruit"&&c===t.color)fruit.add(i);
  if(type==="button")latch.add(t.id);
  if(type==="continuous")switches.add(t.id);
  if(["mirror","oneWay","linked"].includes(type)){send(i,reflect(d,t.dir),c,p);continue;}
  if(type==="tee"||type==="cross"){send(i,mod(d+1),c,p);send(i,mod(d-1),c,p);if(type==="cross")send(i,d,c,p);continue;}
  if(type==="dampener"){send(i,d,c,p-t.power);continue;}
  if(type==="amplifier"){send(i,d,c,Math.min(MAX_POWER,p+t.power));continue;}
  if(type==="changer"){send(i,d,c|t.color,p);continue;}
  if(type==="filter"){send(i,d,c&(~t.color&7),p);continue;}
  if(type==="portal"||type==="rotatingPortal"){
   const partner=board.tiles.find(x=>x.type===t.type&&x.id===t.id&&x.i!==i);
   if(partner){illuminate(partner.i,c,p);send(partner.i,type==="rotatingPortal"?mod(d+partner.dir-t.dir):d,c,p);}
   continue;
  }
  if(type==="combiner"){
   let directions=inputs.get(i);if(!directions){directions=new Map();inputs.set(i,directions);}
   const old=directions.get(d)||[0,0];directions.set(d,[old[0]|c,Math.max(old[1],p)]);
   continue;
  }
  send(i,d,c,p);
 }
 return {black,coin,steps,fruit:[...fruit].sort((a,b)=>a-b),stars:[...stars].sort((a,b)=>a-b),lit,edges,latch,switches,pushes,inputs};
}

export function settleLight(map,input){
 let board={tiles:input.tiles.map(t=>({...t})),latched:[...input.latched]},continuous=[],combined=[],seen=new Set(),work=0;
 for(let pass=0;pass<32;pass++){
  const a=trace(map,board,continuous,combined);
  work+=a.steps||0;
  if(a.unstable||work>12000)return {board:input,unstable:true,won:false,stars:[],coin:false,edges:[],lit:[],fruit:[]};
  if(a.black)return {board:initialBoard(map),black:true,won:false,stars:[],coin:false,edges:[],lit:[],fruit:[]};
  const latched=[...a.latch].sort(),nextContinuous=[...a.switches].sort(),nextCombined=[];
  for(const [i,dirs] of a.inputs){if(dirs.size<2)continue;let c=0,p=0;for(const [cc,pp] of dirs.values()){c|=cc;p+=pp;}nextCombined.push([i,c,Math.min(MAX_POWER,p)]);}
  nextCombined.sort((a,b)=>a[0]-b[0]);
  let moved=false;const occupied=new Set(board.tiles.map(t=>t.i));
  for(const [i,j] of a.pushes){if(!occupied.has(j)){const t=board.tiles.find(x=>x.i===i);occupied.delete(i);occupied.add(j);t.i=j;moved=true;}}
  if(!moved&&same(latched,board.latched)&&same(nextContinuous,continuous)&&same(nextCombined,combined)){
   const total=board.tiles.filter(t=>["fruit","coloredFruit"].includes(t.type)).length;
   return {board,won:a.fruit.length===total,stars:a.stars,coin:a.coin,fruit:a.fruit,edges:[...a.edges.values()],lit:[...a.lit],continuous};
  }
  board.latched=latched;continuous=nextContinuous;combined=nextCombined;
  const key=JSON.stringify([board.tiles.map(t=>t.i),latched,continuous,combined]);if(seen.has(key))break;seen.add(key);
 }
 return {board:input,unstable:true,won:false,stars:[],coin:false,edges:[],lit:[],fruit:[]};
}
export function applyMove(map,board,action){
 const next={tiles:board.tiles.map(t=>({...t})),latched:[...board.latched]};
 if(action.kind==="check")return settleLight(map,next);
 assert(int(action.i,0,map.width*map.height-1),"Select a tile.");
 const t=next.tiles.find(t=>t.i===action.i);assert(t,"Select a tile.");
 if(action.kind==="rotate"){
  assert(ROTATABLE.has(t.type),"Only mirrors rotate.");
  const group=t.type==="linked"?next.tiles.filter(x=>x.type==="linked"&&x.id===t.id):[t];
  for(const x of group)x.dir=mod(x.dir+1);
 }else if(action.kind==="move"){
  assert(MOVABLE.has(t.type)&&int(action.dir,0,3)&&axisOK(t.axis,action.dir),"Move along this tile's marked axis only.");
  const j=neighbor(t.i,action.dir,map.width,map.height);
  assert(j>=0&&!next.tiles.some(x=>x.i===j),"Destination is occupied.");
  t.i=j;
 }else throw Error("Unknown puzzle action.");
 return settleLight(map,next);
}
// Solvable deterministic serpentine routes. A known solution is created first,
// then only mirror orientations are scrambled. Procedural levels are fallbacks,
// so staff-authored maps can override any number.
function rng(seed){let x=seed>>>0;return ()=>{x=(x+0x6d2b79f5)>>>0;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function proceduralDesign(level,milestones=defaultMilestones(),solution=false,allowBranch=true){
 assert(int(level,1,MAX_LEVEL),"Invalid level.");
 const random=rng(Math.imul(level,0x9e3779b1)),diff=difficulty(level);
 const size=Math.min(15,Math.max(3,3+Math.floor(Math.log2(level))+(diff==="hard"?2:diff==="super-hard"?4:0)));
 const w=size,h=size,n=w*h,rows=Math.min(h,level===1?2:diff==="super-hard"?h:diff==="hard"?Math.max(3,h-1):Math.max(2,Math.ceil(h/2)+Math.floor(random()*2)));
 const flip=random()<.5,vertical=random()<.5,offset=rows<h?Math.floor(random()*(h-rows+1)):0;
 const transform=(x,y)=>{if(flip)x=w-1-x;y+=offset;return vertical?x*w+y:y*w+x;};
 const route=[];
 for(let y=0;y<rows;y++){for(let j=0;j<w;j++){const x=y%2===0?j:w-1-j;route.push(transform(x,y));}}
 const direction=(a,b)=>[0,1,2,3].find(d=>neighbor(a,d,w,h)===b);
 const tiles=[{i:route[0],type:"source",dir:direction(route[0],route[1]),power:3}],turns=[],straights=[];
 for(let k=1;k<route.length-1;k++){
  const i=route[k],d=direction(route[k-1],i),out=direction(i,route[k+1]);
  if(d!==out){const dir=reflect(d,0)===out?0:1;turns.push({i,type:"mirror",dir:solution?dir:dir^1,solutionDir:dir,incoming:d,outgoing:out});}
  else straights.push(i);
 }
 tiles.push(...turns,{i:route.at(-1),type:"fruit"});
 const free=[...straights],allowed=t=>milestones[t]<=level;
 // Linked mirrors are scrambled together so a common rotation can solve them.
 if(allowed("linked")&&level%6===0&&turns.length>=2)for(const t of turns.slice(0,2)){t.type="linked";t.id="L";}
 for(const t of turns){if(t.type!=="mirror")continue;if(allowed("movingMirror")&&random()<.22){t.type="movingMirror";t.axis=random()<.5?"h":"v";}else if(allowed("oneWay")&&level%3===0&&t.incoming%2===t.solutionDir){t.type="oneWay";t.dir=solution?t.incoming:mod(t.incoming+1);}}
 // Insert compatible feature chains in route order, preserving the known solution.
 const take=(type,props={})=>{if(!free.length||!allowed(type))return false;tiles.push({i:free.shift(),type,...props});return true;};
 if(level%4===0&&allowed("button")&&allowed("buttonDoor")&&free.length>=3){take("button",{id:"A"});take("buttonDoor",{id:"A"});}
 if(level%3===0&&allowed("dampener")&&allowed("amplifier")&&free.length>=3){take("dampener",{power:1});take("amplifier",{power:2});if(allowed("lightDoor"))take("lightDoor",{power:3});}
 if(level%3===1&&allowed("changer")&&allowed("colorDoor")&&free.length>=4){take("changer",{color:1});take("changer",{color:2});take("colorDoor",{color:3});if(allowed("coloredFruit")&&free.length)take("coloredFruit",{color:3});}
 if(level%5===0&&allowed("continuous")&&allowed("multiDoor")&&free.length>=3){take("continuous",{id:"B"});take("multiDoor",{color:0,power:1,buttons:["B"]});}
 if(level%7===0&&allowed("filter")&&allowed("changer")&&free.length>=3){take("changer",{color:4});take("filter",{color:4});}
 // Adjacent portal ends on a straight section leave the intended route intact.
 if(allowed("portal")&&level%5===1){
  for(let k=0;k<free.length-1;k++){const a=free[k],b=free[k+1],ia=route.indexOf(a),ib=route.indexOf(b);
   if(ib===ia+1&&direction(route[ia-1],a)===direction(a,b)&&direction(a,b)===direction(b,route[ib+1])){
    const type=allowed("rotatingPortal")&&level%2===0?"rotatingPortal":"portal";
    tiles.push({i:a,type,id:"P",dir:0},{i:b,type,id:"P",dir:0});free.splice(k,2);break;
   }
  }
 }
 const routeSet=new Set(route),extraBeam=new Set(),branchTargets=[];
 // A crossbeam on a straight segment keeps the main path and adds a side
 // branch outside the route; this can carry an extra banana or star.
 if(allowBranch&&allowed("cross")&&level%3===2){
  for(let k=0;k<free.length;k++){const i=free[k],at=route.indexOf(i),d=direction(route[at-1],i);
   const side=[mod(d+1),mod(d-1)].find(s=>{const j=neighbor(i,s,w,h);return j>=0&&!routeSet.has(j);});
   if(side===undefined)continue;
   let j=neighbor(i,side,w,h);while(j>=0&&!routeSet.has(j)){extraBeam.add(j);j=neighbor(j,side,w,h);}
   // Both outgoing directions may cross the route; the original solution is
   // still valid only if it remains stable (verified by generator tests).
   if(extraBeam.size){const target=[...extraBeam].at(-1);branchTargets.push(target);tiles.push({i,type:allowed("movingCross")&&level%2?"movingCross":"cross",axis:"h"},{i:target,type:"fruit"});free.splice(k,1);break;}
  }
 }
 if(free.length>2&&level>2)tiles.push({i:free[Math.floor(free.length/2)],type:"fruit"});
 if(allowed("barrier"))for(let i=0;i<n;i++)if(!routeSet.has(i)&&!extraBeam.has(i)&&random()<(diff==="super-hard"?.45:diff==="hard"?.3:.12))tiles.push({i,type:"barrier"});
 const positions=route.slice(1),stars=[positions[Math.floor((positions.length-1)*.2)],positions[Math.floor((positions.length-1)*.55)],branchTargets[0]??positions.at(-1)];
 const coin=level%5===0?positions[Math.floor((positions.length-1)*.8)]:null;
 const design=validateDesign({title:"Banana beams "+level,width:w,height:h,tiles,stars,coin},level,milestones);
 if(allowBranch&&branchTargets.length){const solved={...design,tiles:design.tiles.map(t=>{const turn=turns.find(x=>x.i===t.i);return turn?{...t,dir:t.type==="oneWay"?turn.incoming:turn.solutionDir}:t;})};const result=settleLight(solved,initialBoard(solved));if(!result.won||result.stars.length!==3)return proceduralDesign(level,milestones,solution,false);}
 return design;
}
export const shinyChance=level=>level>10?.05:0;
export const fruiterChance=level=>Math.min(1,(1+.25*(level-1))/10000);
