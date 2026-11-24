// Original PrincessTG reef collection. Discoveries are cosmetic, not entitlements.
import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {collection,doc,runTransaction,serverTimestamp,onSnapshot,getDocsFromServer,writeBatch,getDocFromServer} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

import {HOME_REEF,homeReefPortrait} from "./reef-home-art.js";

const reef=[
 ...HOME_REEF,
 ["marina","Marina","#ffa9c3","#fa76a2","bow"],
 ["luna","Luna","#c3b0ff","#9879e8","star"],
 ["sprout","Sprout","#89dfb7","#55bb9b","leaf"],
 ["sunny","Sunny","#ffc77c","#f39583","crown"],
 ["pearl","Pearl","#93cfff","#74a7e7","shell"],
 ["bubbles","Bubbles","#ffd0e5","#eb75b2","heart"],
 ["pebble","Pebble","#9ce6c8","#ff8b82","scarf"],
 ["nori","Nori","#6860a7","#ffd28b","lantern"],
 ["shelly","Shelly","#f4b77f","#d86e79","shell"],
 ["tide","Tide","#f9a8d4","#c4b5fd","star"]
];
const ids=new Set(reef.map(f=>f[0]));
const purchaseOnly=new Set(["tide"]);
const encounterIds=[...ids].filter(id=>!purchaseOnly.has(id));
const prefix="ptg-reef-pending-v1:";
const pathFor=uid=>collection(db,"users",uid,"axolotls");
const pendingKey=(id,uid=null)=>prefix+id+(uid?":"+uid:"");
const current=uid=>auth.currentUser?.uid===uid;
const volatile=new Set(),confirmed=new Set();
let queue=Promise.resolve(),retryTimer,attempts=0;
const claimErrors=new Map();
const pendingFor=uid=>encounterIds.filter(id=>hasPending(id,uid));
function hasPending(id,uid=null){
 const key=pendingKey(id,uid);
 try{return localStorage.getItem(key)!==null||volatile.has(key);}catch{return volatile.has(key);}
}
function writePending(id,uid=null){
 const key=pendingKey(id,uid);
 try{localStorage.setItem(key,"1");volatile.delete(key);}catch{volatile.add(key);}
}
function removePending(id,uid=null){
 const key=pendingKey(id,uid);
 volatile.delete(key);try{localStorage.removeItem(key);}catch{}
}
function notify(){window.dispatchEvent(new Event("princesstg:reef-change"));}
function bindPending(uid){
 if(!current(uid))return;
 for(const id of encounterIds){
  if(hasPending(id)){
   writePending(id,uid);removePending(id);
  }
 }
}
async function syncPending(uid){
 if(!current(uid))return;
 bindPending(uid);
 if(!pendingFor(uid).length)return;
 let retry=false;
 // Auth can finish before the user-data module creates the member document.
 // The rules require that document before any new collection item can be saved.
 try{
  const account=await getDocFromServer(doc(db,"users",uid));
  if(!current(uid))return;
  if(!account.exists())throw Error("Your account record is still initializing.");
 }catch(e){
  if(current(uid)){claimErrors.set(uid,e.message);notify();scheduleRetry(uid);}
  return;
 }
 for(const id of encounterIds){
  if(!current(uid))return;
  if(!hasPending(id,uid))continue;
  if(confirmed.has(uid+":"+id)){removePending(id,uid);continue;}
  try{
   const ref=doc(pathFor(uid),id);
   const newlyClaimed=await runTransaction(db,async tx=>{
    if(!current(uid))throw Error("Account changed");
    const snap=await tx.get(ref);
    if(!current(uid))throw Error("Account changed");
    if(snap.exists())return false;
    tx.set(ref,{foundAt:serverTimestamp()});
    return true;
   });
   confirmed.add(uid+":"+id);removePending(id,uid);claimErrors.delete(uid);notify();
   // The transaction result describes the committed attempt, not an optimistic write.
   if(newlyClaimed&&current(uid))announceDiscovery(uid,id);
  }catch(e){
   retry=true;claimErrors.set(uid,e.code==="permission-denied"?"Firestore denied the discovery. Check that the updated collection rules are published.":e.message);
   notify();console.warn("Reef discovery kept for its account:",e.code||e.message);
  }
 }
 if(retry)scheduleRetry(uid);
 else if(current(uid)){claimErrors.delete(uid);notify();}
}
function scheduleRetry(uid){
 if(!current(uid)||attempts++>=5)return;
 clearTimeout(retryTimer);retryTimer=setTimeout(()=>void flush(uid),5000);
}
function flush(uid){
 if(!uid||!current(uid))return Promise.resolve();
 // Claim guest discoveries before network access. Failed saves remain tied to this UID.
 bindPending(uid);
 queue=queue.catch(()=>{}).then(()=>syncPending(uid));return queue;
}
// Explicitly called after successful sign-in/register and once the account record is ready.
export function claimPendingAxolotls(user=auth.currentUser){
 const uid=user?.uid;
 if(!uid||!current(uid))return Promise.resolve();
 clearTimeout(retryTimer);attempts=0;
 return flush(uid);
}
window.addEventListener("princesstg-user-ready",e=>{
 if(e.detail?.uid===auth.currentUser?.uid)void claimPendingAxolotls();
});
export function discoverAxolotl(id){
 if(!ids.has(id)||purchaseOnly.has(id))return;
 const uid=auth.currentUser?.uid||null;
 if(uid&&confirmed.has(uid+":"+id))return;
 writePending(id,uid);
 void auth.authStateReady().then(()=>flush(auth.currentUser?.uid));
}
onAuthStateChanged(auth,user=>{
 clearTimeout(retryTimer);attempts=0;
 if(user)void flush(user.uid);
});
window.addEventListener("online",()=>{attempts=0;void flush(auth.currentUser?.uid);});
window.addEventListener("storage",e=>{if(e.key?.startsWith(prefix))void flush(auth.currentUser?.uid);});
// Announce only confirmed first discoveries. Wait for native dialogs to close
// so the notice is visible and does not interrupt an external-link decision.
const discoveries=[];
let discoveryTimer=null,discoveryExpiry=null,visibleDiscoveryUid=null;
function announceDiscovery(uid,id){
 if(!current(uid)||!ids.has(id))return;
 discoveries.push({uid,id});
 showNextDiscovery();
}
function clearDiscoveryNotice(){
 clearTimeout(discoveryExpiry);discoveryExpiry=null;visibleDiscoveryUid=null;
 document.getElementById("reef-discovery-toast")?.remove();
}
function showNextDiscovery(){
 if(discoveryTimer!==null||visibleDiscoveryUid!==null)return;
 while(discoveries.length&&!current(discoveries[0].uid))discoveries.shift();
 if(!discoveries.length)return;
 if(!document.body||document.querySelector("dialog[open]")){
  discoveryTimer=setTimeout(()=>{discoveryTimer=null;showNextDiscovery();},250);
  return;
 }
 const {uid,id}=discoveries.shift();
 const friend=reef.find(f=>f[0]===id);
 if(!friend)return showNextDiscovery();
 installStyles();
 const toast=document.createElement("div");
 toast.id="reef-discovery-toast";toast.className="reef-discovery-toast";
 const art=document.createElement("div");art.className="reef-discovery-art";
 art.setAttribute("aria-hidden","true");art.innerHTML=portrait(id);
 const message=document.createElement("div");message.setAttribute("role","status");message.setAttribute("aria-live","polite");message.setAttribute("aria-atomic","true");
 const dismiss=document.createElement("button");dismiss.type="button";dismiss.textContent="×";dismiss.setAttribute("aria-label","Dismiss discovery notice");
 dismiss.onclick=()=>{clearDiscoveryNotice();showNextDiscovery();};
 toast.append(art,message,dismiss);document.body.append(toast);visibleDiscoveryUid=uid;
 const title=document.createElement("strong");title.textContent=friend[1]+" was discovered!";
 const detail=document.createElement("span");detail.textContent="Added to your axolotl collection.";
 message.append(title,detail);
 discoveryExpiry=setTimeout(()=>{clearDiscoveryNotice();showNextDiscovery();},6000);
}
onAuthStateChanged(auth,user=>{
 for(let i=discoveries.length-1;i>=0;i--)if(discoveries[i].uid!==user?.uid)discoveries.splice(i,1);
 if(visibleDiscoveryUid!==null&&visibleDiscoveryUid!==user?.uid){clearDiscoveryNotice();showNextDiscovery();}
});

function installStyles(){
 if(document.querySelector("link[data-reef-style]"))return;
 const link=document.createElement("link");link.rel="stylesheet";link.href=new URL("../styles/reef-collection.css",import.meta.url).href;link.dataset.reefStyle="1";document.head.append(link);
}

export function announcePurchaseDiscovery(id){
 if(!purchaseOnly.has(id)||!auth.currentUser)return;
 const uid=auth.currentUser.uid;
 // Verify the server-created record before showing a discovery notice.
 void getDocFromServer(doc(pathFor(uid),id)).then(snap=>{if(current(uid)&&snap.exists())announceDiscovery(uid,id);}).catch(()=>{});
}
export function axolotlPortrait(id){return portrait(id);}
let tidePortraitSerial=0;
function portrait(id){
 const secret=homeReefPortrait(id);if(secret)return secret;
 const f=reef.find(x=>x[0]===id);
 if(!f)return "";
 const [,name,body,gill,decor]=f;
 if(id==="shelly")return '<svg viewBox="0 0 220 166" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Shelly, peach axolotl with a coral shell-shaped backpack"><g stroke="#784b59" stroke-width="3" stroke-linejoin="round"><path d="M145 117q53 1 55-47 18 61-52 78" fill="#efaa82"/><ellipse cx="116" cy="116" rx="50" ry="34" fill="#f4b77f"/><path d="M145 90q40-23 55 18l-18 27-32-4z" fill="#d86e79"/><path d="M156 101l23 29m-12-36 19 29m-5-26 10 19" stroke="#ffc2ae" fill="none"/><g fill="#d86e79"><path d="M65 65Q25 35 38 18Q62 26 76 55L65 78Q13 52 15 82Q38 105 70 90Z"/><path d="M151 65Q190 35 177 18Q153 26 140 55L151 78Q203 52 201 82Q178 105 146 90Z"/></g><ellipse cx="108" cy="79" rx="57" ry="43" fill="#f4b77f"/><path d="M81 118q-34 10-23 24 18 4 30-10M139 118q30 5 29 18-16 8-32-6" fill="#f4b77f"/></g><g fill="#5b3c4a"><circle cx="84" cy="76" r="7"/><circle cx="132" cy="76" r="7"/></g><g fill="#fff"><circle cx="82" cy="73" r="2.4"/><circle cx="130" cy="73" r="2.4"/></g><path d="M99 91q9 11 18 0" fill="none" stroke="#784b59" stroke-width="3"/><g fill="#e88a83"><ellipse cx="70" cy="91" rx="9" ry="5"/><ellipse cx="146" cy="91" rx="9" ry="5"/></g><g transform="translate(110 126)"><rect x="-23" y="-12" width="46" height="28" rx="4" fill="#f2e2bd" stroke="#a37869" stroke-width="2"/><circle cy="2" r="9" fill="#b1d8e4" stroke="#8f79af" stroke-width="2"/><circle cy="2" r="3" fill="#f8f5df"/></g></svg>';
 if(id==="tide"){
  const serial=++tidePortraitSerial,bodyId="ptg-tide-body-"+serial,gillId="ptg-tide-gills-"+serial;
  return `<svg viewBox="0 0 220 166" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tide, rainbow axolotl with multicolored gills, a sailor hat and a starfish badge"><defs><linearGradient id="${bodyId}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ff817f"/><stop offset="20%" stop-color="#ffd487"/><stop offset="40%" stop-color="#fff18a"/><stop offset="60%" stop-color="#85dfb2"/><stop offset="80%" stop-color="#80c4ff"/><stop offset="100%" stop-color="#c798ff"/></linearGradient><linearGradient id="${gillId}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#ff6b9d"/><stop offset="28%" stop-color="#ffca69"/><stop offset="50%" stop-color="#f9f287"/><stop offset="70%" stop-color="#69dcca"/><stop offset="100%" stop-color="#a98afa"/></linearGradient></defs><g stroke="#294b64" stroke-width="3" stroke-linejoin="round"><path d="M144 120Q190 111 202 63Q220 118 182 143L142 144Z" fill="url(#${gillId})"/><ellipse cx="109" cy="117" rx="45" ry="34" fill="url(#${bodyId})"/><ellipse cx="109" cy="128" rx="25" ry="19" fill="#fff4c9"/><g fill="url(#${gillId})"><path d="M61 72Q19 34 36 18Q60 17 78 60L62 86Q9 65 17 94Q40 109 72 96Z"/><path d="M158 72Q200 34 183 18Q159 17 141 60L157 86Q210 65 202 94Q179 109 147 96Z"/></g><ellipse cx="110" cy="78" rx="57" ry="42" fill="url(#${bodyId})"/><path d="M73 118q-30 4-24 20 16 7 29-7M147 118q30 4 24 20-16 7-29-7" fill="url(#${bodyId})"/></g><g fill="#122e46"><circle cx="86" cy="77" r="7"/><circle cx="134" cy="77" r="7"/></g><g fill="#fff"><circle cx="84" cy="74" r="2.5"/><circle cx="132" cy="74" r="2.5"/></g><path d="M102 92q8 9 16 0" fill="none" stroke="#153b55" stroke-width="3"/><path d="M53 49Q110 4 167 49L154 59Q110 29 66 59Z" fill="#e6f4f1" stroke="#294b64" stroke-width="3"/><path d="m110 37 5 12 13 1-10 8 3 13-11-7-11 7 3-13-10-8 13-1Z" fill="#f6d47b" stroke="#a98550" stroke-width="2"/><path d="M107 114l12 5-1 12q-4 7-11 10-8-3-12-10l-1-12z" fill="#a5dce3" stroke="#294b64" stroke-width="2"/><path d="m101 127 4 4 8-9" fill="none" stroke="#286c82" stroke-width="3"/></svg>`;
 }
 if(id==="nori")return '<svg viewBox="0 0 220 166" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Nori, a sleepy indigo axolotl with amber gills and a glowing lantern"><g stroke="#292747" stroke-width="3" stroke-linejoin="round"><path d="M138 119Q204 127 202 73Q220 112 194 142Q171 160 138 141Z" fill="#8981ce"/><ellipse cx="114" cy="120" rx="48" ry="34" fill="#6860a7"/><ellipse cx="115" cy="129" rx="26" ry="20" fill="#aaa5e3"/><path d="M77 125q-23 0-29 15q10 11 29-2M143 126q23-4 29 9q-6 13-29 4" fill="#6860a7"/><g fill="#ffd28b"><path d="M63 67Q28 39 40 17Q59 27 76 58L67 79Q19 76 17 55Q32 45 63 67Z"/><path d="M154 67Q187 39 177 17Q157 27 143 58L152 79Q200 76 203 55Q188 45 154 67Z"/><path d="M65 82Q24 87 28 108Q50 117 74 92M153 82Q195 87 191 108Q169 117 145 92"/></g><rect x="59" y="42" width="102" height="69" rx="35" fill="#6860a7"/></g><g fill="#fff2b9"><circle cx="83" cy="56" r="3"/><circle cx="92" cy="51" r="2"/><circle cx="135" cy="57" r="3"/></g><g stroke="#27233c" stroke-width="3.5" fill="none" stroke-linecap="round"><path d="M77 80q8 7 16 0M127 80q8 7 16 0M103 91q7 6 14 0"/></g><g fill="#ce8db6" opacity=".8"><ellipse cx="73" cy="91" rx="9" ry="5"/><ellipse cx="147" cy="91" rx="9" ry="5"/></g><path d="M91 112Q110 128 132 112" stroke="#f2bb65" stroke-width="3" fill="none"/><g transform="translate(110 132)" stroke="#67472e" stroke-width="2"><rect x="-10" y="-12" width="20" height="23" rx="5" fill="#fff1a7"/><path d="M-12-12h24l-4-5H-8zM-11 11h22" fill="#e6a74e"/></g><circle cx="110" cy="133" r="20" fill="#ffdb70" opacity=".17"/></svg>';
 const accessory={bow:'<path d="M95 31l-25-15v25zm0 0 25-15v25z" fill="#b56ed7"/>',star:'<path d="m110 15 5 12 14 1-11 9 4 13-12-7-12 7 4-13-11-9 14-1z" fill="#ffdf70"/>',leaf:'<path d="M110 39Q81 9 130 9Q137 31 110 39" fill="#64bb6c"/>',crown:'<path d="m84 37-4-25 17 13 13-20 13 20 17-13-4 25z" fill="#ffd56f"/>',shell:'<path d="M89 39Q78 10 110 10Q142 10 131 39Z" fill="#ead7ff"/>',heart:'<path d="M110 40Q83 20 100 15Q110 12 110 22Q110 12 120 15Q137 20 110 40" fill="#efc358"/>',scarf:'<path d="M72 105q38 22 76 0l-6 15-10 18-12-18q-23 8-48-5z" fill="#f0a66b"/>'}[decor]||"";
 return '<svg viewBox="0 0 220 166" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+name+'"><g stroke="#40536a" stroke-width="3" stroke-linejoin="round"><path d="M140 118Q194 106 203 144Q176 145 151 138Z" fill="'+gill+'"/><ellipse cx="110" cy="119" rx="45" ry="34" fill="'+body+'"/><ellipse cx="110" cy="130" rx="24" ry="18" fill="#fff" opacity=".45"/><g fill="'+gill+'"><path d="M62 65Q25 18 41 16Q60 17 78 57L63 75Q18 62 14 83Q30 105 67 92Z"/><path d="M158 65Q195 18 179 16Q160 17 142 57L157 75Q202 62 206 83Q190 105 153 92Z"/></g><ellipse cx="110" cy="76" rx="57" ry="41" fill="'+body+'"/><path d="M69 122q-26 3-20 17q12 8 27-5M151 122q26 3 20 17q-12 8-27-5" fill="'+body+'"/></g><g fill="#283447"><circle cx="87" cy="77" r="5"/><circle cx="133" cy="77" r="5"/></g><path d="M103 90q7 8 14 0" stroke="#704e70" fill="none" stroke-width="3" stroke-linecap="round"/><g fill="#e480a0" opacity=".6"><ellipse cx="72" cy="90" rx="9" ry="5"/><ellipse cx="148" cy="90" rx="9" ry="5"/></g>'+accessory+'</svg>';
}
export async function showGuestReef(){
 await auth.authStateReady();
 if(auth.currentUser)return false;
 installStyles();
 discoverAxolotl("nori");
 let modal=document.getElementById("reef-guest-dialog");
 if(!modal){
  modal=document.createElement("dialog");modal.id="reef-guest-dialog";modal.setAttribute("aria-labelledby","reef-guest-title");
  modal.innerHTML='<div class="reef-guest-art">'+portrait("nori")+'</div><p class="reef-guest-name">Nori · Reef gatekeeper</p><h2 id="reef-guest-title">Sorry, these waters require users!</h2><p>Why not log in or register here? I found a little spot in your future collection, too.</p><div class="reef-actions"><button type="button" data-reef-login>Log in</button><button type="button" data-reef-register>Register</button><button type="button" data-reef-close>Maybe later</button></div>';
  document.body.append(modal);
  modal.querySelector("[data-reef-close]").onclick=()=>modal.close();
  function open(mode){
   // Persist the encounter again at the actual sign-in handoff, not just when shown.
   writePending("nori");
   modal.close();
   const button=document.getElementById("auth-open");
   if(button&&!button.hidden){
    button.click();if(mode==="register")document.getElementById("auth-register-tab")?.click();
   }else{
    const url=new URL("../pages/profile.html",import.meta.url);url.searchParams.set("reefSignIn",mode);url.searchParams.set("reefEncounter","nori");url.hash="tab-collections";location.assign(url.href);
   }
  }
  modal.querySelector("[data-reef-login]").onclick=()=>open("login");
  modal.querySelector("[data-reef-register]").onclick=()=>open("register");
 }
 if(!modal.open)modal.showModal();
 return true;
}
export function mountReefCollection(){
 const grid=document.getElementById("reef-collection-grid");
 const status=document.getElementById("reef-collection-status");
 if(!grid||!status)return;
 installStyles();
 let stop=null,token=0,lastFound=new Set(),loadNotice="";
 const retry=document.createElement("button");retry.type="button";retry.textContent="Retry saving discoveries";retry.hidden=true;status.after(retry);
 retry.onclick=()=>void claimPendingAxolotls();
 function refreshStatus(){
  const uid=auth.currentUser?.uid;
  const pending=uid?pendingFor(uid).length:0;
  const error=uid?claimErrors.get(uid):"";
  status.textContent=(loadNotice||lastFound.size+" / "+reef.length+" axolotls discovered")+
   (pending?" · "+pending+" pending"+(error?" — "+error:"; saving…"):"");
  retry.hidden=!uid||!pending;
 }
 window.addEventListener("princesstg:reef-change",refreshStatus);
 function render(found,notice){
  lastFound=found;loadNotice=notice||"";refreshStatus();
  grid.replaceChildren();
  for(const [id,name] of reef){
   const card=document.createElement("article");card.className="reef-card";
   const art=document.createElement("div");art.className="reef-card-art";
   if(found.has(id))art.innerHTML=portrait(id);
   else{art.classList.add("reef-mystery");art.textContent="?";}
   const heading=document.createElement("h3");heading.textContent=found.has(id)?name:"???";
   const caption=document.createElement("p");caption.textContent=found.has(id)?"Discovered":"Not yet discovered";
   card.append(art,heading,caption);grid.append(card);
  }
 }
 render(new Set(),"Loading your collection…");
 onAuthStateChanged(auth,user=>{
  const epoch=++token;stop?.();stop=null;
  render(new Set(),user?"Loading your collection…":"Sign in to view your collection.");
  if(!user)return;
  stop=onSnapshot(pathFor(user.uid),{includeMetadataChanges:true},snap=>{
   if(epoch!==token||!current(user.uid)||snap.metadata.hasPendingWrites||snap.metadata.fromCache)return;
   const found=new Set(snap.docs.map(s=>s.id).filter(id=>ids.has(id)));
   for(const id of found)confirmed.add(user.uid+":"+id);
   render(found);
  },e=>{if(epoch===token)render(new Set(),"Collection unavailable: "+e.message);});
 });
}
export async function deleteReefCollection(uid){
 if(!current(uid))throw Error("Account changed");
 const snap=await getDocsFromServer(pathFor(uid));
 if(!current(uid))throw Error("Account changed");
 if(!snap.empty){const batch=writeBatch(db);for(const item of snap.docs)batch.delete(item.ref);await batch.commit();}
 for(const id of ids){removePending(id,uid);confirmed.delete(uid+":"+id);}
}
