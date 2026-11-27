
import {auth,db} from "./firebase.js";
import {TROPHY} from "./apple-catcher-core.mjs";
import {CHERRY_TROPHY} from "./cherry-empire-core.mjs";
import {PEACH_TROPHY} from "./peach-panic-core.mjs";
import {GIVING_TREE_TROPHY} from "./giving-tree-core.mjs";
import {ORANGE_TROPHY} from "./orange-knock-down-core.mjs";
import {BANANA_TROPHY} from "./shiny-light-core.mjs";
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
 TROPHY,CHERRY_TROPHY,PEACH_TROPHY,GIVING_TREE_TROPHY,ORANGE_TROPHY,BANANA_TROPHY
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
   if(id==="cherry-garden-mastery")art.innerHTML='<svg viewBox="0 0 100 100" width="100" height="100"><g stroke="#8c622d" stroke-width="2" stroke-linejoin="round"><path d="M12 75Q50 64 88 75L81 87H19Z" fill="#f7cd70"/><path d="M32 87H68L75 96H25Z" fill="#d5a34d"/><path d="M21 75V47M50 73V32M79 75V47" stroke="#985c39" stroke-width="5"/><g fill="#76b754" stroke="#3d7545"><circle cx="15" cy="46" r="12"/><circle cx="27" cy="44" r="13"/><circle cx="50" cy="30" r="19"/><circle cx="72" cy="45" r="13"/><circle cx="85" cy="46" r="12"/></g><g stroke="#426d38"><path d="M19 41L13 52M19 41L25 52M49 24L40 38M49 24L58 38M79 41L73 52M79 41L85 52" fill="none"/></g><g fill="#d83757" stroke="#8f2947"><circle cx="13" cy="52" r="4"/><circle cx="25" cy="52" r="4"/><circle cx="40" cy="38" r="5"/><circle cx="58" cy="38" r="5"/><circle cx="73" cy="52" r="4"/><circle cx="85" cy="52" r="4"/></g><path d="m50 4 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" fill="#ffe7a1"/><path d="M38 80H62" stroke="#fff0bd" stroke-width="3"/></g></svg>';
   if(id==="peach-panic-mastery")art.innerHTML='<svg viewBox="0 0 100 100" width="100" height="100"><g stroke="#8e6332" stroke-width="2" stroke-linejoin="round"><circle cx="50" cy="42" r="35" fill="#f8d67d"/><circle cx="50" cy="42" r="29" fill="#fff0ba"/><path d="M36 69H64L60 82H71V92H29V82H40Z" fill="#d5a14f"/><path d="M50 26Q46 12 53 8" stroke="#895b40" fill="none" stroke-width="4"/><path d="M51 21Q62 7 77 15Q68 26 51 21Z" fill="#82b968" stroke="#477747"/><path d="M50 29C35 18 20 31 24 46Q27 63 50 69Q72 63 76 46C80 30 65 18 50 29Z" fill="#ffb27e" stroke="#c66f57"/><path d="M50 30Q44 47 50 63" fill="none" stroke="#d48169"/><ellipse cx="36" cy="39" rx="6" ry="9" fill="#ffe5c0" stroke="none"/><path d="M50 13V7M79 41H85M21 41H15" stroke="#9a6b39" stroke-width="3"/><path d="M43 86H57" stroke="#ffedba" stroke-width="3"/></g></svg>';
   if(id===GIVING_TREE_TROPHY[0])art.innerHTML='<svg viewBox="0 0 100 100" width="100" height="100"><g stroke="#74562d" stroke-width="2"><path d="M28 80H72L81 94H19Z" fill="#d9a849"/><path d="M45 78V41H55V78" fill="#ac7544"/><path d="M50 58L29 38M50 49L72 30" fill="none" stroke="#90603b" stroke-width="6"/><g fill="#81b967" stroke="#436f42"><circle cx="31" cy="35" r="20"/><circle cx="54" cy="25" r="22"/><circle cx="71" cy="42" r="17"/></g><g fill="#d9ef9c" stroke="#78964b"><path d="M30 32Q25 42 21 46Q18 57 30 59Q43 58 39 46Q34 42 32 32Z"/><path d="M63 34Q59 43 55 48Q51 60 64 62Q77 60 73 48Q68 43 65 34Z"/></g><path d="M35 20L31 7L43 13L50 2L57 13L69 7L65 20Z" fill="#f8d264"/><text x="50" y="91" text-anchor="middle" fill="#593b23" stroke="none" font-size="12" font-weight="bold">50</text></g></svg>';
   if(id===ORANGE_TROPHY[0])art.innerHTML='<svg viewBox="0 0 100 100" width="100" height="100"><g stroke="#8c622d" stroke-width="2"><path d="M28 77H72L81 94H19Z" fill="#e1ae52"/><circle cx="50" cy="42" r="33" fill="#f7ce65"/><circle cx="50" cy="42" r="27" fill="#fff1b9"/><circle cx="50" cy="44" r="20" fill="#f6a12d" stroke="#c47129"/><ellipse cx="43" cy="36" rx="5" ry="7" fill="#ffda87" stroke="none"/><path d="M50 25Q47 14 56 11" fill="none" stroke="#6d5535" stroke-width="4"/><path d="M52 23Q64 7 77 18Q65 30 52 23Z" fill="#78ac56" stroke="#447943"/><path d="M27 67L20 72M73 67L80 72M50 6V1" stroke="#e1ae52" stroke-width="4"/><text x="50" y="89" text-anchor="middle" fill="#593b23" stroke="none" font-size="12" font-weight="bold">1000</text></g></svg>';
   if(id===BANANA_TROPHY[0])art.innerHTML='<svg viewBox="0 0 100 100" width="100" height="100"><g stroke="#88622a" stroke-width="2"><path d="M28 77H72L81 94H19Z" fill="#d9a849"/><circle cx="50" cy="42" r="33" fill="#f7ce65"/><circle cx="50" cy="42" r="27" fill="#fff1b9"/><path d="M29 24Q23 54 50 64Q72 66 78 37Q65 48 51 46Q36 42 35 24Z" fill="#ffdf45"/><path d="M35 24L32 18L27 20L29 24M78 37L81 32" stroke="#6e7535" stroke-width="4"/><path d="M35 36Q42 58 62 55" fill="none" stroke="#e4a635"/><text x="50" y="89" text-anchor="middle" fill="#593b23" stroke="none" font-size="12" font-weight="bold">1000</text></g></svg>';
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
