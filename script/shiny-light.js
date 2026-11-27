import {auth,usingLocalFirebaseEmulators} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {watchStaffRole} from "./staff-auth.js";
import {MAX_LEVEL,MOVABLE,ROTATABLE,difficulty,neighbor} from "./shiny-light-core.mjs";
import {$,callShiny,renderGrid,renderGuide,tileLabel} from "./shiny-light-ui.js";
let state=null,wallet=0,view=null,selected=-1,busy=false,failed=null,epoch=0,page=0,pickerBusy=false;
const key=uid=>"ptg-shiny-pending-v1:"+uid;
const eligible=()=>!!auth.currentUser?.emailVerified&&!usingLocalFirebaseEmulators;
const ready=()=>eligible()&&!!state&&!busy&&!failed;
const status=m=>$("sl-status").textContent=m;
function draw(){
 const tile=state?.board.tiles.find(t=>t.i===selected),play=ready()&&!state.won;
 $("sl-login").hidden=eligible();$("sl-resend").hidden=!failed;$("sl-resend").disabled=busy;
 for(const id of ["sl-picker","sl-retry","sl-reset"])$(id).disabled=!ready();
 $("sl-refresh").disabled=!eligible()||busy||!!failed;
 $("sl-rotate").disabled=!play||!ROTATABLE.has(tile?.type);
 for(const [id,d] of [["sl-left",3],["sl-right",1],["sl-up",0],["sl-down",2]]){
  const j=state?neighbor(selected,d,state.map.width,state.map.height):-1;
  $(id).disabled=!play||!MOVABLE.has(tile?.type)||(tile.axis==="h"?d%2!==1:d%2!==0)||j<0||state.board.tiles.some(t=>t.i===j)||state.map.stars.includes(j)||state.map.coin===j;
 }
 $("sl-check").disabled=!play;$("sl-next").hidden=!state?.won||state.level===MAX_LEVEL;$("sl-next").disabled=!ready();
 $("sl-selection").textContent=tile?tileLabel(tile):"Select a mirror or movable tile.";
 if(!state){$("sl-grid").replaceChildren();for(const id of ["sl-level","sl-fruit","sl-stars","sl-total","sl-wallet","sl-difficulty"])$(id).textContent="–";return;}
 $("sl-level").textContent=state.level;
 $("sl-fruit").textContent=(view?.fruit?.length||0)+"/"+state.board.tiles.filter(t=>["fruit","coloredFruit"].includes(t.type)).length;
 $("sl-stars").textContent="★".repeat(view?.stars?.length||0)+"☆".repeat(3-(view?.stars?.length||0));
 $("sl-total").textContent=state.totalStars.toLocaleString();$("sl-wallet").textContent=wallet.toLocaleString();
 $("sl-difficulty").textContent=difficulty(state.level).replace("-"," ");
 const next=difficulty(state.level+1);$("sl-next").className=next==="normal"?"":"sl-"+next;
 $("sl-next").textContent="Next level"+(next==="normal"?"":" · "+next.replace("-"," "));
 renderGrid($("sl-grid"),state.map,state.board,view,selected,i=>{if(busy)return;selected=i;draw();});
}
function stash(uid,a){try{localStorage.setItem(key(uid),JSON.stringify(a));}catch{}}
function restore(uid){try{return JSON.parse(localStorage.getItem(key(uid))||"null");}catch{return null;}}
function forget(uid){try{localStorage.removeItem(key(uid));}catch{}}
async function send(kind,extra={},retry=false){
 if(!eligible()||busy||!retry&&failed||kind!=="state"&&!state&&!retry)return;
 const uid=auth.currentUser.uid,e=epoch,action=retry?failed:kind==="state"?{kind}:{kind,requestId:crypto.randomUUID(),revision:state.revision,...extra};
 if(!action)return;if(action.kind!=="state")stash(uid,action);
 busy=true;failed=null;draw();status("Saving puzzle…");
 try{
  const data=await callShiny(action,false,uid);if(e!==epoch)return;
  forget(uid);state=data.state;wallet=data.wallet;view=data.view;selected=-1;
  status((data.message||"Ready.")+(data.rewards?.length?" Discovered: "+data.rewards.join(", ")+"!":""));
 }catch(error){if(e!==epoch)return;failed=action;status(error.message+" Retry save to recover the same action.");}
 finally{if(e===epoch){busy=false;draw();}}
}
$("sl-login").onclick=()=>document.getElementById("auth-open")?.click();
$("sl-refresh").onclick=()=>send("state");$("sl-resend").onclick=()=>failed&&send(failed.kind,{},true);
$("sl-rotate").onclick=()=>send("rotate",{i:selected});$("sl-check").onclick=()=>send("check");
for(const [id,dir] of [["sl-left",3],["sl-right",1],["sl-up",0],["sl-down",2]])$(id).onclick=()=>send("move",{i:selected,dir});
$("sl-retry").onclick=()=>send("retry");$("sl-next").onclick=()=>send("next");
$("sl-reset").onclick=()=>{if(ready()&&confirm("Reset all Banana Beams levels and stars? Your wallet and collectibles stay, and previously earned coin rewards cannot be claimed again."))send("resetCampaign");};
$("sl-full").onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector(".sl-main").requestFullscreen();}catch{status("Fullscreen is unavailable in this browser.");}};
async function pick(p){
 if(!ready()||pickerBusy)return;const uid=auth.currentUser.uid,e=epoch;pickerBusy=true;
 page=Math.max(0,Math.min(Math.floor(state.cleared/30),p));$("sl-page-status").textContent="Loading…";$("sl-levels").replaceChildren();
 try{const data=await callShiny({kind:"levels",page},false,uid);if(e!==epoch)return;
 $("sl-page-status").textContent="Unlocked through "+data.unlocked+" · "+data.totalStars+" total stars";
 for(const l of data.levels){const b=document.createElement("button");b.textContent=l.level+" · "+"★".repeat(l.stars)+"☆".repeat(3-l.stars);const d=difficulty(l.level);if(d!=="normal")b.className="sl-"+d;b.onclick=()=>{$("sl-dialog").close();send("selectLevel",{level:l.level});};$("sl-levels").append(b);}
 }catch(error){$("sl-page-status").textContent=error.message;}finally{pickerBusy=false;}
}
$("sl-picker").onclick=()=>{if(!ready())return;$("sl-dialog").showModal();$("sl-jump").value=state.level;pick(Math.floor((state.level-1)/30));};
$("sl-prev-page").onclick=()=>pick(page-1);$("sl-next-page").onclick=()=>pick(page+1);$("sl-close").onclick=()=>$("sl-dialog").close();$("sl-go").onclick=()=>{const n=Number($("sl-jump").value);if(Number.isInteger(n)&&n>=1&&n<=MAX_LEVEL)pick(Math.floor((n-1)/30));};
renderGuide($("sl-guide"));watchStaffRole(ok=>$("sl-editor").hidden=ok!==true);
function sync(){epoch++;state=null;view=null;wallet=0;selected=-1;busy=false;failed=null;if($("sl-dialog").open)$("sl-dialog").close();draw();if(!eligible()){status(usingLocalFirebaseEmulators?"Switch to live Firebase to play.":"Sign in and verify your email to play.");return;}const p=restore(auth.currentUser.uid);if(p){failed=p;send(p.kind,{},true);}else send("state");}
onAuthStateChanged(auth,sync);window.addEventListener("princesstg:email-verified",sync);draw();
