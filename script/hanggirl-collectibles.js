
import {auth,db} from "./firebase.js";
import {TROPHY} from "./apple-catcher-core.mjs";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {collection,onSnapshot} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
export const GAME_AXOLOTLS=[
 ["hangy","Hangy","#f7a5b8","#c978d5","bow"],["flippy","Flippy","#7de1d4","#5b9fea","scarf"],
 ["magica","Magica","#bba3ff","#ed9dff","star"],["sleepy","Sleepy","#b0d5ef","#aab1e9","heart"],
 ["wordy","Wordy","#f9cf79","#e4a169","bow"],["lazy","Lazy","#c5e8a4","#76c5a1","leaf"],
 ["impressionate","Impressionate","#ffadcb","#ee7d96","heart"],["mindful","Mindful","#a0d9c7","#6ba4a9","shell"],
 ["wired","Wired","#c7a6ff","#f8db61","crown"]
];
export const GAME_TROPHIES=[
 ["hang-girl-mastery","Hang Girl Mastery","Win 1,000 Hanggirl games on any difficulty."],
 ["hang-girl-god","Hang Girl God","Win 100 Hard games in a row."],
 TROPHY
];
const grid=document.getElementById("trophy-grid"),status=document.getElementById("trophy-status");
if(grid&&status){
 let stop=()=>{};
 function render(found){
  grid.replaceChildren();
  for(const [id,name,requirement] of GAME_TROPHIES){
   const card=document.createElement("article");card.className="reef-card hg-trophy";card.tabIndex=0;card.title=requirement;
   const art=document.createElement("div");art.className="reef-card-art";art.setAttribute("aria-hidden","true");
   art.innerHTML='<svg viewBox="0 0 100 100" width="100" height="100"><g fill="'+(id==="hang-girl-god"?"#bca7ff":"#f7ce65")+'" stroke="#74562d" stroke-width="2"><path d="M28 15H72V38Q72 60 50 64Q28 60 28 38Z"/><path d="M28 22H13V31Q13 49 33 49M72 22H87V31Q87 49 67 49" fill="none" stroke-width="6"/><path d="M45 62H55V80H72V89H28V80H45Z"/><path d="m50 23 5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1z" fill="#fff3c8"/></g></svg>';
   if(id==="apple-tree-basket")art.innerHTML='<svg viewBox="0 0 100 100" width="100" height="100"><g stroke="#77512e" stroke-width="2" stroke-linejoin="round"><path d="M46 72L44 31H55L54 72Z" fill="#a66a3a"/><path d="M48 50L32 32M51 48L69 28" fill="none" stroke-width="5"/><g fill="#76b754" stroke="#3b7136"><circle cx="30" cy="32" r="19"/><circle cx="53" cy="21" r="19"/><circle cx="70" cy="35" r="18"/><circle cx="49" cy="43" r="20"/></g><g fill="#e74c50" stroke="#992e32"><circle cx="26" cy="32" r="5"/><circle cx="49" cy="17" r="5"/><circle cx="68" cy="36" r="5"/><circle cx="49" cy="43" r="5"/></g><path d="M23 67H77L69 92H31Z" fill="#e7b06c"/><path d="M29 75H71M32 83H68M39 69L42 91M50 69V92M61 69L58 91" stroke="#a87339" fill="none"/><rect x="20" y="64" width="60" height="7" rx="3" fill="#f8cc83"/></g></svg>';
   if(!found.has(id))art.style.opacity=".35";
   const title=document.createElement("h3");title.textContent=name;
   const hint=document.createElement("p");hint.textContent=requirement;
   const state=document.createElement("p");state.textContent=found.has(id)?"Earned":"Locked";
   card.append(art,title,hint,state);grid.append(card);
  }
 }
 render(new Set());
 onAuthStateChanged(auth,user=>{
  stop();render(new Set());
  if(!user){status.textContent="Sign in to see your trophies.";return;}
  status.textContent="Loading trophies…";
  stop=onSnapshot(collection(db,"users",user.uid,"trophies"),snap=>{
   if(auth.currentUser?.uid!==user.uid||snap.metadata.hasPendingWrites)return;
   const found=new Set(snap.docs.map(d=>d.id));render(found);status.textContent=GAME_TROPHIES.filter(t=>found.has(t[0])).length+" / "+GAME_TROPHIES.length+" trophies earned";
  },()=>{if(auth.currentUser?.uid===user.uid)status.textContent="Trophies unavailable. Try reloading.";});
 });
}
