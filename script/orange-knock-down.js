
import {auth,usingLocalFirebaseEmulators} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {WIDTH,HEIGHT,GROUND,SLING,PRICE,TYPES,AXOLOTLS,MATERIALS,FEATURES,featureProgress,featureSchedule,levelIntro,stateMap,designMap,initialOrange,boardFromMap,applyOrange,starRating,velocity,simulateShot,orangeGameOver} from "./orange-knock-down-core.mjs";
import {showToast} from "./toast-sound.js";
const $=id=>document.getElementById(id),area=$("ok-area"),canvas=$("ok-canvas"),ctx=canvas.getContext("2d");
const endpoint="https://princesstg-cd-store-live.transgirl1991.workers.dev/games/orange-knock-down";
const testMode=new URLSearchParams(location.search).get("test")==="1";
let testMap=null;
const eligible=()=>testMode||!!auth.currentUser?.emailVerified&&!usingLocalFirebaseEmulators;
let state=null,wallet=0,type="marina",busy=false,failed=null,epoch=0,drag=null,anim=null,frame=0,expanded=false,oldOverflow="",confirmUntil=0;
let featureSignature="",featureAccount=null;
const quickNodes=new Map(),arenaNodes=new Map();
const nodes=new Map(),status=m=>{$("ok-status").textContent=m;$("ok-rail-status").textContent=m;$("ok-arena-notice").textContent=m;};
const key=uid=>"ptg-orange-pending-v1:"+uid;
const stash=(uid,action)=>{try{localStorage.setItem(key(uid),JSON.stringify(action));}catch{}};
const forget=uid=>{try{localStorage.removeItem(key(uid));}catch{}};
function restore(uid){try{return JSON.parse(localStorage.getItem(key(uid))||"null");}catch{return null;}}
const count=t=>t==="marina"?state?.board.marina||0:state?.inventory[t]||0;
const ready=()=>eligible()&&!!state&&!busy&&!failed;
const canShoot=()=>ready()&&!state.board.won&&!orangeGameOver(state.board)&&count(type)>0;
const arenaMode=()=>expanded||document.fullscreenElement===area;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function portrait(t){const a=AXOLOTLS[t];return '<svg viewBox="0 0 70 55" aria-hidden="true"><g fill="'+a.gill+'"><path d="M19 25 2 7 16 10 24 22 1 23 6 36 24 32M51 25 68 7 54 10 46 22 69 23 64 36 46 32"/></g><ellipse cx="35" cy="30" rx="23" ry="19" fill="'+a.color+'" stroke="#4e4857" stroke-width="2"/><circle cx="27" cy="28" r="2.7" fill="#303244"/><circle cx="43" cy="28" r="2.7" fill="#303244"/><path d="M31 35q4 5 8 0" fill="none" stroke="#60455c" stroke-width="2"/></svg>';}
function buildSelector(t,parent,registry){
 const b=document.createElement("button");b.type="button";b.className="ptg-theme-exempt ok-quick";b.innerHTML=portrait(t);
 const label=document.createElement("span");b.append(label);b.title=AXOLOTLS[t].description;
 b.onclick=()=>{if(!ready()||drag||state.board.won||orangeGameOver(state.board)||!count(t))return;type=t;confirmUntil=0;render();};
 $(parent).append(b);registry.set(t,{b,label});
}
function build(){for(const t of TYPES){buildSelector(t,"ok-quick-team",quickNodes);buildSelector(t,"ok-arena-team",arenaNodes);const card=document.createElement("div");card.className="ok-type";const b=document.createElement("button");b.type="button";b.className="ok-select ptg-theme-exempt";b.innerHTML=portrait(t);const label=document.createElement("span");b.append(label);b.onclick=()=>{type=t;confirmUntil=0;render();};card.append(b);let buy=null;if(t!=="marina"){buy=document.createElement("button");buy.className="ptg-theme-exempt";buy.type="button";buy.textContent="100 ★";buy.title="Buy one "+AXOLOTLS[t].name+" throw";buy.onclick=()=>void send("buy",{type:t});card.append(buy);}const hint=document.createElement("small");hint.textContent=AXOLOTLS[t].description;card.append(hint);$("ok-types").append(card);nodes.set(t,{b,label,buy});}}
function featureIcon(id,locked=false){
 const m=MATERIALS[id==="angled"?"reflector":id]||MATERIALS.wood,fill=locked?"#373a4c":m.color,edge=locked?"#373a4c":m.edge;
 const block=(x,y,w,h,extra="")=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="2" fill="'+fill+'" stroke="'+edge+'" stroke-width="2" '+extra+'/>';
 let art="";
 if(id==="wood"){art=block(8,18,8,36)+block(48,18,8,36)+block(4,12,56,9);}
 else if(id==="wall"||id==="stone"){for(let y=12;y<56;y+=13)for(let x=6+(y%2)*7;x<52;x+=17)art+=block(x,y,15,11);}
 else if(id==="reflector"||id==="angled"){art=block(26,5,12,54,id==="angled"?'transform="rotate(38 32 32)"':"");if(!locked)art+='<path d="M13 13l13 16-13 13" fill="none" stroke="#f6e9ff" stroke-width="3"/>';}
 else if(id==="spring"){art=block(6,43,52,10)+block(8,10,48,10)+'<path d="M13 20l38 6-38 6 38 6-38 5" stroke="'+edge+'" stroke-width="6" fill="none"/>';}
 else if(id==="trampoline"){art='<g transform="rotate(-28 32 32)">'+block(5,23,54,9)+block(9,32,7,16)+block(48,32,7,16)+'</g>';if(!locked)art+='<path d="M9 10l14 11 13-17" fill="none" stroke="#946135" stroke-width="3" stroke-linejoin="round"/>';}
 else if(id==="crate"){art=block(10,11,44,44);if(!locked)art+='<path d="m32 17 5 11 12-1-9 9 3 12-11-7-11 7 3-12-9-9 12 1z" fill="#fff1a4"/>';}
 else{art=block(8,23,48,18,'transform="rotate(-25 32 32)"');if(!locked)art+='<path d="M14 32h36" stroke="#eff6f9" stroke-width="2" transform="rotate(-25 32 32)"/>';}
 return '<svg viewBox="0 0 64 64" aria-hidden="true">'+art+'</svg>';
}
function featureCard(f,compact=false){
 const card=document.createElement("div");card.className="ok-feature-card"+(f.unlocked?" is-unlocked":" is-locked")+(compact?" is-compact":"");
 const icon=document.createElement("span");icon.className="ok-feature-icon";icon.innerHTML=featureIcon(f.id,!f.unlocked);card.append(icon);
 const body=document.createElement("div");body.className="ok-feature-copy";const name=document.createElement("strong"),desc=document.createElement("span");name.textContent=f.unlocked?f.name+(compact?" · 100%":""):"Mystery feature";desc.textContent=f.unlocked?f.description:"Unlocks at level "+f.level+" · "+f.remaining+" "+(f.remaining===1?"clear":"clears")+" to go";body.append(name,desc);
 if(!f.unlocked){const progress=document.createElement("progress");progress.max=100;progress.value=f.percent;progress.setAttribute("aria-label","Progress to next feature");const percent=document.createElement("b");percent.textContent=f.percent+"%";const row=document.createElement("div");row.className="ok-feature-progress";row.append(progress,percent);body.append(row);}
 card.append(body);return card;
}
function renderFeatures(){
 const cleared=state?.cleared||0,signature=String(cleared)+":"+String(state?.level||0)+":"+String(!!state?.board.won)+":"+JSON.stringify(state?.milestones);
 if(signature===featureSignature)return;featureSignature=signature;
 const summary=$("ok-feature-summary"),all=$("ok-feature-list"),victory=$("ok-victory-feature");
 summary.replaceChildren();all.replaceChildren();victory.replaceChildren();victory.hidden=true;
 if(!state)return;
 if(testMode)return;
 const p=featureProgress(cleared,state.milestones);
 if(p.next)summary.append(featureCard(p.next,true));else{const done=document.createElement("p");done.textContent="All orchard mechanics unlocked!";summary.append(done);}
 for(const f of p.features)all.append(featureCard(f));
 const unlocked=p.features.filter(f=>f.level>1&&f.level-1===cleared);
 if(state.board.won){for(const f of unlocked)victory.append(featureCard(f,true));if(p.next)victory.append(featureCard(p.next,true));victory.hidden=!victory.childElementCount;}
}
function controls(){
 const board=state?.board,won=!!board?.won,lost=orangeGameOver(board);
 $("ok-arena-hud").textContent=state?"Lv "+state.level+" · "+board.remaining.length+" 🍊 · Marina ×"+board.marina+(type!=="marina"?" · "+AXOLOTLS[type].name+" ×"+count(type):""):"Orange Knock Down";
 $("ok-arena-notice").hidden=!!state&&!failed;
 $("ok-level").textContent=testMode?"Test":state?.level||1;$("ok-left").textContent=board?.remaining.length||0;$("ok-shots").textContent=board?.marina||0;$("ok-wallet").textContent=testMode?"Practice":wallet.toLocaleString();
 $("ok-login").hidden=testMode||!!auth.currentUser||usingLocalFirebaseEmulators;$("ok-refresh").disabled=busy||!eligible()||!!failed;
 $("ok-resend").hidden=!failed||busy;$("ok-reset").disabled=!ready()||won;$("ok-next").hidden=!won;$("ok-next").disabled=!ready();$("ok-game-retry").hidden=!lost;$("ok-game-retry").disabled=!ready();$("ok-mechanic").textContent=state?(stateMap(state).design||"Classic orchard")+(testMode?" · Practice only":state.levelMap?" · Campaign": " · "+levelIntro(state.level,state.layoutVersion||1)):"";renderFeatures();
 if(confirmUntil&&Date.now()>=confirmUntil)confirmUntil=0;$("ok-reset").textContent=confirmUntil?"Are you sure?":"Retry level";$("ok-reset").classList.toggle("ok-confirm",!!confirmUntil);
 for(const [t,n] of nodes){n.label.textContent=AXOLOTLS[t].name+" ×"+count(t);n.b.setAttribute("aria-pressed",String(type===t));n.b.disabled=!ready()||won||lost||count(t)<=0;if(n.buy){n.buy.hidden=testMode;n.buy.disabled=testMode||!ready()||wallet<PRICE||count(t)>=9999;}}
 for(const registry of [quickNodes,arenaNodes])for(const [t,n] of registry){n.label.textContent=AXOLOTLS[t].name+" ×"+count(t);n.b.setAttribute("aria-pressed",String(type===t));n.b.setAttribute("aria-label",AXOLOTLS[t].name+", "+count(t)+" throws");n.b.disabled=!ready()||won||lost||count(t)<=0;}
 $("ok-quick-info").textContent=AXOLOTLS[type].description;
 $("ok-angle-label").textContent=$("ok-angle").value+"°";$("ok-power-label").textContent=$("ok-power").value+"%";
 $("ok-angle").disabled=!canShoot()||type==="sniper";$("ok-power").disabled=!canShoot()||type==="sniper";
 $("ok-target-label").hidden=type!=="sniper";$("ok-target").disabled=!canShoot();$("ok-fire").disabled=!canShoot();$("ok-fire").textContent="Launch "+AXOLOTLS[type].name;
 const sel=$("ok-target"),signature=(board?.remaining||[]).join(",");
 if(sel.dataset.ids!==signature){const prev=sel.value;sel.replaceChildren();for(const id of board?.remaining||[]){const o=document.createElement("option");o.value=id;o.textContent="Orange "+(id+1);sel.append(o);}if([...sel.options].some(o=>o.value===prev))sel.value=prev;sel.dataset.ids=signature;}
 $("ok-overlay").hidden=busy||!state||(!won&&!lost);$("ok-overlay").classList.toggle("ok-victory",won);$("ok-overlay").classList.toggle("ok-defeat",lost);$("ok-result").textContent=won?"Level cleared!":"Game over";$("ok-result-detail").textContent=won?(testMode?"Practice complete. No rewards.":"10 Star Coins earned. Next level awaits."):"Marina is out of throws. Try the level again!";
 $("ok-stars").hidden=!won;const rating=won?(board.stars||starRating(stateMap(state),board)):0;$("ok-stars").textContent=won?"★".repeat(rating)+"☆".repeat(3-rating):"";
 $("ok-next").textContent=testMode?"Test again":"Next level →";
}
function line(x1,y1,x2,y2,color,width){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap="round";ctx.stroke();}
function circle(x,y,r,color,stroke){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}}
function axo(x,y,t,r){const a=AXOLOTLS[t];ctx.save();ctx.translate(x,y);ctx.scale(r/15,r/15);ctx.fillStyle=a.color;ctx.beginPath();ctx.moveTo(-14,6);ctx.quadraticCurveTo(-27,4,-32,15);ctx.quadraticCurveTo(-14,19,-7,10);ctx.fill();ctx.fillStyle=a.gill;for(const s of [-1,1]){ctx.beginPath();ctx.moveTo(s*10,0);ctx.lineTo(s*24,-14);ctx.lineTo(s*16,-12);ctx.lineTo(s*25,0);ctx.lineTo(s*14,5);ctx.lineTo(s*22,11);ctx.lineTo(s*9,8);ctx.fill();}ctx.beginPath();ctx.ellipse(0,2,16,12,0,0,Math.PI*2);ctx.fillStyle=a.color;ctx.fill();ctx.strokeStyle="#5d4a58";ctx.lineWidth=1;ctx.stroke();circle(-5,0,2,"#343141");circle(5,0,2,"#343141");ctx.beginPath();ctx.arc(0,3,4,0,Math.PI);ctx.stroke();ctx.restore();}
function orange(x,y){circle(x,y,14,"#f6a12d","#bb6b21");circle(x-4,y-4,3,"#ffda87");line(x,y-14,x+3,y-20,"#6d5535",2);ctx.fillStyle="#57914b";ctx.beginPath();ctx.ellipse(x+6,y-16,6,3,-.6,0,Math.PI*2);ctx.fill();}
function draw(now=performance.now()){
 ctx.clearRect(0,0,WIDTH,HEIGHT);const sky=ctx.createLinearGradient(0,0,0,GROUND);sky.addColorStop(0,"#a9dbea");sky.addColorStop(1,"#eaf2c7");ctx.fillStyle=sky;ctx.fillRect(0,0,WIDTH,HEIGHT);
 circle(95,80,38,"#fff2b0");for(const [x,y] of [[215,72],[590,48],[825,82]]){circle(x,y,25,"#f9fbec");circle(x+26,y+5,23,"#f9fbec");circle(x-25,y+8,20,"#f9fbec");}
 ctx.fillStyle="#a5c787";ctx.beginPath();ctx.moveTo(0,GROUND);ctx.quadraticCurveTo(220,350,460,GROUND);ctx.quadraticCurveTo(720,310,960,GROUND);ctx.fill();ctx.fillStyle="#77a45d";ctx.fillRect(0,GROUND,WIDTH,HEIGHT-GROUND);ctx.fillStyle="#527f47";ctx.fillRect(0,GROUND,WIDTH,5);
 line(SLING.x-17,GROUND,SLING.x-17,SLING.y-22,"#895937",12);line(SLING.x-17,GROUND,SLING.x+17,SLING.y-22,"#895937",12);
 if(!state)return;
 const map=stateMap(state),board=state.board;
 const tick=anim?Math.min(anim.duration,Math.max(0,Math.floor((now-anim.start)/16))):0;
 const events=anim?.trace.events||[],fallen=new Map(events.filter(e=>e.t<=tick&&e.kind==="orange").map(e=>[e.id,e])),broken=new Map(events.filter(e=>e.t<=tick&&e.kind==="branch").map(e=>[e.id,e])),damage=new Map(events.filter(e=>e.t<=tick&&e.kind==="damage").map(e=>[e.id,e.hp]));
 for(const b of map.branches){
  if(!board.hp[b.id])continue;
  const e=broken.get(b.id);let dy=0;if(e){const dt=tick-e.t;dy=.31*dt*dt;if(b.y1+dy>GROUND+20)continue;}
  const material=MATERIALS[b.material]||MATERIALS.wood,w=b.width||12,hp=damage.get(b.id)??board.hp[b.id];
  ctx.save();ctx.translate(b.x1,b.y1+dy);const dx=b.x2-b.x1,by=b.y2-b.y1,len=Math.hypot(dx,by);ctx.rotate(Math.atan2(by,dx));
  ctx.fillStyle=material.color;ctx.strokeStyle=material.edge;ctx.lineWidth=2;ctx.fillRect(0,-w/2,len,w);ctx.strokeRect(0,-w/2,len,w);
  if(b.material==="wall"||b.material==="stone"){for(let x=18;x<len;x+=23)line(x,-w/2,x,w/2,material.edge,1.3);line(0,0,len,0,material.edge,1);}
  else if(b.trampoline){ctx.fillStyle="#584339";ctx.fillRect(8,w/2,7,b.directional?12:25);ctx.fillRect(len-15,w/2,7,b.directional?12:25);line(3,-w/2+2,len-3,-w/2+2,"#fff2ac",3);for(let x=9;x<len-6;x+=12)line(x,-2,x+5,3,"#d99b3d",1);if(b.directional){line(3,w/2-2,len-3,w/2-2,"#fff2ac",2);for(const x of [len*.3,len*.7]){line(x-5,-1,x,-4,"#946135",1.5);line(x,-4,x+5,-1,"#946135",1.5);}}}
  else if(b.spring){for(let x=6;x<len-5;x+=12)line(x,-w/2+2,x+6,w/2-2,"#e2ffe4",3);}
  else if(b.reflect){for(let x=8;x<len-5;x+=18)line(x,-w/2+2,x+8,w/2-2,"#f4eaff",2);}
  else if(b.burst){ctx.fillStyle="#fff0a5";ctx.font="bold 18px system-ui";ctx.textAlign="center";ctx.fillText("✦",len/2,6);}
  else if(b.material==="reinforced"){line(2,-w/3,len-2,-w/3,"#b4c7d5",2);line(2,w/3,len-2,w/3,"#b4c7d5",2);for(let x=8;x<len;x+=22)circle(x,0,3,"#e0e6ec",material.edge);}
  else if(b.material==="steel"){for(let x=8;x<len;x+=30)circle(x,0,2.8,"#c7d5e1",material.edge);}
  else if(b.material==="glass"){line(3,-w/2+3,len-3,-w/2+3,"#e7fbff",2);for(let x=12;x<len;x+=24)line(x,-w/2+2,x+5,w/2-2,"#e7fbff",1);}
  else{line(4,-w/2+3,len-4,-w/2+3,"#d3a56c",2);line(10,1,len-10,1,"#775031",1);}
  if(!e&&hp<b.hp&&!b.reflect){line(len*.48,-w/2,len*.54,0,"#382a28",2);line(len*.54,0,len*.46,w/2,"#382a28",2);}
  ctx.restore();
  if(!e&&!b.reflect&&b.hp>1){ctx.font="bold 11px system-ui";ctx.textAlign="center";ctx.fillStyle="#302c2a";ctx.fillText(String(hp),b.x1+dx/2,b.y1+by/2-12);}
 }
 for(const o of map.oranges){if(!board.remaining.includes(o.id))continue;const e=fallen.get(o.id),dt=e?tick-e.t:0,y=e?Math.min(GROUND-14,o.y+.32*dt*dt):o.y;
  if(e&&dt>48)continue;if(!e&&(state.layoutVersion||1)===1)line(o.x,o.y-20,o.x,o.y-12,"#6e5737",2);orange(o.x,y);
  if(!anim&&type==="sniper"){ctx.font="bold 10px system-ui";ctx.textAlign="center";ctx.fillStyle="#522b14";ctx.fillText(String(o.id+1),o.x,o.y+4);if(Number($("ok-target").value)===o.id){ctx.beginPath();ctx.arc(o.x,o.y,22,0,Math.PI*2);ctx.strokeStyle="#7438be";ctx.lineWidth=3;ctx.stroke();}}
 }
 if(anim){for(const p of anim.trace.frames[tick]||[])axo(p.x,p.y,p.type,p.r);for(const e of events)if(e.kind==="bounce"&&tick>=e.t&&tick-e.t<12){ctx.globalAlpha=1-(tick-e.t)/12;circle(e.x,e.y,8+(tick-e.t)*2,"#e6d9ff","#7d56bd");ctx.globalAlpha=1;}for(const e of events)if(e.kind==="blast"&&tick>=e.t&&tick-e.t<15){ctx.globalAlpha=1-(tick-e.t)/15;circle(e.x,e.y,20+(tick-e.t)*7,"#fff2aa","#f2a329");ctx.globalAlpha=1;}return;}
 const pull=drag?drag.point:SLING;line(SLING.x-17,SLING.y-22,pull.x,pull.y,"#573a2b",4);line(SLING.x+17,SLING.y-22,pull.x,pull.y,"#573a2b",4);
 if(count(type)>0&&!board.won&&!orangeGameOver(board))axo(pull.x,pull.y,type,type==="bulky"?23:15);
 if(canShoot()&&type!=="sniper"){const v=velocity(Number($("ok-angle").value),Number($("ok-power").value));for(let i=5;i<=55;i+=5){const x=SLING.x+v.vx*i,y=SLING.y+v.vy*i+.17*i*(i+1);if(x>WIDTH||y>GROUND)break;circle(x,y,2.4,"#fff9e8","#9d875c");}}
}
function render(){controls();draw();}
function boardGeometry(){const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/WIDTH,r.height/HEIGHT);return {scale,x0:r.left+(r.width-WIDTH*scale)/2,y0:r.top+(r.height-HEIGHT*scale)/2};}
function point(e){const {scale,x0,y0}=boardGeometry();return {x:(e.clientX-x0)/scale,y:(e.clientY-y0)/scale};}
function aim(e){
 const p=point(e);
 // Relative touch dragging avoids jumps when the finger begins beside Marina.
 // A short physical pull on a narrow phone can still reach maximum power.
 const dx=Math.max(0,drag.touch?(drag.startX-e.clientX)*drag.gain:SLING.x-p.x);
 const dy=drag.touch?(e.clientY-drag.startY)*drag.gain:p.y-SLING.y;
 const length=Math.hypot(dx,dy),angle=clamp(Math.round(Math.atan2(dy,dx)*180/Math.PI),-20,80),power=clamp(Math.round(length/105*100),1,100);
 $("ok-angle").value=angle;$("ok-power").value=power;
 const r=Math.min(105,length),rad=angle*Math.PI/180;drag.point={x:SLING.x-Math.cos(rad)*r,y:SLING.y+Math.sin(rad)*r};
 render();
}
function shotFromControls(){return type==="sniper"?{type,target:Number($("ok-target").value)}:{type,angle:Number($("ok-angle").value),power:Number($("ok-power").value)};}
canvas.addEventListener("pointerdown",e=>{
 if(!canShoot()||drag||!e.isPrimary||e.button!==0)return;
 const p=point(e),scale=boardGeometry().scale,touch=e.pointerType==="touch"||e.pointerType==="pen";
 if(p.x<0||p.x>WIDTH||p.y<0||p.y>HEIGHT)return;
 if(type==="sniper"){
  const target=stateMap(state).oranges.filter(o=>state.board.remaining.includes(o.id)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
  if(target&&Math.hypot(target.x-p.x,target.y-p.y)<(touch?Math.max(40,24/scale):40)){$("ok-target").value=target.id;void launch();}
  return;
 }
 if(touch?p.x>WIDTH*.30||Math.abs(p.y-SLING.y)>Math.max(125,40/scale):Math.hypot(p.x-SLING.x,p.y-SLING.y)>65)return;
 e.preventDefault();drag={id:e.pointerId,touch,startX:e.clientX,startY:e.clientY,gain:Math.max(1/scale,105/50),point:{...SLING}};
 try{canvas.setPointerCapture(e.pointerId);}catch{}
 if(!touch)aim(e);else draw();
});
canvas.addEventListener("pointermove",e=>{if(drag?.id===e.pointerId){e.preventDefault();aim(e);}});
canvas.addEventListener("pointerup",e=>{
 if(drag?.id!==e.pointerId)return;e.preventDefault();
 const p=point(e),dist=drag.touch?Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY):Math.hypot(p.x-SLING.x,p.y-SLING.y),threshold=drag.touch?7:12;
 const valid=canShoot()&&dist>=threshold;
 if(valid)aim(e);
 drag=null;if(valid)void launch();else render();
});
function cancelDrag(e){if(drag?.id===e.pointerId){drag=null;render();}}
canvas.addEventListener("pointercancel",cancelDrag);canvas.addEventListener("lostpointercapture",cancelDrag);
window.addEventListener("blur",()=>{if(drag){drag=null;render();}});
async function request(action,uid){const user=auth.currentUser;if(!eligible()||user.uid!==uid)throw Error("Sign in with a verified account.");const idToken=await user.getIdToken();if(auth.currentUser?.uid!==uid)throw Error("Account changed.");const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,...action})});const data=await r.json();if(!r.ok)throw Error(data.error||"Game unavailable.");return data;}
function accept(data,notify){const previous=state?.cleared;state=data.state;wallet=data.wallet;confirmUntil=0;if(!count(type))type=count("marina")?"marina":type;status(data.message||"Ready.");if((data.rewards||[]).includes("orange-knock-down-mastery")&&!data.conflict)showToast("Trophy earned: Orange Knock Down Mastery!");if(notify){if(data.coins>0&&previous!==undefined){for(const f of featureSchedule(state.milestones))if(!arenaMode()&&f.level>1&&previous<f.level-1&&state.cleared>=f.level-1)showToast("New feature unlocked: "+f.name+"!");}if(data.coins>0)showToast("Level cleared! +"+data.coins+" Star Coins");for(const id of data.rewards||[])if(id!=="orange-knock-down-mastery")showToast(id==="tangie"?"You found Tangie!":"You found Fruiter!");}}
function animate(trace,current){
 return new Promise(resolve=>{anim={trace,start:performance.now(),duration:Math.max(trace.frames.length,...trace.events.map(e=>e.t+50),1)};function step(now){if(current!==epoch||!anim){resolve();return;}draw(now);if(now-anim.start>=anim.duration*16){resolve();return;}frame=requestAnimationFrame(step);}frame=requestAnimationFrame(step);});
}
function startTest(){
 if(!testMap)return;
 state=initialOrange(0);state.levelMap=testMap;state.board=boardFromMap(testMap);wallet=0;type="marina";busy=false;failed=null;anim=null;confirmUntil=0;status("Practice only. No Star Coins, collectibles or campaign progress.");render();
}
async function send(kind,extra={},retry=false,trace=null){
 if(testMode){
  if(busy||!state)return;
  if(kind==="retry"||kind==="next"||kind==="state"){startTest();return;}
  if(kind!=="shot"||!canShoot())return;
  busy=true;render();if(trace)await animate(trace,epoch);anim=null;
  const result=applyOrange(state,{kind,...extra},()=>1);
  state=result.state;busy=false;if(!count(type)&&count("marina"))type="marina";status(state.board.won?"Practice complete. No rewards.":result.message);render();return;
 }
 if(!eligible()||busy||(!retry&&failed)||kind!=="state"&&!state&&!retry)return;
 const uid=auth.currentUser.uid,current=epoch,action=retry?failed:kind==="state"?{kind}:{kind,requestId:crypto.randomUUID(),revision:state.revision,...extra};if(action.kind!=="state")stash(uid,action);
 busy=true;failed=null;confirmUntil=0;status(kind==="shot"?"Launching…":"Saving…");render();
 try{
  const net=request(action,uid).then(data=>({data}),error=>({error}));
  const [result]=await Promise.all([net,trace?animate(trace,current):Promise.resolve()]);
  if(current!==epoch)return;if(result.error)throw result.error;
  anim=null;busy=false;forget(uid);if(action.kind==="retry"&&result.data.applied&&!result.data.conflict)type="marina";accept(result.data,action.kind!=="state"&&!result.data.conflict);render();
 }catch(e){if(current!==epoch)return;anim=null;busy=false;failed=action;status(e.message+" Retry save to recover the same action.");render();}
}
async function launch(){if(!canShoot())return;const shot=shotFromControls();let trace;try{trace=simulateShot(stateMap(state),state.board,shot,true);}catch(e){status(e.message);return;}await send("shot",{shot},false,trace);}
$("ok-fire").onclick=()=>{if(!drag)void launch();};$("ok-angle").oninput=render;$("ok-power").oninput=render;$("ok-target").onchange=render;
$("ok-reset").onclick=()=>{if(!ready())return;if(confirmUntil>Date.now())void send("retry");else{confirmUntil=Date.now()+8000;render();}};
$("ok-game-retry").onclick=()=>{if(ready()&&orangeGameOver(state.board))void send("retry");};
$("ok-next").onclick=()=>void send("next");$("ok-refresh").onclick=()=>void send("state");$("ok-resend").onclick=()=>{if(failed)void send(failed.kind,{},true);};
function fullRefresh(){drag=null;const active=expanded||document.fullscreenElement===area;$("ok-full").textContent=active?"⛶ Exit fullscreen":"⛶ Fullscreen";$("ok-full").setAttribute("aria-pressed",String(active));const stack=$("ptg-toast-stack");if(stack)(active?area:document.body).append(stack);render();}
async function exitFull(){if(expanded){expanded=false;area.classList.remove("ok-expanded");document.body.style.overflow=oldOverflow;fullRefresh();}else if(document.fullscreenElement===area)await document.exitFullscreen().catch(()=>{});}
$("ok-back").onclick=()=>void exitFull();
$("ok-full").onclick=async()=>{if(expanded||document.fullscreenElement===area)return exitFull();try{if(!area.requestFullscreen)throw Error("Unavailable");await area.requestFullscreen();}catch{oldOverflow=document.body.style.overflow;document.body.style.overflow="hidden";expanded=true;area.classList.add("ok-expanded");fullRefresh();}};
document.addEventListener("fullscreenchange",fullRefresh);document.addEventListener("keydown",e=>{if(e.key==="Escape"&&expanded)void exitFull();});$("ok-login").onclick=async()=>{await exitFull();$("auth-open")?.click();};
build();render();if(testMode){area.classList.add("ok-test-mode");try{testMap=designMap(JSON.parse(sessionStorage.getItem("ptg-orange-test")||"null"));startTest();}catch(e){status("No valid test level. Return to the editor and select Test level.");}}else onAuthStateChanged(auth,user=>{++epoch;cancelAnimationFrame(frame);anim=null;state=null;wallet=0;type="marina";busy=false;failed=null;drag=null;confirmUntil=0;render();if(!eligible()){status(!user?"Sign in to play.":usingLocalFirebaseEmulators?"Select Live Firebase in Settings.":"Verify your email to play.");return;}const pending=restore(user.uid);if(pending){failed=pending;void send(pending.kind,{},true);}else void send("state");});
setInterval(()=>{if(confirmUntil&&Date.now()>=confirmUntil){confirmUntil=0;controls();}},500);
