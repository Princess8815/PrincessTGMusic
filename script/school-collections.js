import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {collection,onSnapshot} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {SCHOOL_MEDALS,CHESS_DIPLOMA_ID,LEGACY_CHESS_DIPLOMA,diplomaTitle,validDiplomaRank} from "./chess-school-awards.mjs";
const $=id=>document.getElementById(id);
const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
const medalArt=id=>'<svg viewBox="0 0 100 100" width="100" height="100"><path d="M25 8H46L50 38 31 52ZM75 8H54L50 38 69 52Z" fill="#9b7bd1"/><circle cx="50" cy="62" r="29" fill="#f7d986" stroke="#a78035" stroke-width="3"/><circle cx="50" cy="62" r="22" fill="#fff1b8" stroke="#a78035"/><text x="50" y="72" font-size="30" text-anchor="middle" fill="#503d69">'+(id==="chess-school-foundations"?"♞":"♜")+'</text></svg>';
const diplomaArt=rank=>'<svg viewBox="0 0 100 100" width="100" height="100"><rect x="8" y="18" width="84" height="60" rx="5" fill="#fff2ce" stroke="#b48b42" stroke-width="3"/><rect x="14" y="24" width="72" height="48" fill="none" stroke="#b48b42"/><text x="50" y="39" text-anchor="middle" font-size="9" fill="#503d69" font-weight="bold">CHESS SCHOOL</text><path d="M23 47H77M30 54H70M34 61H66" stroke="#9c825b" stroke-width="2"/><path d="M64 70l-5 20 8-3 5 4 3-20" fill="#8863ba"/><circle cx="69" cy="72" r="10" fill="#e4b651" stroke="#a47b32"/><text x="69" y="76" text-anchor="middle" font-size="10">'+(["","A","B","M","PhD"][rank]||"")+'</text></svg>';
if($("medal-grid")&&$("diploma-grid")){
 let stops=[],epoch=0,medals=new Set(),legacy=new Set(),rank=0,loaded=new Set(),errors=new Set();
 function card(name,art,owned,hint){
  const node=el("article","");node.className="reef-card hg-trophy";const picture=el("div","");picture.className="reef-card-art";picture.setAttribute("aria-hidden","true");picture.innerHTML=art;if(!owned)picture.style.opacity=".35";
  node.append(picture,el("h3",name),el("p",hint),el("p",owned?"Earned":"Locked"));return node;
 }
 function render(){
  const owned=id=>medals.has(id)||legacy.has(id);
  $("medal-grid").replaceChildren(...SCHOOL_MEDALS.map(([id,name,hint])=>card(name,medalArt(id),owned(id),hint)));
  const highest=validDiplomaRank(rank)?rank:legacy.has(LEGACY_CHESS_DIPLOMA)?1:0;
  $("diploma-grid").replaceChildren();
  if(highest)$("diploma-grid").append(card(diplomaTitle(highest),diplomaArt(highest),true,"Highest completed chess degree."));
  const status=(type,done)=>!auth.currentUser?"Sign in to view your "+type+".":errors.has(type)?"Could not load "+type+". Check Firestore rules or reload.":!loaded.has(type)||!loaded.has("trophies")&&!errors.has("trophies")?"Loading "+type+"…":done;
  $("medal-status").textContent=status("medals",SCHOOL_MEDALS.filter(m=>owned(m[0])).length+" / "+SCHOOL_MEDALS.length+" medals earned");
  $("diploma-status").textContent=status("diplomas",highest?"1 diploma earned":"No diplomas earned yet. Graduate from Chess School to receive your first.");
 }
 onAuthStateChanged(auth,user=>{
  const current=++epoch;stops.forEach(stop=>stop());stops=[];medals=new Set();legacy=new Set();rank=0;loaded=new Set();errors=new Set();render();if(!user)return;
  for(const type of ["medals","diplomas","trophies"]){
   stops.push(onSnapshot(collection(db,"users",user.uid,type),{includeMetadataChanges:true},snap=>{
    if(current!==epoch||auth.currentUser?.uid!==user.uid||snap.metadata.hasPendingWrites||snap.metadata.fromCache)return;
    if(type==="medals")medals=new Set(snap.docs.map(d=>d.id));
    if(type==="trophies")legacy=new Set(snap.docs.map(d=>d.id));
    if(type==="diplomas")rank=snap.docs.find(d=>d.id===CHESS_DIPLOMA_ID)?.data().rank||0;
    loaded.add(type);errors.delete(type);render();
   },()=>{if(current===epoch){errors.add(type);render();}}));
  }
 });render();
}
