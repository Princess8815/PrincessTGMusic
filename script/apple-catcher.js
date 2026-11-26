
import {auth,usingLocalFirebaseEmulators} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {TICK_MS,CHECKPOINT_TICKS,step,newGame,difficulty,LANES} from "./apple-catcher-core.mjs";
import {showToast} from "./toast-sound.js";
const $=id=>document.getElementById(id),canvas=$("ac-board"),ctx=canvas.getContext("2d"),endpoint="https://princesstg-cd-store-live.transgirl1991.workers.dev/games/apple-catcher";
let game=newGame(1),runId=null,best=0,saved=0,baseTick=0,moves=[],target=2,playing=false,busy=false,failed=null,epoch=0,frame=0,last=0,acc=0,seen=new Set(),loaded=false;
const eligible=()=>!!auth.currentUser?.emailVerified&&!usingLocalFirebaseEmulators;
function status(s){$("ac-status").textContent=s;}
function controls(){
 $("ac-start").disabled=!eligible()||busy||playing||!!failed||!loaded;
 $("ac-finish").hidden=!playing||busy;$("ac-retry").hidden=!failed||busy;
 $("ac-login").hidden=!!auth.currentUser||usingLocalFirebaseEmulators;
}
function draw(){
 const w=600,h=420,ground=350;
 ctx.clearRect(0,0,w,h);ctx.fillStyle="#d7f1cd";ctx.fillRect(0,0,w,h);
 ctx.fillStyle="#7dad64";ctx.fillRect(0,0,w,48);ctx.fillStyle="#527d42";for(let i=0;i<8;i++){ctx.beginPath();ctx.arc(i*88,16,52,0,Math.PI*2);ctx.fill();}
 ctx.fillStyle="#8ac66b";ctx.fillRect(0,ground,w,h-ground);
 for(let i=1;i<LANES;i++){ctx.strokeStyle="#31583920";ctx.beginPath();ctx.moveTo(i*w/LANES,50);ctx.lineTo(i*w/LANES,ground);ctx.stroke();}
 for(const a of game.apples){
  const x=(a.lane+.5)*w/LANES,y=44+(ground-70)*Math.max(0,Math.min(1,(game.tick-a.born)/(a.due-a.born)));
  ctx.fillStyle=a.rotten?"#71683c":"#dd3d48";ctx.strokeStyle=a.rotten?"#443e2a":"#9c2431";ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(x-9,y,15,17,-.25,0,Math.PI*2);ctx.ellipse(x+9,y,15,17,.25,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.strokeStyle="#65412b";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x,y-12);ctx.lineTo(x+3,y-27);ctx.stroke();
  ctx.fillStyle="#3d813b";ctx.beginPath();ctx.ellipse(x+10,y-23,10,5,-.45,0,Math.PI*2);ctx.fill();
  if(a.rotten){ctx.fillStyle="#302a22";for(const [dx,dy] of [[-9,-2],[8,5],[0,10]]){ctx.beginPath();ctx.arc(x+dx,y+dy,4,0,Math.PI*2);ctx.fill();}ctx.strokeStyle="#fff1bb";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-8,y-8);ctx.lineTo(x+8,y+8);ctx.moveTo(x+8,y-8);ctx.lineTo(x-8,y+8);ctx.stroke();}
  else{ctx.fillStyle="#ffb3a6";ctx.beginPath();ctx.ellipse(x-11,y-8,4,7,.5,0,Math.PI*2);ctx.fill();}
 }
 const bx=(game.lane+.5)*w/LANES;
 ctx.fillStyle="#c28a48";ctx.strokeStyle="#76512e";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(bx-47,ground-28);ctx.lineTo(bx+47,ground-28);ctx.lineTo(bx+32,ground+21);ctx.lineTo(bx-32,ground+21);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.strokeStyle="#855a33";for(let i=-25;i<=25;i+=10){ctx.beginPath();ctx.moveTo(bx+i,ground-22);ctx.lineTo(bx+i*.7,ground+17);ctx.stroke();}
 ctx.fillStyle="#e8ba77";ctx.fillRect(bx-49,ground-32,98,8);
 $("ac-score").textContent=game.score;$("ac-lives").textContent=game.lives;$("ac-level").textContent=difficulty(game.tick)+1;$("ac-best").textContent=Math.max(best,game.score);$("ac-saved").textContent=saved;
 for(const b of document.querySelectorAll("[data-lane]"))b.setAttribute("aria-pressed",String(Number(b.dataset.lane)===target));
}
async function request(action,payload={}){
 const user=auth.currentUser;if(!eligible())throw Error("Sign in with a verified Live Firebase account.");
 const idToken=await user.getIdToken();if(auth.currentUser?.uid!==user.uid)throw Error("Account changed.");
 const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,action,...payload})});const data=await res.json();if(!res.ok)throw Error(data.error||"Game service unavailable.");return data;
}
function accept(data,notify=true){
 if(!data)return;runId=data.runId;game=data.state;target=game.target;best=data.best;saved=data.credited;baseTick=game.tick;moves=[];
 if(notify)for(const id of data.rewards||[]){const key=runId+":"+id;if(seen.has(key))continue;seen.add(key);
  showToast(id==="appey"?"You caught Appey in a tree!":id==="fruiter"?"You found Fruiter!":"Trophy earned: Orchard Master!");
 }
 draw();
}
function pause(){playing=false;cancelAnimationFrame(frame);controls();}
function resume(){playing=true;last=0;acc=0;status("Catch the fresh apples!");controls();frame=requestAnimationFrame(loop);}
function loop(now){
 if(!playing)return;if(!last)last=now;acc+=Math.min(250,now-last);last=now;
 while(acc>=TICK_MS&&playing){acc-=TICK_MS;const tick=game.tick+1;if(target!==game.target)moves.push([tick,target]);game=step(game,target).state;
  if(game.done||game.tick-baseTick>=CHECKPOINT_TICKS){void save(game.done?"finish":"checkpoint");break;}
 }
 draw();if(playing)frame=requestAnimationFrame(loop);
}
async function save(action){
 if(busy||!runId)return;pause();const data=failed?.payload||{runId,to:game.tick,moves:moves.slice()},kind=failed?.action||action,current=epoch;
 busy=true;status("Saving your harvest…");controls();
 try{const result=await request(kind,data);if(current!==epoch)return;accept(result);failed=null;busy=false;
  if(result.closed||result.state.done||kind==="finish"){status("Run ended. "+saved+" Star Coins saved.");controls();}
  else if(document.hidden){status("Saved. Return to the page to continue.");controls();}else resume();
 }catch(e){if(current===epoch){failed={action:kind,payload:data};busy=false;status(e.message+" Retry save to keep your coins.");controls();}}
}
$("ac-start").onclick=async()=>{
 if(busy||playing||!eligible())return;const current=epoch,id=crypto.randomUUID();busy=true;controls();status("Starting your orchard…");
 try{const data=await request("start",{runId:id});if(current!==epoch)return;accept(data);busy=false;resume();}
 catch(e){if(current===epoch){busy=false;status(e.message);controls();}}
};
$("ac-retry").onclick=()=>save(failed?.action||"checkpoint");
$("ac-finish").onclick=()=>save("finish");
$("ac-login").onclick=()=>$("auth-open")?.click();
function aim(lane){if(playing)target=Math.max(0,Math.min(LANES-1,lane));}
for(const b of document.querySelectorAll("[data-lane]"))b.onclick=()=>aim(Number(b.dataset.lane));
function pointer(e){const r=canvas.getBoundingClientRect();aim(Math.floor((e.clientX-r.left)/r.width*LANES));}
canvas.addEventListener("pointerdown",e=>{canvas.setPointerCapture(e.pointerId);pointer(e);});
canvas.addEventListener("pointermove",e=>{if(e.pointerType==="mouse"||e.buttons)pointer(e);});
document.addEventListener("keydown",e=>{if(!playing||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName))return;const k=e.key.toLowerCase();if(["arrowleft","a","arrowright","d"].includes(k)){e.preventDefault();aim(target+(["arrowleft","a"].includes(k)?-1:1));}else if(/^[1-5]$/.test(k)){e.preventDefault();aim(Number(k)-1);}});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&playing)void save("checkpoint");else if(!document.hidden&&runId&&!game.done&&!busy&&!failed&&!playing&&$("ac-status").textContent.startsWith("Saved. Return"))resume();});
window.addEventListener("beforeunload",e=>{if(playing||busy||failed){e.preventDefault();e.returnValue="";}});
onAuthStateChanged(auth,async user=>{
 const current=++epoch;pause();busy=false;failed=null;loaded=false;runId=null;game=newGame(1);saved=0;best=0;seen=new Set();draw();controls();
 if(!eligible()){status(usingLocalFirebaseEmulators?"Choose Live Firebase in Settings to play.":!user?"Sign in to play.":"Verify your email to play.");return;}
 busy=true;controls();try{const data=await request("state");if(current!==epoch)return;accept(data,false);busy=false;loaded=true;controls();if(data&&!data.closed&&!data.state.done){status("Resuming your saved run.");resume();}else status("Ready to play.");}
 catch(e){if(current===epoch){busy=false;loaded=true;status(e.message);controls();}}
});draw();
