import {auth,usingLocalFirebaseEmulators} from "./firebase.js";
import {FEATURES,MOVABLE,ROTATABLE,COLORS,COLOR_HEX} from "./shiny-light-core.mjs";
export const $=id=>document.getElementById(id);
const endpoint="https://princesstg-cd-store-live.transgirl1991.workers.dev/games/";
export async function callShiny(action,editor=false,uid=auth.currentUser?.uid){
 const user=auth.currentUser;if(!user||user.uid!==uid||!user.emailVerified||usingLocalFirebaseEmulators)throw Error("Sign in with a verified live account.");
 const idToken=await user.getIdToken();if(auth.currentUser?.uid!==uid)throw Error("Account changed.");
 const res=await fetch(endpoint+(editor?"shiny-light-editor":"shiny-light"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,...action})});
 const data=await res.json().catch(()=>({}));if(!res.ok)throw Object.assign(Error(data.error||"Puzzle service unavailable."),{status:res.status});return data;
}
const icons={source:"Shiny",fruit:"🍌",coloredFruit:"🍌",mirror:"/",movingMirror:"/",oneWay:"/",movingOneWay:"/",linked:"/",barrier:"▉",movingBarrier:"▉",ice:"▧",button:"●",buttonDoor:"▣",tee:"⊥",movingTee:"⊥",cross:"✚",movingCross:"✚",dampener:"−",movingDampener:"−",amplifier:"+",movingAmplifier:"+",lightDoor:"▣",portal:"◎",rotatingPortal:"◉",changer:"◆",movingChanger:"◆",colorDoor:"▣",blackHole:"⬤",filter:"◈",movingFilter:"◈",combiner:"⊕",invertedDoor:"▣",continuous:"◍",multiDoor:"▣"};
export const name=t=>FEATURES.find(f=>f.id===t)?.name||t;
const dirs=["↑","→","↓","←"];
const ns="http://www.w3.org/2000/svg";
const shinySVG='<svg class="sl-shiny" viewBox="0 0 100 100" aria-hidden="true"><g fill="#f9b64c" stroke="#ac7032" stroke-width="2"><path d="M24 38Q0 18 9 13L32 29M24 45Q1 36 5 49L28 56M76 38Q100 18 91 13L68 29M76 45Q99 36 95 49L72 56"/></g><path d="M68 73Q95 68 95 43Q105 83 73 87" fill="#fff2a0" stroke="#c58d45" stroke-width="2"/><ellipse cx="50" cy="70" rx="26" ry="20" fill="#fff2a0" stroke="#c58d45" stroke-width="2"/><ellipse cx="50" cy="44" rx="34" ry="28" fill="#fff2a0" stroke="#c58d45" stroke-width="2"/><circle cx="36" cy="42" r="4" fill="#463438"/><circle cx="64" cy="42" r="4" fill="#463438"/><path d="M45 52q5 5 10 0" fill="none" stroke="#463438" stroke-width="2"/><path d="m50 2 3 9 9 1-7 6 2 9-7-5-7 5 2-9-7-6 9-1z" fill="#ffe06b" stroke="#ba8137"/></svg>';
export function tileLabel(t){
 if(!t)return "Empty";
 let s=name(t.type);
 if(ROTATABLE.has(t.type))s+=" "+(t.dir%2?"backslash":"slash");
 if(t.type==="source"||t.type==="oneWay"||t.type==="movingOneWay"||t.type==="combiner"||t.type==="rotatingPortal")s+=" "+dirs[t.dir];
 if(MOVABLE.has(t.type)||t.type==="ice")s+=" "+(t.axis==="h"?"horizontal":"vertical");
 if(["changer","movingChanger","filter","movingFilter","colorDoor","coloredFruit","multiDoor"].includes(t.type))s+=" "+COLORS[t.color];
 if(["source","amplifier","movingAmplifier","dampener","movingDampener","lightDoor","multiDoor"].includes(t.type))s+=" intensity "+t.power;
 if(["button","buttonDoor","invertedDoor","continuous","portal","rotatingPortal","linked"].includes(t.type))s+=" "+t.id;
 if(t.type==="multiDoor")s+=" "+t.buttons.join(",");
 return s;
}
export function renderGrid(el,map,board,view,selected,onSelect){
 el.replaceChildren();el.style.setProperty("--w",map.width);el.style.setProperty("--h",map.height);
 const tiles=new Map(board.tiles.map(t=>[t.i,t])),lit=new Map(view?.lit||[]),fruit=new Set(view?.fruit||[]),stars=new Set(view?.stars||[]);
 for(let i=0;i<map.width*map.height;i++){
  const t=tiles.get(i),b=document.createElement("button");b.type="button";b.className="sl-cell";
  const goal=t&&["fruit","coloredFruit"].includes(t.type);
  b.classList.toggle("sl-selected",selected===i);b.classList.toggle("sl-lit",goal?fruit.has(i):lit.has(i));b.classList.toggle("sl-goal",!!goal);
  b.classList.toggle("sl-block",!!t&&["barrier","movingBarrier","ice","blackHole"].includes(t.type));
  const label=tileLabel(t)+ (map.stars.includes(i)?", star":"")+(map.coin===i?", Star Coin":"");
  b.title=label;b.setAttribute("aria-label","Row "+(Math.floor(i/map.width)+1)+", column "+(i%map.width+1)+": "+label);b.onclick=()=>onSelect(i);
  if(t){
   if(t.type==="source"){const holder=document.createElement("span");holder.innerHTML=shinySVG;holder.style.display="contents";b.append(holder);}
   else{const g=document.createElement("span");g.className="sl-glyph";g.textContent=ROTATABLE.has(t.type)?(t.dir%2?"\\":"/"):(icons[t.type]||"?");if(ROTATABLE.has(t.type))g.classList.add("sl-mirror");
   if(["changer","movingChanger","filter","movingFilter","coloredFruit","colorDoor","multiDoor"].includes(t.type)){g.style.color=COLOR_HEX[t.color];if(t.type==="coloredFruit")g.style.textShadow="0 0 6px "+COLOR_HEX[t.color];}
   if(t.type==="blackHole")g.style.color="#050910";b.append(g);}
   const tag=document.createElement("small");tag.className="sl-tag";const labels=[];
   if(MOVABLE.has(t.type)||t.type==="ice")labels.push(t.axis==="h"?"↔":"↕");
   if(["source","oneWay","movingOneWay","combiner","rotatingPortal"].includes(t.type))labels.push(dirs[t.dir]);
   if(["button","buttonDoor","invertedDoor","continuous","portal","rotatingPortal","linked"].includes(t.type))labels.push(t.id);
   if(["lightDoor","multiDoor","amplifier","dampener","movingAmplifier","movingDampener"].includes(t.type))labels.push(t.power);
   if(t.type==="button"&&board.latched.includes(t.id)||t.type==="continuous"&&view?.continuous?.includes(t.id))labels.push("✓");
   tag.textContent=labels.join(" ");b.append(tag);
  }
  if(map.stars.includes(i)){const s=document.createElement("span");s.className="sl-overlay";s.textContent=stars.has(i)?"★":"☆";b.append(s);}
  if(map.coin===i){const c=document.createElement("span");c.className="sl-coin";c.textContent=view?.coin?"✓":"●";b.append(c);}
  el.append(b);
 }
 const svg=document.createElementNS(ns,"svg");svg.setAttribute("class","sl-rays");svg.setAttribute("viewBox","0 0 "+map.width+" "+map.height);svg.setAttribute("aria-hidden","true");
 const draw=(e,width,opacity,color)=>{const line=document.createElementNS(ns,"line");line.setAttribute("x1",e.from%map.width+.5);line.setAttribute("y1",Math.floor(e.from/map.width)+.5);line.setAttribute("x2",e.to%map.width+.5);line.setAttribute("y2",Math.floor(e.to/map.width)+.5);line.setAttribute("stroke",color);line.setAttribute("stroke-width",width);line.style.opacity=opacity;svg.append(line);};
 for(const e of view?.edges||[]){const c=COLOR_HEX[e.color];draw(e,.22,.23,c);draw(e,.045+e.power*.008,.94,c);}
 el.append(svg);
}
export function renderGuide(el){for(const f of FEATURES){const item=document.createElement("span");item.textContent=(icons[f.id]||"")+" "+f.name;el.append(item);}}
