
export const WIDTH=960,HEIGHT=540,GROUND=502,SLING={x:115,y:390},PRICE=100,WIN_COINS=10;
export const SPECIALS=["aqualily","bulky","sploder","sniper"],TYPES=["marina",...SPECIALS];
export const AXOLOTLS={
 marina:{name:"Marina",color:"#ffa9c3",gill:"#e85f91",description:"Your regular slingshot friend."},
 aqualily:{name:"Aqualily",color:"#9ce8ef",gill:"#7ca9e2",description:"Splits into three flying axolotls."},
 bulky:{name:"Bulky",color:"#b0cf93",gill:"#698f65",description:"Heavy enough to break thick branches."},
 sploder:{name:"Sploder",color:"#ffc77c",gill:"#f1855a",description:"A harmless burst knocks nearby oranges loose."},
 sniper:{name:"Sniper",color:"#c5b2f6",gill:"#8874ce",description:"Choose any remaining orange for a guaranteed hit."}
};
export const ORANGE_TROPHY=["orange-knock-down-mastery","Orange Knock Down Mastery","Complete level 1,000 in Orange Knock Down."];
export const hasOrangeMastery=s=>s.cleared>=1000;
export const ORANGE_AXOLOTLS=[["tangie","Tangie","#ffb75d","#ee7943","orange"]];
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
function layoutRandom(seed){let x=seed>>>0;return ()=>{x=(x+0x6d2b79f5)>>>0;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export const fruiterChance=level=>Math.min(1,(1+.25*(level-1))/10000);
export const tangieChance=level=>level>10?.01:0;
function legacyLayout(level,seed){
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
export const MATERIALS=Object.freeze({
 wood:{hp:1,width:12,color:"#976039",edge:"#633c27",label:"Wood"},
 glass:{hp:1,width:10,color:"#a2e4ed",edge:"#438b9e",label:"Glass"},
 stone:{hp:2,width:17,color:"#a7a5a1",edge:"#666c75",label:"Stone"},
 steel:{hp:3,width:18,color:"#718da4",edge:"#3c5266",label:"Steel"},
 wall:{hp:2,width:26,color:"#c17b59",edge:"#79412d",label:"Brick wall"},
 reflector:{hp:1,width:15,color:"#b59bf0",edge:"#6448a0",label:"Reflector"},
 spring:{hp:1,width:19,color:"#7ee3a0",edge:"#246b50",label:"Spring bumper"},
 trampoline:{hp:1,width:12,color:"#ffcc58",edge:"#946135",label:"Trampoline"},
 reinforced:{hp:4,width:21,color:"#536577",edge:"#233748",label:"Reinforced alloy"},
 crate:{hp:1,width:28,color:"#f5a23c",edge:"#923e24",label:"Burst crate"}
});
function towerLayout(level,seed,version=2){
 if(version===1)return legacyLayout(level,seed);
 const rng=layoutRandom((seed^Math.imul(level,0x9e3779b1))>>>0),branches=[],oranges=[];
 const pick=n=>Math.floor(rng()*n);
 function add(x1,y1,x2,y2,material="wood",supports=[]){
  const m=MATERIALS[material],id=branches.length;
  branches.push({id,x1,y1,x2,y2,hp:m.hp,material,width:m.width,supports,reflect:material==="reflector"});return id;
 }
 function fruit(shelf,x,y){oranges.push({id:oranges.length,branch:shelf,x,y});}
 const mat=(floor,side)=>level>=16&&(floor+side)%3===0?"steel":level>=8&&(floor+side)%2===0?"stone":level>=3&&(floor+side)%2===1?"glass":"wood";
 // Two compact, connected towers with genuine load-bearing beams.
 // The orange shelves fall when either supporting column gives way.
 const tower=(x,w,floors,baseY,side)=>{
  let lower=null;
  if(baseY<base-10){lower=add(x-12,baseY,x+w+12,baseY,"wood");add(x,base,x,baseY,"wood");add(x+w,base,x+w,baseY,"wood");const b=branches[lower];b.supports=[lower+1,lower+2];}
  for(let i=0;i<floors;i++){
   const bottom=baseY-i*70,top=bottom-70;
   const left=add(x,bottom,x,top,mat(i,side),lower===null?[]:[lower]);
   const right=add(x+w,bottom,x+w,top,mat(i,side+1),lower===null?[]:[lower]);
   const shelf=add(x-10,top,x+w+10,top,mat(i,side),[left,right]);
   fruit(shelf,x+w*.30,top-21);fruit(shelf,x+w*.70,top-21);
   lower=shelf;
   // Upper floors sit directly above the previous shelf, with a short
   // visible space occupied by oranges. Columns remain outside the fruit.
  }
  return lower;
 };
 const offset=pick(25)-12,base=GROUND-5;
 const floors=level<4?1:level<13?2:3;
 if(level===1){
  tower(475+offset,142,1,base,0);tower(745-offset,120,1,base-105,1);
 }else{
  tower(510+offset,134,floors,base,0);
  tower(740-offset,120,level<7?1:level<19?2:3,base-35-pick(16),1);
 }
 // Low brick barricade teaches a high arc. From level 10 onward it grows.
 if(level>=5){const height=level<10?104:level<20?142:174;add(355+pick(15),base,355+pick(15),base-height,"wall");}
 // Backstop reflectors bank shots back through the orchard. Angled panels
 // arrive later and redirect a descending shot rather than absorb damage.
 if(level>=12)add(922,base-35,922,base-265,"reflector");
 if(level>=20)add(430+pick(20),base-160,490+pick(20),base-225,"reflector");
 const durability=branches.reduce((n,b)=>n+(b.reflect?0:b.hp),0);
 // Enough for repeated structural hits, plus a limited miss allowance.
 return {branches,oranges,shots:Math.max(5,Math.ceil(durability*.45)+2)};
}
export const FEATURES=Object.freeze([
 {id:"wood",level:1,name:"Timber frames",description:"Break a support and watch connected shelves collapse."},
 {id:"glass",level:3,name:"Glass beams",description:"Fragile blue beams shatter with one hit."},
 {id:"wall",level:5,name:"Brick barricades",description:"Break them with two ordinary hits or arc over the top."},
 {id:"stone",level:8,name:"Stone structures",description:"Stone needs two hits. Aim for its weaker connections."},
 {id:"reflector",level:12,name:"Ricochet panels",description:"Unbreakable purple panels reflect your shot."},
 {id:"steel",level:16,name:"Steel beams",description:"Three hits to break. Bulky can smash one in a single shot."},
 {id:"angled",level:20,name:"Angled reflectors",description:"Slanted panels send shots in surprising directions."},
 {id:"spring",level:24,name:"Spring bumpers",description:"Green bumpers bounce shots back with extra speed."},
 {id:"trampoline",level:27,name:"Trampolines",description:"Golden pads can face any angle. Bank shots off their surfaces and chain bounces around obstacles."},
 {id:"reinforced",level:30,name:"Reinforced alloy",description:"Four hits to break. Find a weak point instead."},
 {id:"crate",level:36,name:"Chain-reaction crates",description:"Hit an orange burst crate to damage nearby pieces and shake fruit loose."}
]);
export function featureProgress(cleared=0,milestones){
 const configured=featureSchedule(milestones);
 const reached=Math.max(0,Math.floor(Number(cleared)||0));
 const features=configured.map((f,i)=>{
  const start=i?configured[i-1].level-1:0,end=f.level-1;
  const unlocked=reached>=end,percent=unlocked?100:Math.floor(100*clamp((reached-start)/Math.max(1,end-start),0,1));
  return {...f,unlocked,percent,remaining:Math.max(0,end-reached)};
 });
 return {features,next:features.find(f=>!f.unlocked)||null,latest:features.filter(f=>f.unlocked).at(-1)||null};
}
export const DESIGN_NAMES=["Orchard bridge","Twin towers","Pyramid steps","Triangular A-frame","Staggered terraces","Diamond pavilion","Cantilever garden","Fortified shelter","Crown gate","Crisscross lattice"];
export function layout(level,seed,version=5){
 if(version<3)return towerLayout(level,seed,version);
 const rng=layoutRandom((seed^Math.imul(level,0x9e3779b1))>>>0),branches=[],oranges=[];
 const pick=n=>Math.floor(rng()*n),base=GROUND-6;
 const available=Math.min(DESIGN_NAMES.length,level<4?4:level<8?6:level<12?8:10);
 // Every run cycles through a changing family, not just randomized coordinates.
 const design=(level-1+(Math.floor((level-1)/10)*(1+(seed>>>0)%3)))%available;
 const offset=pick(31)-15;
 function add(x1,y1,x2,y2,material="wood",supports=[]){
  const m=MATERIALS[material],id=branches.length;
  branches.push({id,x1,y1,x2,y2,hp:m.hp,material,width:m.width,supports,reflect:material==="reflector"||material==="spring"||material==="trampoline",spring:material==="spring",burst:material==="crate",...(material==="trampoline"?{trampoline:true}:{})});return id;
 }
 function fruit(shelf,x,y){oranges.push({id:oranges.length,branch:shelf,x,y});}
 function material(i){if(level>=30&&i%7===0)return "reinforced";if(level>=16&&i%4===0)return "steel";if(level>=8&&i%3===0)return "stone";if(level>=3&&i%2===1)return "glass";return "wood";}
 function shelf(x,y,w,supports,i=0,n=2){const id=add(x-5,y,x+w+5,y,material(i),supports);for(let j=0;j<n;j++)fruit(id,x+w*(j+1)/(n+1),y-22);return id;}
 function box(x,y,w,h,i=0,below=[],n=2){
  const a=add(x,y+h,x,y,material(i+1),below),b=add(x+w,y+h,x+w,y,material(i+2),below);
  return shelf(x,y,w,[a,b],i,n);
 }
 function triangle(x,y,w,h,i=0,below=[]){
  const a=add(x,y,x+w/2,y-h,material(i+1),below),b=add(x+w,y,x+w/2,y-h,material(i+2),below);
  const deck=shelf(x+w*.25,y-h*.5,w*.5,[a,b],i,1);
  fruit(deck,x+w*.5,y-h-21);return deck;
 }
 function diamond(x,y,w,h,i=0,below=[]){
  const left=add(x,y-h/2,x+w/2,y,material(i+1),below),right=add(x+w,y-h/2,x+w/2,y,material(i+2),below);
  const roofL=add(x,y-h/2,x+w/2,y-h,material(i+3),[left]),roofR=add(x+w,y-h/2,x+w/2,y-h,material(i+4),[right]);
  const deck=shelf(x+12,y-h/2,w-24,[left,right],i,1);fruit(deck,x+w/2,y-h-22);
  // The outer roof is a separate protective layer, not the fruit's support.
  return {deck,roofL,roofR};
 }
 const x=520+offset,far=760-offset;
 switch(design){
  case 0:{
   const l=box(x,base-95,75,95,0,[],1),r=box(far,base-95,70,95,1,[],1);
   const bridge=shelf(x+75,base-153,far-x-75,[l,r],2,2);
   add(x+75,base-95,x+75,base-153,material(3),[l]);add(far,base-95,far,base-153,material(4),[r]);
   // Bridge deck depends on the upper columns as well as its piers.
   branches[bridge].supports.push(bridge+1,bridge+2);
   if(level>=13)triangle(x+95,base-153,125,83,4,[bridge]);break;
  }
  case 1:{
   const floors=level<7?1:level<20?2:3;
   for(const [pos,w,n] of [[x,115,floors],[far,96,Math.max(1,floors-1)]]){let lower=[];for(let j=0;j<n;j++)lower=[box(pos,base-(j+1)*76,w,76,j+pos%3,lower)];}break;
  }
  case 2:{
   const l=box(x-20,base-65,145,65,1),r=box(x+145,base-65,145,65,2);
   const top=box(x+65,base-135,140,70,3,[l,r],2);
   if(level>=13)triangle(x+85,base-135,100,78,5,[top]);break;
  }
  case 3:{
   triangle(x-25,base,200,160,0);triangle(far-30,base,125,115,2);
   if(level>=12){const beam=box(x+30,base-52,100,52,4,[],1);fruit(beam,x+80,base-95);}break;
  }
  case 4:{
   const a=box(x-40,base-58,100,58,0,[],2),b=box(x+95,base-132,105,132,2,[],2);
   box(far-10,base-200,100,200,3,[],2);
   if(level>=16)shelf(x+12,base-120,64,[a,b],5,1);break;
  }
  case 5:{
   const a=box(x,base-48,110,48,0,[],1);diamond(x-20,base-48,150,142,2,[a]);diamond(far-40,base,150,168,4);break;
  }
  case 6:{
   const a=box(x,base-120,78,120,0,[],1),b=shelf(x-60,base-120,190,[a],3,3);
   const c=box(far-15,base-75,105,75,2,[],1);
   shelf(far-65,base-75,175,[c],5,3);
   if(level>=16)triangle(x-40,base-120,115,100,6,[b]);break;
  }
  case 7:{
   const a=box(x-25,base-100,145,100,1,[],2),b=box(far-25,base-85,125,85,3,[],2);
   add(x-45,base-10,x-45,base-120,level>=8?"stone":"wall");
   add(x-45,base-120,x+135,base-120,material(4),[a]);
   add(far-35,base-105,far+105,base-105,material(5),[b]);break;
  }
  case 8:{
   const l=box(x-15,base-120,90,120,0,[],2),r=box(far-30,base-120,90,120,3,[],2);
   const top=shelf(x-15,base-208,far-x+75,[l,r],5,3);
   add(x-15,base-120,x-15,base-208,material(6),[l]);add(far+60,base-120,far+60,base-208,material(7),[r]);branches[top].supports.push(top+1,top+2);break;
  }
  default:{
   const l=box(x-25,base-85,130,85,0),r=box(far-25,base-85,110,85,3);
   add(x-25,base,x+105,base-85,material(4));add(x+105,base,x-25,base-85,material(5));
   triangle(x-25,base-85,130,105,6,[l]);triangle(far-25,base-85,110,90,7,[r]);break;
  }
 }
 // Guaranteed introduction of each material at its milestone, even if the
 // selected family happens not to use that material's index naturally.
 for(const feature of FEATURES.filter(f=>f.level<=level&&["glass","stone","steel","reinforced"].includes(f.id))){
  if(!branches.some(b=>b.material===feature.id)){
   const b=branches.find(b=>b.material==="wood");if(b){Object.assign(b,{material:feature.id,hp:MATERIALS[feature.id].hp,width:MATERIALS[feature.id].width});}
  }
 }
 if(level>=5){const xw=350+pick(28),height=level<10?90:level<20?120:150;add(xw,base,xw,base-height,"wall");}
 if(level>=12)add(923,base-35,923,base-255,"reflector");
 if(level>=20){const px=410+pick(35);add(px,base-150,px+58,base-204,"reflector");}
 if(level>=24)add(880,base-12,920,base-50,"spring");
 if(version===4&&level>=27){const start=244+pick(14);add(start,465,start+84,465,"trampoline");}
 if(version>=5&&level>=27){
  function pad(cx,cy,length,angle){
   const rad=angle*Math.PI/180,dx=Math.cos(rad)*length/2,dy=Math.sin(rad)*length/2;
   const id=add(cx-dx,cy-dy,cx+dx,cy+dy,"trampoline");
   branches[id].directional=true;
  }
  // Learn a low bank first; later boards add angled relay and back-bank pads.
  const angles=[-20,-10,0,15,30,-35,45,-45];
  pad(285+pick(15),445,92,level===27?-12:angles[pick(angles.length)]);
  if(level>=30)pad(435+pick(18),218+pick(35),94,[-55,-30,25,50,90][pick(5)]);
  if(level>=40)pad(865+pick(12),95+pick(35),82,[-75,-35,35,75,90][pick(5)]);
 }
 if(level>=36){add(x-30,base-10,x-30,base-38,"crate");add(far-45,base-10,far-45,base-38,"crate");}
 const durability=branches.reduce((n,b)=>n+(b.reflect?0:b.hp),0);
 return {branches,oranges,design:DESIGN_NAMES[design],shots:Math.max(5,Math.ceil(durability*.42)+3)};
}
export function levelIntro(level,version=5){
 if(version===1)return "Classic orchard";
 if(level<3)return "Wooden towers · Break supports to topple shelves";
 if(level<5)return "Glass beams · Fragile structures";
 if(level<8)return "Brick walls · Two hits or shoot over";
 if(level<12)return "Stone supports · Two hits";
 if(level<16)return "Reflective backstops · Bank your shots";
 if(level<20)return "Steel supports · Three hits";
 if(level<24)return "Mixed fortresses · Angled reflectors and taller walls";
 if(level<27||version<4&&level<30)return "Spring bumpers · Boosted ricochets";
 if(level<30)return version>=5?"Trampolines · Bank shots at different angles":"Trampolines · Bounce over obstacles";
 if(level<36)return "Reinforced alloy · Four hits";
 return "Chain-reaction crates · Look for the weak point";
}

export const EDIT_GRID=20,MAX_PIECES=48,MAX_ORANGES=32;
export function featureSchedule(values){
 return FEATURES.map(f=>({...f,level:Number.isInteger(values?.[f.id])&&values[f.id]>=1&&values[f.id]<=1000000?values[f.id]:f.level})).sort((a,b)=>a.level-b.level||FEATURES.findIndex(f=>f.id===a.id)-FEATURES.findIndex(f=>f.id===b.id));
}
export function validateMilestones(values){
 if(!values||Object.keys(values).length!==FEATURES.length||FEATURES.some(f=>!Number.isInteger(values[f.id])||values[f.id]<1||values[f.id]>1000000)||values.wood!==1||values.angled<values.reflector)throw Error("Choose valid unlock levels. Wood starts at 1; angled reflectors require ordinary reflectors.");
 return Object.fromEntries(FEATURES.map(f=>[f.id,values[f.id]]));
}
const exactInt=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
export function validateDesign(raw){
 if(!raw||typeof raw.title!=="string"||!raw.title.trim()||raw.title.trim().length>80||!exactInt(raw.shots,1,50)||!exactInt(raw.two,0,raw.shots-1)||!exactInt(raw.three,raw.two,raw.shots-1))throw Error("Enter a title, 1–50 Marina throws, and valid star thresholds.");
 if(!Array.isArray(raw.pieces)||raw.pieces.length>MAX_PIECES||!Array.isArray(raw.oranges)||raw.oranges.length<1||raw.oranges.length>MAX_ORANGES)throw Error("Use up to 48 pieces and 1–32 oranges.");
 const pieces=raw.pieces.map((p,i)=>{
  if(!p||!Object.hasOwn(MATERIALS,p.material)||!exactInt(p.x,180,940)||!exactInt(p.y,20,480)||p.x%EDIT_GRID||p.y%EDIT_GRID||!exactInt(p.angle,0,359)||!exactInt(p.length,20,240)||p.length%EDIT_GRID)throw Error("Invalid piece "+(i+1)+".");
  const a=p.angle*Math.PI/180,dx=Math.cos(a)*p.length/2,dy=Math.sin(a)*p.length/2,r=MATERIALS[p.material].width/2;
  if(p.x-Math.abs(dx)-r<160||p.x+Math.abs(dx)+r>WIDTH||p.y-Math.abs(dy)-r<0||p.y+Math.abs(dy)+r>GROUND)throw Error("Piece "+(i+1)+" extends outside the build area.");
  if(!Array.isArray(p.supports)||p.supports.length>4||new Set(p.supports).size!==p.supports.length||p.supports.some(x=>!exactInt(x,0,raw.pieces.length-1)||x===i))throw Error("Invalid supports on piece "+(i+1));
  return {material:p.material,x:p.x,y:p.y,angle:p.angle,length:p.length,supports:[...p.supports]};
 });
 const visiting=new Set(),done=new Set();
 function visit(i){if(visiting.has(i))throw Error("Circular supports are not allowed.");if(done.has(i))return;visiting.add(i);for(const x of pieces[i].supports)visit(x);visiting.delete(i);done.add(i);}
 pieces.forEach((_,i)=>visit(i));
 const oranges=raw.oranges.map((o,i)=>{if(!o||!exactInt(o.x,180,940)||!exactInt(o.y,20,480)||o.x%EDIT_GRID||o.y%EDIT_GRID||!exactInt(o.branch,-1,pieces.length-1))throw Error("Invalid orange "+(i+1));return {x:o.x,y:o.y,branch:o.branch};});
 return {title:raw.title.trim(),shots:raw.shots,two:raw.two,three:raw.three,pieces,oranges};
}
export function designFeature(piece){
 if(piece.material==="reflector"&&piece.angle%90!==0)return "angled";
 return piece.material;
}
export function checkDesignUnlocks(design,level,milestones){
 const schedule=Object.fromEntries(featureSchedule(milestones).map(f=>[f.id,f.level]));
 for(const p of design.pieces)if(schedule[designFeature(p)]>level)throw Error(MATERIALS[p.material].label+" is not unlocked at level "+level+".");
 return design;
}
export function designMap(raw){
 const d=validateDesign(raw);
 return {design:d.title,shots:d.shots,two:d.two,three:d.three,branches:d.pieces.map((p,id)=>{const a=p.angle*Math.PI/180,dx=Math.cos(a)*p.length/2,dy=Math.sin(a)*p.length/2,m=MATERIALS[p.material];return {id,material:p.material,x1:p.x-dx,y1:p.y-dy,x2:p.x+dx,y2:p.y+dy,hp:m.hp,width:m.width,supports:p.supports,reflect:["reflector","spring","trampoline"].includes(p.material),spring:p.material==="spring",trampoline:p.material==="trampoline",directional:p.material==="trampoline",burst:p.material==="crate"};}),oranges:d.oranges.map((o,id)=>({...o,id}))};
}
export function campaignMap(level,seed,milestones){
 const map=layout(level,seed),schedule=Object.fromEntries(featureSchedule(milestones).map(f=>[f.id,f.level]));
 // Preserve structure references by replacing locked pieces rather than deleting them.
 for(const b of map.branches){
  const angled=b.material==="reflector"&&b.x1!==b.x2&&b.y1!==b.y2;
  if(schedule[angled?"angled":b.material]>level){Object.assign(b,{material:"wood",hp:1,width:MATERIALS.wood.width,reflect:false,spring:false,trampoline:false,directional:false,burst:false});}
 }
 map.shots=Math.max(5,Math.ceil(map.branches.reduce((n,b)=>n+(b.reflect?0:b.hp),0)*.42)+3);
 return map;
}
export function stateMap(s){return s.levelMap||layout(s.level,s.seed,s.layoutVersion||1);}
export function boardFromMap(map){return {hp:map.branches.map(b=>b.hp),remaining:map.oranges.map(o=>o.id),marina:map.shots,won:false};}
export function starRating(map,board){if(!board.won)return 0;const two=map.two??Math.ceil(map.shots*.25),three=map.three??Math.ceil(map.shots*.5);return board.marina>=three?3:board.marina>=two?2:1;}
export function freshLevel(level,seed,version=5){return boardFromMap(layout(level,seed,version));}

export function initialOrange(seed){return {version:5,layoutVersion:5,revision:0,seed:seed>>>0,level:1,cleared:0,inventory:Object.fromEntries(SPECIALS.map(t=>[t,3])),board:freshLevel(1,seed)};}
export function validShot(shot){
 if(!shot||!TYPES.includes(shot.type))return false;
 if(shot.type==="sniper")return Number.isInteger(shot.target)&&shot.target>=0&&shot.target<32;
 return Number.isInteger(shot.angle)&&shot.angle>=-20&&shot.angle<=80&&Number.isInteger(shot.power)&&shot.power>=1&&shot.power<=100;
}
export function velocity(angle,power){const rad=angle*Math.PI/180,speed=5+power*.19;return {vx:Math.cos(rad)*speed,vy:-Math.sin(rad)*speed};}
function nearest(x,y,b){const dx=b.x2-b.x1,dy=b.y2-b.y1,u=clamp(((x-b.x1)*dx+(y-b.y1)*dy)/(dx*dx+dy*dy),0,1);return {x:b.x1+u*dx,y:b.y1+u*dy};}
function distanceSegment(x,y,b){const q=nearest(x,y,b);return Math.hypot(x-q.x,y-q.y);}
function reflectParticle(p,b,loss){
 const q=nearest(p.x,p.y,b);let nx=p.x-q.x,ny=p.y-q.y,len=Math.hypot(nx,ny);
 if(len<.001){nx=-(b.y2-b.y1);ny=b.x2-b.x1;len=Math.hypot(nx,ny);if(p.vx*nx+p.vy*ny>0){nx=-nx;ny=-ny;}}
 nx/=len;ny/=len;
 const dot=p.vx*nx+p.vy*ny;
 if(dot<0){p.vx=(p.vx-2*dot*nx)*loss;p.vy=(p.vy-2*dot*ny)*loss;}
 const r=p.r+(b.width||12)/2+.2;p.x=q.x+nx*r;p.y=q.y+ny*r;
}
// Mirror reflection about the pad surface, followed by a bounded energy boost.
// Independent of angle and endpoint order; two-sided, with no forced upward velocity.
export function bouncePad(p,b){
 const dx=b.x2-b.x1,dy=b.y2-b.y1,length=Math.hypot(dx,dy);
 if(!length)return false;
 let nx=-dy/length,ny=dx/length;
 const side=(p.x-b.x1)*nx+(p.y-b.y1)*ny;
 if(side<0||(Math.abs(side)<1e-8&&p.vx*nx+p.vy*ny>0)){nx=-nx;ny=-ny;}
 const dot=p.vx*nx+p.vy*ny;
 const q=nearest(p.x,p.y,b),radius=p.r+(b.width||12)/2+.3;
 p.x=q.x+nx*radius;p.y=q.y+ny*radius;
 if(dot>=-1e-7)return false;
 let vx=p.vx-2*dot*nx,vy=p.vy-2*dot*ny;
 const speed=Math.hypot(vx,vy),boost=clamp(speed*1.35,20,32)/speed;
 p.vx=vx*boost;p.vy=vy*boost;
 return true;
}
export function simulateShot(map,board,shot,trace=false){
 if(!validShot(shot))throw Error("Invalid shot.");
 const hp=[...board.hp],remaining=new Set(board.remaining),events=[],frames=[];
 const drop=(id,t)=>{if(remaining.delete(id))events.push({kind:"orange",id,t});};
 const damageBranch=(id,amount,t)=>{
  if(!hp[id]||map.branches[id].reflect)return;
  hp[id]=Math.max(0,hp[id]-amount);events.push({kind:"damage",id,hp:hp[id],t});
  if(!hp[id]){
   events.push({kind:"branch",id,t});for(const o of map.oranges)if(o.branch===id)drop(o.id,t);
   for(const b of map.branches)if(hp[b.id]&&b.supports?.includes(id))damageBranch(b.id,hp[b.id],t);
   const piece=map.branches[id];if(piece.burst)blast((piece.x1+piece.x2)/2,(piece.y1+piece.y2)/2,t);
  }
 };
 const blast=(x,y,t)=>{events.push({kind:"blast",x,y,t});for(const b of map.branches)if(hp[b.id]&&!b.reflect&&distanceSegment(x,y,b)<115)damageBranch(b.id,2,t);for(const o of map.oranges)if(remaining.has(o.id)&&Math.hypot(x-o.x,y-o.y)<130)drop(o.id,t);};
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
     // Resolve solid material before touching fruit behind it.
     for(const b of map.branches){
      if(!hp[b.id]||distanceSegment(p.x,p.y,b)>p.r+(b.width||12)/2)continue;
      if(b.trampoline&&b.directional){
       if(bouncePad(p,b))events.push({kind:"bounce",x:p.x,y:p.y,t,trampoline:true,padId:b.id});
       continue;
      }
      if(b.trampoline){
       // A descending shot contacts the upper membrane, not the legs.
       // Preserve forward motion but supply a distinct vertical launch.
       if(p.vy>0&&p.y<=b.y1&&p.x>=Math.min(b.x1,b.x2)-p.r&&p.x<=Math.max(b.x1,b.x2)+p.r){
        p.y=b.y1-p.r-b.width/2-.3;p.vy=-Math.min(25,Math.max(21,p.vy*1.7));p.vx=Math.sign(p.vx||1)*Math.min(18,Math.max(8,Math.abs(p.vx)*.82));
        events.push({kind:"bounce",x:p.x,y:p.y,t,trampoline:true});
       }
       continue;
      }
      if(b.reflect){reflectParticle(p,b,b.spring?1.25:.88);const speed=Math.hypot(p.vx,p.vy);if(speed>32){p.vx*=32/speed;p.vy*=32/speed;}events.push({kind:"bounce",x:p.x,y:p.y,t,spring:!!b.spring});continue;}
      if(!p.hit.has(b.id)){
       p.hit.add(b.id);
       if(p.type==="sploder"){blast(p.x,p.y,t);p.active=false;break;}
       damageBranch(b.id,p.type==="bulky"?3:1,t);
      }
      if(hp[b.id])reflectParticle(p,b,.40);else{p.vx*=.76;p.vy*=.76;}
     }
     if(!p.active)break;
     for(const o of map.oranges){if(!remaining.has(o.id)||Math.hypot(p.x-o.x,p.y-o.y)>p.r+15)continue;drop(o.id,t);if(p.type==="sploder"){blast(p.x,p.y,t);p.active=false;break;}p.vx*=.88;p.vy*=.88;}
    }
   }
  }
 }
 return {hp,remaining:[...remaining],events,frames};
}
export const orangeGameOver=board=>!!board&&!board.won&&board.marina<=0;
export function applyOrange(state,action,rng=Math.random){
 const s={...state,inventory:{...state.inventory},board:{...state.board,hp:[...state.board.hp],remaining:[...state.board.remaining]}};
 const done=(applied,message,coins=0,rewards=[])=>({state:s,applied,message,coins,rewards});
 if(action.kind==="buy"){if(!SPECIALS.includes(action.type))return done(false,"Choose a power-up.");if(s.inventory[action.type]>=9999)return done(false,"Power-up storage is full.");s.inventory[action.type]++;return done(true,AXOLOTLS[action.type].name+" added.",-PRICE);}
 if(action.kind==="retry"){if(s.board.won)return done(false,"This level is already complete.");s.board=boardFromMap(stateMap(s));return done(true,"Level reset. Used power-ups are not refunded.");}
 if(action.kind==="next"){if(!s.board.won)return done(false,"Clear all the oranges first.");if(s.level>=1000000)return done(false,"Maximum supported level reached.");s.level++;s.version=5;s.layoutVersion=5;delete s.levelMap;s.board=freshLevel(s.level,s.seed,5);return done(true,"Level "+s.level+" ready.");}
 if(action.kind!=="shot"||!validShot(action.shot))return done(false,"Invalid shot.");
 if(s.board.won)return done(false,"Level already complete.");
 if(orangeGameOver(s.board))return done(false,"Game over. Retry the level first.");
 const shot=action.shot,type=shot.type;if(type==="marina"?s.board.marina<=0:s.inventory[type]<=0)return done(false,"No "+AXOLOTLS[type].name+" throws left.");
 let result;try{result=simulateShot(stateMap(s),s.board,shot);}catch(e){return done(false,e.message);}
 if(type==="marina")s.board.marina--;else s.inventory[type]--;
 s.board.hp=result.hp;s.board.remaining=result.remaining;
 if(!result.remaining.length){s.board.won=true;s.board.stars=starRating(stateMap(s),s.board);s.cleared=Math.max(s.cleared,s.level);const rewards=[];if(rng()<fruiterChance(s.level))rewards.push("fruiter");if(s.level>10&&rng()<tangieChance(s.level))rewards.push("tangie");return done(true,"Level "+s.level+" cleared! +10 Star Coins.",WIN_COINS,rewards);}
 return done(true,orangeGameOver(s.board)?"Game over. Retry the level.":result.remaining.length+" oranges left.");
}
