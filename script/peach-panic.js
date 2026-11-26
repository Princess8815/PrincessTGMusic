
import {auth,usingLocalFirebaseEmulators} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {ROUND_MS,orchard,peachPoints,replayPeaches,SLOTS,PEACH_TROPHY} from "./peach-panic-core.mjs";
import {showToast} from "./toast-sound.js";
const $=id=>document.getElementById(id),area=$("pp-play-area"),board=$("pp-board"),wrap=board.parentElement,fruits=$("pp-fruits"),popups=$("pp-popups");
const endpoint="https://princesstg-cd-store-live.transgirl1991.workers.dev/games/peach-panic",eligible=()=>!!auth.currentUser?.emailVerified&&!usingLocalFirebaseEmulators;
let run=null,peaches=[],picks=[],picked=new Set(),nodes=new Map(),score=0,perfect=0,best=0,baseTime=0,basePerf=0,busy=false,playing=false,failed=null,loaded=false,epoch=0,frame=0,expanded=false,oldOverflow="";
const fruitArt='<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="pp-ring-base" cx="50" cy="50" r="45"/><circle class="pp-ring" cx="50" cy="50" r="45" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 50 50)"/><g class="pp-body"><path d="M49 26Q43 13 54 8" fill="none" stroke="#64442c" stroke-width="5" stroke-linecap="round"/><path d="M51 22Q55 4 77 10Q69 26 51 22Z" fill="#7db75f" stroke="#3d7542" stroke-width="2"/><path class="pp-flesh" d="M50 29C31 15 12 32 15 53C15 76 33 87 50 91C68 86 85 74 85 53C88 31 69 15 50 29Z"/><ellipse class="pp-blush" cx="65" cy="57" rx="15" ry="21" transform="rotate(14 65 57)"/><path d="M50 31Q43 53 51 80" fill="none" stroke="#844d4d" stroke-opacity=".44" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="33" cy="43" rx="9" ry="13" transform="rotate(25 33 43)" fill="#fff9de" opacity=".48"/><path class="pp-blue-mark" d="m70 32 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z"/></g></svg>';
const elapsed=()=>Math.floor(baseTime+performance.now()-basePerf);
const key=()=> "ptg-peach-run-v1:"+auth.currentUser?.uid;
function stash(){try{localStorage.setItem(key(),JSON.stringify({runId:run.runId,picks}));}catch{}}
function forget(){try{localStorage.removeItem(key());}catch{}}
function restore(id){try{const data=JSON.parse(localStorage.getItem(key())||"null");return data?.runId===id&&Array.isArray(data.picks)?data.picks:[];}catch{return [];}}
function status(message){$("pp-status").textContent=message;}
function overlay(title,description){const el=$("pp-overlay");el.hidden=!title;el.children[0].textContent=title||"";el.children[1].textContent=description||"";}
function controls(){
 $("pp-start").disabled=!eligible()||!loaded||busy||playing||!!failed;
 $("pp-login").hidden=!!auth.currentUser||usingLocalFirebaseEmulators;
 $("pp-retry").hidden=!failed||busy;
 $("pp-refresh").hidden=busy||playing||!eligible()||loaded&&!failed;
}
function hud(time){
 $("pp-score").textContent=score;$("pp-perfect").textContent=perfect;$("pp-best").textContent=Math.max(best,score);
 $("pp-time").textContent=(Math.max(0,Math.min(ROUND_MS,ROUND_MS-time))/1000).toFixed(1);
 $("pp-time-fill").style.width=(100*Math.max(0,Math.min(1,1-time/ROUND_MS)))+"%";
}
function pause(){playing=false;cancelAnimationFrame(frame);controls();}
function clearBoard(){fruits.replaceChildren();popups.replaceChildren();nodes.clear();}
function mix(a,b,t){return "rgb("+a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(",")+")";}
function createFruit(p){
 const b=document.createElement("button");b.type="button";b.className="pp-fruit ptg-theme-exempt";b.dataset.blue=String(p.blue);
 b.style.left=SLOTS[p.slot][0]+"%";b.style.top=SLOTS[p.slot][1]+"%";b.innerHTML=fruitArt;
 b.setAttribute("aria-label",p.blue?"Blue peach":"Peach");b.addEventListener("click",()=>pick(p));
 fruits.append(b);nodes.set(p.id,b);return b;
}
function drawFruit(p,b,time){
 const age=time-p.born,progress=Math.max(0,Math.min(1,age/p.ripen)),late=age>p.ripen+150,delta=Math.abs(age-p.ripen);
 b.style.setProperty("--peach-size",String(.48+.52*progress));
 const color=p.blue?mix([122,174,164],[81,166,238],progress):mix([139,183,83],[255,179,112],progress);
 b.style.setProperty("--peach-color",late?mix(p.blue?[81,166,238]:[255,179,112],p.blue?[89,112,154]:[168,98,72],Math.min(1,(age-p.ripen)/1400)):color);
 b.style.setProperty("--peach-blush",p.blue?"#4658d3":"#e86d68");
 b.style.setProperty("--blush-opacity",String(progress*.7));
 b.style.setProperty("--peach-edge",p.blue?"#2c69a2":"#976044");
 b.dataset.perfect=String(delta<=150);b.dataset.late=String(late);
 b.querySelector(".pp-ring").setAttribute("stroke-dasharray",Math.min(100,progress*100)+" 100");
 const label=(p.blue?"Blue peach":"Peach")+(delta<=150?", perfect now":late?", overripe":", growing");
 if(b.getAttribute("aria-label")!==label)b.setAttribute("aria-label",label);
}
function pick(p){
 if(!playing||busy||picked.has(p.id))return;
 const time=elapsed();if(time<p.born||time>=p.expires||time>=ROUND_MS)return;
 picks.push([p.id,time]);picked.add(p.id);stash();
 const points=peachPoints(p,time);score+=points;const exact=Math.abs(time-p.born-p.ripen)<=150;if(exact)perfect++;
 nodes.get(p.id)?.remove();nodes.delete(p.id);
 const float=document.createElement("span");float.className="pp-popup";float.style.left=SLOTS[p.slot][0]+"%";float.style.top=SLOTS[p.slot][1]+"%";
 float.textContent=exact?"PERFECT +"+points:points?"+"+points+(p.blue?" ×2":""):"Too early";popups.append(float);setTimeout(()=>float.remove(),700);
 hud(time);
}
function loop(){
 if(!playing)return;
 const time=elapsed();hud(time);
 if(time>=ROUND_MS){pause();clearBoard();void finish();return;}
 if(time<0){overlay("Get ready",String(Math.ceil(-time/1000)));frame=requestAnimationFrame(loop);return;}
 if(!$("pp-overlay").hidden)overlay(null);
 for(const p of peaches){
  const visible=time>=p.born&&time<p.expires&&!picked.has(p.id),old=nodes.get(p.id);
  if(visible)drawFruit(p,old||createFruit(p),time);
  else if(old){old.remove();nodes.delete(p.id);}
 }
 frame=requestAnimationFrame(loop);
}
async function request(action,payload={}){
 const user=auth.currentUser;if(!eligible())throw Error("Sign in with a verified Live Firebase account.");
 const idToken=await user.getIdToken();if(auth.currentUser?.uid!==user.uid)throw Error("Account changed.");
 const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,idToken,...payload})});
 const data=await response.json();if(!response.ok)throw Error(data.error||"Peach Panic service unavailable.");return data;
}
function accept(data,notify=false){
 pause();clearBoard();best=data.best||0;run=data.runId?data:null;
 if(!run||data.closed){
  score=data.result?.score||0;perfect=data.result?.perfect||0;
  hud(data.result?ROUND_MS:0);
  overlay(data.result?"Round complete: "+score+" points":"Peach Panic",data.result?"Perfect picks: "+perfect+" · Best: "+best:"Pick at the golden ring for perfect points!");
  if(notify)for(const id of data.rewards||[])showToast(id===PEACH_TROPHY[0]?"Trophy earned: Peach Panic Mastery!":id==="peachiboo"?"You found Peachiboo in a blue peach!":"You found Fruiter!");
  forget();status(data.result?"Result saved to your account.":"Ready to play.");controls();return;
 }
 peaches=orchard(data.seed);picks=restore(data.runId);
 try{const result=replayPeaches(data.seed,picks);score=result.score;perfect=result.perfect;}catch{picks=[];score=0;perfect=0;}
 picked=new Set(picks.map(p=>p[0]));stash();baseTime=data.serverNow-data.startAt;basePerf=performance.now();
 playing=true;status("Pick when the ring turns gold!");controls();frame=requestAnimationFrame(loop);
}
async function load(){
 if(!eligible()||busy)return;
 const current=epoch;busy=true;failed=null;controls();status("Loading Peach Panic…");
 try{const data=await request("state");if(current!==epoch)return;busy=false;loaded=true;const pending=!!data.runId&&data.closed&&restore(data.runId).length>0;accept(data,pending);}
 catch(e){if(current===epoch){busy=false;loaded=false;status(e.message);controls();}}
}
async function start(retryId){
 if(!eligible()||busy||playing||!loaded)return;
 const current=epoch,runId=retryId||crypto.randomUUID();busy=true;failed=null;controls();status("Preparing the orchard…");
 try{const data=await request("start",{runId});if(current!==epoch)return;busy=false;accept(data);}
 catch(e){if(current===epoch){busy=false;failed={action:"start",runId};status(e.message+" Retry or refresh the round.");controls();}}
}
async function finish(){
 if(!run||busy||!eligible())return;
 const current=epoch,payload={runId:run.runId,picks:picks.slice()};busy=true;failed=null;controls();overlay("Time's up!", "Saving your score…");status("Saving your score…");stash();
 try{const data=await request("finish",payload);if(current!==epoch)return;busy=false;accept(data,true);}
 catch(e){if(current===epoch){busy=false;failed={action:"finish"};status(e.message+" Retry save to keep your result.");overlay("Score: "+score,"Save not confirmed.");controls();}}
}
const fullscreen=$("pp-fullscreen");
function fit(){
 if(!expanded&&document.fullscreenElement!==area){
  const top=area.getBoundingClientRect().top+window.scrollY;
  area.style.setProperty("--pp-fit",Math.max(270,Math.floor((window.visualViewport?.height||window.innerHeight)-top-8))+"px");
 }
 const w=Math.max(1,Math.floor(Math.min(wrap.clientWidth,wrap.clientHeight*1.5)));
 board.style.width=w+"px";board.style.height=Math.floor(w/1.5)+"px";
}
let fitFrame=0;function queueFit(){if(!fitFrame)fitFrame=requestAnimationFrame(()=>{fitFrame=0;fit();});}
function refreshFullscreen(){
 const active=expanded||document.fullscreenElement===area;fullscreen.textContent=active?"⛶ Exit fullscreen":"⛶ Fullscreen";
 fullscreen.setAttribute("aria-pressed",String(active));fullscreen.setAttribute("aria-label",active?"Exit fullscreen":"Enter fullscreen");
 const stack=$("ptg-toast-stack");if(stack)(active?area:document.body).append(stack);queueFit();
}
function exitExpanded(){if(!expanded)return;expanded=false;area.classList.remove("pp-expanded");document.body.style.overflow=oldOverflow;refreshFullscreen();}
async function exitFullscreen(){if(expanded)exitExpanded();else if(document.fullscreenElement===area)await document.exitFullscreen().catch(()=>{});}
fullscreen.onclick=async()=>{if(expanded||document.fullscreenElement===area){await exitFullscreen();return;}try{if(!area.requestFullscreen)throw Error("Unsupported");await area.requestFullscreen();}catch{oldOverflow=document.body.style.overflow;document.body.style.overflow="hidden";expanded=true;area.classList.add("pp-expanded");refreshFullscreen();}};
document.addEventListener("fullscreenchange",refreshFullscreen);document.addEventListener("keydown",e=>{if(e.key==="Escape"&&expanded){e.preventDefault();exitExpanded();}});
if(typeof ResizeObserver!=="undefined"){const ro=new ResizeObserver(queueFit);for(const el of [wrap,document.querySelector(".pp-heading"),$("auth-container")])if(el)ro.observe(el);}
window.addEventListener("resize",queueFit);window.visualViewport?.addEventListener("resize",queueFit);window.addEventListener("load",queueFit);document.fonts?.ready.then(queueFit);
$("pp-start").onclick=()=>start();$("pp-retry").onclick=()=>{if(failed?.action==="start")start(failed.runId);else if(failed)finish();};$("pp-refresh").onclick=load;
$("pp-login").onclick=async()=>{await exitFullscreen();$("auth-open")?.click();};
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&playing&&elapsed()>=ROUND_MS){pause();clearBoard();void finish();}});
onAuthStateChanged(auth,user=>{++epoch;pause();clearBoard();run=null;score=perfect=best=0;busy=false;loaded=false;failed=null;hud(0);controls();overlay("Peach Panic","Pick at the golden ring for perfect points!");
 if(!eligible()){status(usingLocalFirebaseEmulators?"Choose Live Firebase in Settings to play.":!user?"Sign in to play.":"Verify your email to play.");return;}void load();});
queueFit();controls();
