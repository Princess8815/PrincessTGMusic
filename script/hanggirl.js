
import {auth} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {STORE_WORKER_URL} from "./store-config.js";
import {GAME_AXOLOTLS,GAME_TROPHIES} from "./hanggirl-collectibles.js";
const $=id=>document.getElementById(id);
const live=location.origin==="https://princesstgcreations.pages.dev";
const keyboard=$("hg-keyboard"),difficulty=$("hg-difficulty"),message=$("hg-message");
let state=null,busy=false,epoch=0,practice=null;
const names=new Map([...GAME_AXOLOTLS,...GAME_TROPHIES].map(x=>[x[0],x[1]]));
const practiceWords={easy:["apple","garden","ocean","flower","river","house","music","summer"],medium:["bridge","puzzle","velvet","rocket","lantern","compass","whisper"],hard:["cry","why","try","myth","lynx","rhythm","glyph","quiz","jazz"]};
for(const letter of "abcdefghijklmnopqrstuvwxyz"){
 const b=document.createElement("button");b.type="button";b.textContent=letter.toUpperCase();b.dataset.letter=letter;
 b.addEventListener("click",()=>void action("guess",{letter,roundId:state?.round?.id}));keyboard.append(b);
}
function render(){
 const r=state?.round,playing=r?.status==="playing";
 $("hg-play").hidden=!r;$("hg-abandon").hidden=!playing;
 const eligible=!live||!!auth.currentUser?.emailVerified;
 $("hg-start").disabled=busy||playing||!eligible;
 difficulty.disabled=busy||playing;
 $("hg-abandon").disabled=busy;
 if(r){
  if(playing)difficulty.value=r.difficulty;
  $("hg-word").textContent=r.mask.join(" ");$("hg-chances").textContent=(6-r.misses)+" of 6 chances remaining";
  for(const star of $("hg-art").querySelectorAll("[data-star]"))star.classList.toggle("dim",Number(star.dataset.star)<=r.misses);
  for(const b of keyboard.children){
   const l=b.dataset.letter;b.disabled=busy||!playing||r.letters.includes(l);
   delete b.dataset.hit;if(r.letters.includes(l))b.dataset.hit=String(r.mask.includes(l));
  }
  $("hg-result").textContent=r.status==="won"?(live?"You won! +"+r.awarded+" Star Coins"+(r.unlocks.length?" · New collectible: "+r.unlocks.map(u=>names.get(u.id)).join(", "):""):"You won! Practice earns no rewards."):r.status==="lost"?"Round lost. The word was "+r.mask.join("").toUpperCase()+".":r.status==="abandoned"?"Round surrendered. Streak reset.":"";
 }else $("hg-result").textContent="";
 if(state){const w=state.wins,b=state.best;$("hg-stats").textContent="Total wins: "+state.totalWins+" | Easy: "+w.easy+" | Medium: "+w.medium+" | Hard: "+w.hard+" | Current streak: "+state.streak+(state.streakDifficulty?" ("+state.streakDifficulty+")":"")+" | Best streaks: "+b.easy+" / "+b.medium+" / "+b.hard;}
 else $("hg-stats").textContent="Start a game to see your progress.";
}
function blank(){return {totalWins:0,wins:{easy:0,medium:0,hard:0},streak:0,streakDifficulty:"",best:{easy:0,medium:0,hard:0},round:null};}
function practiceAction(type,params){
 if(!state)state=blank();
 if(type==="start"&&state.round?.status!=="playing"){
  const words=practiceWords[params.difficulty].filter(w=>w!==practice?.word);
  const word=words[Math.floor(Math.random()*words.length)];
  practice={word,id:params.roundId,difficulty:params.difficulty,letters:[],status:"playing",awarded:0,unlocks:[],misses:0};
 }else if(practice?.status==="playing"){
  if(type==="abandon"){practice.status="abandoned";state.streak=0;state.streakDifficulty="";}
  if(type==="guess"&&/^[a-z]$/.test(params.letter)&&!practice.letters.includes(params.letter)){
   practice.letters.push(params.letter);practice.misses=practice.letters.filter(l=>!practice.word.includes(l)).length;
   if([...practice.word].every(l=>practice.letters.includes(l))){
    practice.status="won";state.totalWins++;state.wins[practice.difficulty]++;
    state.streak=state.streakDifficulty===practice.difficulty?state.streak+1:1;state.streakDifficulty=practice.difficulty;
    state.best[practice.difficulty]=Math.max(state.best[practice.difficulty],state.streak);
   }else if(practice.misses>=6){practice.status="lost";state.streak=0;state.streakDifficulty="";}
  }
 }
 if(practice){const {word,...rest}=practice;state.round={...rest,mask:[...word].map(l=>rest.status!=="playing"||rest.letters.includes(l)?l:"_")};}
}
async function action(type,params={}){
 if(busy)return;
 if(!live){practiceAction(type,params);render();return;}
 const user=auth.currentUser;if(!user?.emailVerified){message.textContent="Sign in and verify your email to play for rewards.";return;}
 const current=++epoch;busy=true;message.textContent="";$("hg-reload").hidden=true;render();
 try{
  const idToken=await user.getIdToken();
  if(current!==epoch||auth.currentUser?.uid!==user.uid)return;
  const response=await fetch(STORE_WORKER_URL+"/games/hanggirl",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,action:type,...params})});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||"Game unavailable.");
  if(current===epoch&&auth.currentUser?.uid===user.uid)state=data;
 }catch(e){if(current===epoch){message.textContent=e.message||"Game unavailable. Retry connection.";$("hg-reload").hidden=false;}}
 finally{if(current===epoch){busy=false;render();}}
}
$("hg-start").onclick=()=>action("start",{difficulty:difficulty.value,roundId:crypto.randomUUID()});
$("hg-abandon").onclick=()=>{if(state?.round&&confirm("Give up this round and reset your streak?"))void action("abandon",{roundId:state.round.id});};
$("hg-reload").onclick=()=>action("state");
$("hg-login").onclick=()=>$("auth-open")?.click();
document.addEventListener("keydown",e=>{
 if(e.ctrlKey||e.altKey||e.metaKey||e.repeat||/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target?.tagName)||e.target?.isContentEditable||document.querySelector("dialog[open]"))return;
 const l=e.key.toLowerCase();if(state?.round?.status==="playing"&&/^[a-z]$/.test(l)){e.preventDefault();void action("guess",{letter:l,roundId:state.round.id});}
});
onAuthStateChanged(auth,user=>{
 if(!live){$("hg-mode").textContent="Preview practice mode. No real Star Coins, trophies or axolotls are awarded.";render();return;}
 epoch++;busy=false;state=null;message.textContent="";$("hg-reload").hidden=true;
 $("hg-login").hidden=!!user;
 $("hg-mode").textContent=!user?"Sign in to play for Star Coins.":user.emailVerified?"Reward mode · progress saves to your account.":"Verify your email in your profile, then reload to play.";
 render();if(user?.emailVerified)void action("state");
});
render();
