
import {auth,usingLocalFirebaseEmulators} from "./firebase.js";
import {watchGameRewardAgreement,rewardStatusText} from "./game-reward-status.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
// Game-only live reward endpoint. Checkout keeps its sandbox configuration.
const GAME_WORKER_URL="https://princesstg-cd-store-live.transgirl1991.workers.dev";
const $=id=>document.getElementById(id);
const keyboard=$("hg-keyboard"),difficulty=$("hg-difficulty"),message=$("hg-message");
let state=null,busy=false,epoch=0,rewardCheck={ready:false};
for(const letter of "abcdefghijklmnopqrstuvwxyz"){
 const b=document.createElement("button");b.type="button";b.textContent=letter.toUpperCase();b.dataset.letter=letter;
 b.addEventListener("click",()=>void action("guess",{letter,roundId:state?.round?.id}));keyboard.append(b);
}
function render(){
 const r=state?.round,playing=r?.status==="playing";
 $("hg-play").hidden=!r;$("hg-abandon").hidden=!playing;
 const eligible=!usingLocalFirebaseEmulators&&!!auth.currentUser?.emailVerified;
 $("hg-start").disabled=busy||playing||!eligible||!rewardCheck.ready;
 $("hg-check-rewards").hidden=!eligible;
 difficulty.disabled=busy||playing;
 $("hg-abandon").disabled=busy;
 if(r){
  if(playing)difficulty.value=r.difficulty;
  $("hg-word").textContent=r.mask.join(" ");$("hg-chances").textContent=(6-r.misses)+" of 6 chances remaining";
  for(const star of $("hg-art").querySelectorAll("[data-star]"))star.classList.toggle("dim",Number(star.dataset.star)<=r.misses);
  for(const b of keyboard.children){
   const l=b.dataset.letter;b.disabled=busy||!playing||!rewardCheck.ready||r.letters.includes(l);
   delete b.dataset.hit;if(r.letters.includes(l))b.dataset.hit=String(r.mask.includes(l));
  }
  $("hg-result").textContent=r.status==="won"?("You won! +"+r.awarded+" Star Coin"+(r.awarded===1?"":"s")):r.status==="lost"?"Round lost. The word was "+r.mask.join("").toUpperCase()+".":r.status==="abandoned"?"Round surrendered. Streak reset.":"";
 }else $("hg-result").textContent="";
 if(state){const w=state.wins,b=state.best;$("hg-stats").textContent="Total wins: "+state.totalWins+" | Easy: "+w.easy+" | Medium: "+w.medium+" | Hard: "+w.hard+" | Current streak: "+state.streak+(state.streakDifficulty?" ("+state.streakDifficulty+")":"")+" | Best streaks: "+b.easy+" / "+b.medium+" / "+b.hard;}
 else $("hg-stats").textContent="Start a game to see your progress.";
}
async function action(type,params={}){
 if(busy)return;
 if(["start","guess"].includes(type)&&!rewardCheck.ready){message.textContent="Confirm game reward status before playing.";return;}
 if(usingLocalFirebaseEmulators){message.textContent="Select Live Firebase in Settings and sign in to play.";return;}
 const user=auth.currentUser;if(!user?.emailVerified){message.textContent="Sign in and verify your email to play for rewards.";return;}
 const current=++epoch;busy=true;message.textContent="";$("hg-reload").hidden=true;render();
 try{
  const idToken=await user.getIdToken();
  if(current!==epoch||auth.currentUser?.uid!==user.uid)return;
  const response=await fetch(GAME_WORKER_URL+"/games/hanggirl",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,action:type,...params,...(type==="guess"?{expectedMultiplier:rewardCheck.server.multiplier}:{})})});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||"Game unavailable.");
  if(current===epoch&&auth.currentUser?.uid===user.uid)state=data;
 }catch(e){if(current===epoch){message.textContent=e.message||"Game unavailable. Retry connection.";$("hg-reload").hidden=false;}}
 finally{if(current===epoch){busy=false;render();}}
}
$("hg-start").onclick=()=>action("start",{difficulty:difficulty.value,roundId:crypto.randomUUID()});
$("hg-abandon").onclick=()=>{if(state?.round&&confirm("Give up this round and reset your streak?"))void action("abandon",{roundId:state.round.id});};
$("hg-reload").onclick=()=>{void rewardAgreement.refresh();void action("state");};
const rewardAgreement=watchGameRewardAgreement(next=>{rewardCheck=next;$("hg-reward-status").textContent=next.error||(next.checking?"Checking game server rewards…":next.server?rewardStatusText(next.server):"Sign in to check game rewards.");render();});
$("hg-check-rewards").onclick=()=>void rewardAgreement.refresh();
window.addEventListener("focus",()=>void rewardAgreement.refresh());
$("hg-login").onclick=()=>$("auth-open")?.click();
document.addEventListener("keydown",e=>{
 if(e.ctrlKey||e.altKey||e.metaKey||e.repeat||/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target?.tagName)||e.target?.isContentEditable||document.querySelector("dialog[open]"))return;
 const l=e.key.toLowerCase();if(state?.round?.status==="playing"&&/^[a-z]$/.test(l)){e.preventDefault();void action("guess",{letter:l,roundId:state.round.id});}
});
onAuthStateChanged(auth,user=>{
 epoch++;busy=false;state=null;message.textContent="";$("hg-reload").hidden=true;
 if(usingLocalFirebaseEmulators){$("hg-login").hidden=true;$("hg-mode").textContent="Hanggirl saves real account progress. Select Live Firebase in Settings, then sign in.";render();return;}
 $("hg-login").hidden=!!user;
 $("hg-mode").textContent=!user?"Sign in to play for Star Coins.":user.emailVerified?"Your progress saves to your account.":"Verify your email in your profile, then reload to play.";
 render();if(user?.emailVerified)void action("state");
});
render();
