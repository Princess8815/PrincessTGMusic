// Original PrincessTG reef collection. Discoveries are cosmetic, not entitlements.
import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {collection,doc,runTransaction,serverTimestamp,onSnapshot,getDocsFromServer,writeBatch} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const reef=[
 ["marina","Marina","#ffa9c3","#fa76a2","bow"],
 ["luna","Luna","#c3b0ff","#9879e8","star"],
 ["sprout","Sprout","#89dfb7","#55bb9b","leaf"],
 ["sunny","Sunny","#ffc77c","#f39583","crown"],
 ["pearl","Pearl","#93cfff","#74a7e7","shell"],
 ["bubbles","Bubbles","#ffd0e5","#eb75b2","heart"],
 ["pebble","Pebble","#9ce6c8","#ff8b82","scarf"],
 ["nori","Nori","#6860a7","#ffd28b","lantern"]
];
const ids=new Set(reef.map(f=>f[0]));
const prefix="ptg-reef-pending-v1:";
const pathFor=uid=>collection(db,"users",uid,"axolotls");
const pendingKey=id=>prefix+id;
const current=uid=>auth.currentUser?.uid===uid;
const volatile=new Map(),confirmed=new Set();
let queue=Promise.resolve(),retryTimer;
function readPending(id){
 try{const raw=localStorage.getItem(pendingKey(id));if(raw!==null)return JSON.parse(raw);}catch{}
 return volatile.get(id)||null;
}
function writePending(id,record){
 volatile.set(id,record);
 try{localStorage.setItem(pendingKey(id),JSON.stringify(record));}catch{}
}
function removePending(id,uid){
 if(readPending(id)?.uid!==uid)return;
 volatile.delete(id);try{localStorage.removeItem(pendingKey(id));}catch{}
}
function notify(){window.dispatchEvent(new Event("princesstg:reef-change"));}
function bindPending(uid){
 if(!current(uid))return;
 for(const id of ids){
  const p=readPending(id);
  if(p&&p.uid===null)writePending(id,{uid});
 }
}
async function syncPending(uid){
 if(!current(uid))return;
 bindPending(uid);
 let retry=false;
 for(const id of ids){
  if(!current(uid))return;
  if(readPending(id)?.uid!==uid)continue;
  if(confirmed.has(uid+":"+id)){removePending(id,uid);continue;}
  try{
   const ref=doc(pathFor(uid),id);
   await runTransaction(db,async tx=>{
    if(!current(uid))throw Error("Account changed");
    const snap=await tx.get(ref);
    if(!current(uid))throw Error("Account changed");
    if(!snap.exists())tx.set(ref,{foundAt:serverTimestamp()});
   });
   confirmed.add(uid+":"+id);removePending(id,uid);notify();
  }catch(e){retry=true;console.warn("Reef discovery kept for its account:",e.code||e.message);}
 }
 if(retry&&current(uid)){
  clearTimeout(retryTimer);
  retryTimer=setTimeout(()=>void flush(uid),15000);
 }
}
function flush(uid){
 if(!uid||!current(uid))return Promise.resolve();
 // Bind the guest encounter before any network request, including failed writes.
 bindPending(uid);
 queue=queue.catch(()=>{}).then(()=>syncPending(uid));return queue;
}
export function discoverAxolotl(id){
 if(!ids.has(id))return;
 const uid=auth.currentUser?.uid||null;
 if(uid&&confirmed.has(uid+":"+id))return;
 const previous=readPending(id);
 // Never transfer a failed save already assigned to somebody else's account.
 if(!previous||previous.uid===null||previous.uid===uid)writePending(id,{uid});
 else if(uid){
  const ref=doc(pathFor(uid),id);
  void runTransaction(db,async tx=>{
   if(!current(uid))throw Error("Account changed");
   const snap=await tx.get(ref);
   if(!current(uid))throw Error("Account changed");
   if(!snap.exists())tx.set(ref,{foundAt:serverTimestamp()});
  }).then(()=>{confirmed.add(uid+":"+id);notify();}).catch(console.warn);
 }
 void auth.authStateReady().then(()=>flush(auth.currentUser?.uid));
}
onAuthStateChanged(auth,user=>{
 clearTimeout(retryTimer);
 if(user)void flush(user.uid);
});
window.addEventListener("online",()=>void flush(auth.currentUser?.uid));
window.addEventListener("storage",e=>{if(e.key?.startsWith(prefix))void flush(auth.currentUser?.uid);});

function portrait(id){
 const f=reef.find(x=>x[0]===id);
 if(!f)return "";
 const [,name,body,gill,decor]=f;
 if(id==="nori")return '<svg viewBox="0 0 220 166" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Nori, a sleepy indigo axolotl with amber gills and a glowing lantern"><g stroke="#292747" stroke-width="3" stroke-linejoin="round"><path d="M138 119Q204 127 202 73Q220 112 194 142Q171 160 138 141Z" fill="#8981ce"/><ellipse cx="114" cy="120" rx="48" ry="34" fill="#6860a7"/><ellipse cx="115" cy="129" rx="26" ry="20" fill="#aaa5e3"/><path d="M77 125q-23 0-29 15q10 11 29-2M143 126q23-4 29 9q-6 13-29 4" fill="#6860a7"/><g fill="#ffd28b"><path d="M63 67Q28 39 40 17Q59 27 76 58L67 79Q19 76 17 55Q32 45 63 67Z"/><path d="M154 67Q187 39 177 17Q157 27 143 58L152 79Q200 76 203 55Q188 45 154 67Z"/><path d="M65 82Q24 87 28 108Q50 117 74 92M153 82Q195 87 191 108Q169 117 145 92"/></g><rect x="59" y="42" width="102" height="69" rx="35" fill="#6860a7"/></g><g fill="#fff2b9"><circle cx="83" cy="56" r="3"/><circle cx="92" cy="51" r="2"/><circle cx="135" cy="57" r="3"/></g><g stroke="#27233c" stroke-width="3.5" fill="none" stroke-linecap="round"><path d="M77 80q8 7 16 0M127 80q8 7 16 0M103 91q7 6 14 0"/></g><g fill="#ce8db6" opacity=".8"><ellipse cx="73" cy="91" rx="9" ry="5"/><ellipse cx="147" cy="91" rx="9" ry="5"/></g><path d="M91 112Q110 128 132 112" stroke="#f2bb65" stroke-width="3" fill="none"/><g transform="translate(110 132)" stroke="#67472e" stroke-width="2"><rect x="-10" y="-12" width="20" height="23" rx="5" fill="#fff1a7"/><path d="M-12-12h24l-4-5H-8zM-11 11h22" fill="#e6a74e"/></g><circle cx="110" cy="133" r="20" fill="#ffdb70" opacity=".17"/></svg>';
 const accessory={bow:'<path d="M95 31l-25-15v25zm0 0 25-15v25z" fill="#b56ed7"/>',star:'<path d="m110 15 5 12 14 1-11 9 4 13-12-7-12 7 4-13-11-9 14-1z" fill="#ffdf70"/>',leaf:'<path d="M110 39Q81 9 130 9Q137 31 110 39" fill="#64bb6c"/>',crown:'<path d="m84 37-4-25 17 13 13-20 13 20 17-13-4 25z" fill="#ffd56f"/>',shell:'<path d="M89 39Q78 10 110 10Q142 10 131 39Z" fill="#ead7ff"/>',heart:'<path d="M110 40Q83 20 100 15Q110 12 110 22Q110 12 120 15Q137 20 110 40" fill="#efc358"/>',scarf:'<path d="M72 105q38 22 76 0l-6 15-10 18-12-18q-23 8-48-5z" fill="#f0a66b"/>'}[decor]||"";
 return '<svg viewBox="0 0 220 166" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+name+'"><g stroke="#40536a" stroke-width="3" stroke-linejoin="round"><path d="M140 118Q194 106 203 144Q176 145 151 138Z" fill="'+gill+'"/><ellipse cx="110" cy="119" rx="45" ry="34" fill="'+body+'"/><ellipse cx="110" cy="130" rx="24" ry="18" fill="#fff" opacity=".45"/><g fill="'+gill+'"><path d="M62 65Q25 18 41 16Q60 17 78 57L63 75Q18 62 14 83Q30 105 67 92Z"/><path d="M158 65Q195 18 179 16Q160 17 142 57L157 75Q202 62 206 83Q190 105 153 92Z"/></g><ellipse cx="110" cy="76" rx="57" ry="41" fill="'+body+'"/><path d="M69 122q-26 3-20 17q12 8 27-5M151 122q26 3 20 17q-12 8-27-5" fill="'+body+'"/></g><g fill="#283447"><circle cx="87" cy="77" r="5"/><circle cx="133" cy="77" r="5"/></g><path d="M103 90q7 8 14 0" stroke="#704e70" fill="none" stroke-width="3" stroke-linecap="round"/><g fill="#e480a0" opacity=".6"><ellipse cx="72" cy="90" rx="9" ry="5"/><ellipse cx="148" cy="90" rx="9" ry="5"/></g>'+accessory+'</svg>';
}
export async function showGuestReef(){
 await auth.authStateReady();
 if(auth.currentUser)return false;
 discoverAxolotl("nori");
 let modal=document.getElementById("reef-guest-dialog");
 if(!modal){
  modal=document.createElement("dialog");modal.id="reef-guest-dialog";modal.setAttribute("aria-labelledby","reef-guest-title");
  modal.innerHTML='<div class="reef-guest-art">'+portrait("nori")+'</div><p class="reef-guest-name">Nori · Reef gatekeeper</p><h2 id="reef-guest-title">Sorry, these waters require users!</h2><p>Why not log in or register here? I found a little spot in your future collection, too.</p><div class="reef-actions"><button type="button" data-reef-login>Log in</button><button type="button" data-reef-register>Register</button><button type="button" data-reef-close>Maybe later</button></div>';
  document.body.append(modal);
  modal.querySelector("[data-reef-close]").onclick=()=>modal.close();
  function open(mode){
   modal.close();
   const button=document.getElementById("auth-open");
   if(button&&!button.hidden){
    button.click();if(mode==="register")document.getElementById("auth-register-tab")?.click();
   }else{
    const url=new URL("../pages/profile.html",import.meta.url);url.searchParams.set("reefSignIn",mode);url.hash="tab-collections";location.assign(url.href);
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
 let stop=null,token=0;
 function render(found,notice){
  status.textContent=notice||found.size+" / "+reef.length+" axolotls discovered";
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
  stop=onSnapshot(pathFor(user.uid),snap=>{
   if(epoch!==token||!current(user.uid))return;
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
