import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {collection,doc,onSnapshot} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {SCHOOL_MEDALS,CHESS_DIPLOMA_ID,LEGACY_CHESS_DIPLOMA,diplomaTitle,validDiplomaRank} from "./chess-school-awards.mjs";
const $=id=>document.getElementById(id);
const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
const medalArt=id=>'<svg viewBox="0 0 100 100" width="100" height="100"><path d="M25 8H46L50 38 31 52ZM75 8H54L50 38 69 52Z" fill="#9b7bd1"/><circle cx="50" cy="62" r="29" fill="#f7d986" stroke="#a78035" stroke-width="3"/><circle cx="50" cy="62" r="22" fill="#fff1b8" stroke="#a78035"/><text x="50" y="72" font-size="30" text-anchor="middle" fill="#503d69">'+(id==="chess-school-foundations"?"♞":"♜")+'</text></svg>';
// The diploma itself is the collectible, including its title and status.
const xmlText=value=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[ch]));
export function diplomaArt(rank,earned,displayName=""){
 const recipient=earned?(String(displayName||"").trim()||"Player"):"";
 const name=xmlText(recipient);
 const nameLength=Array.from(recipient).length;
 const nameFit=nameLength>25?' textLength="250" lengthAdjust="spacingAndGlyphs"':"";
 const degree=["","Associate’s","Bachelor’s","Master’s","PhD"][rank]||"Associate’s";
 const seal=["","A","B","M","PhD"][rank]||"A";
 return `<svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${degree} in Chess Diploma, Chess School, ${earned?"earned by "+name:"locked"}">
 <rect x="1.5" y="1.5" width="317" height="217" rx="5" fill="#fff4d9" stroke="#9e793d" stroke-width="3"/>
 <rect x="8" y="8" width="304" height="204" rx="3" fill="none" stroke="#a78040" stroke-width="1.5"/>
 <rect x="12" y="12" width="296" height="196" fill="none" stroke="#c5a565" stroke-width=".7"/>
 <g fill="none" stroke="#b28b46" stroke-width="1.3"><path d="M17 42V17H42M278 17H303V42M17 178V203H42M278 203H303V178"/><path d="M22 28q0-6 6-6h8M284 22h8q6 0 6 6M22 192q0 6 6 6h8M284 198h8q6 0 6-6"/></g>
 <g text-anchor="middle" font-family="Georgia,serif" fill="#513c64">
 <text x="160" y="30" font-size="10" letter-spacing="1.5">PRINCESSTG CREATIONS</text>
 <text x="160" y="49" font-size="18" font-weight="bold">Chess School</text>
 <path d="M62 57H258" stroke="#b28b46" stroke-width="1"/>
 <text x="160" y="70" font-size="10" fill="#705a3c">${earned?"Proudly presented to":"Diploma not yet awarded"}</text>
 ${earned?`<text x="160" y="91" font-size="20" font-style="italic" font-weight="bold"${nameFit}>${name}</text>`:'<path d="M75 91H245" stroke="#b28b46" stroke-width="1"/>'}
 <text x="160" y="117" font-size="23" font-weight="bold">${degree}</text>
 <text x="160" y="135" font-size="15" font-style="italic">in Chess</text>
 <text x="160" y="148" font-size="8" letter-spacing="2" fill="#705a3c">DIPLOMA</text>
 </g>
 <g font-family="Georgia,serif" text-anchor="middle" fill="#654d38">
 ${rank===1?'<text x="88" y="161" font-size="13" font-style="italic">Professor Squiggles</text><path d="M29 166H147" stroke="#9e793d"/><text x="88" y="177" font-size="9">Associate’s Instructor</text>':rank===2?'<text x="88" y="161" font-size="12" font-style="italic">Professor Wiggleworts</text><path d="M29 166H147" stroke="#9e793d"/><text x="88" y="177" font-size="9">Bachelor’s Instructor</text>':'<text x="88" y="161" font-size="12">Chess School</text><path d="M29 166H147" stroke="#9e793d"/><text x="88" y="177" font-size="9">Degree program</text>'}
 <path d="M237 166l-7 33 12-6 9 8 8-35" fill="#8863ba"/>
 <circle cx="248" cy="158" r="23" fill="#e4b651" stroke="#99712b" stroke-width="2"/><circle cx="248" cy="158" r="18" fill="none" stroke="#fff0ac"/>
 <text x="248" y="163" font-size="14" font-weight="bold" fill="#513c64">${seal}</text>
 <text x="160" y="194" font-size="10" font-weight="bold" letter-spacing="1.4" fill="#513c64">${earned?"EARNED":"LOCKED"}</text>
 </g></svg>`;
}

if($("medal-grid")&&$("diploma-grid")){
 let stops=[],epoch=0,medals=new Set(),legacy=new Set(),rank=0,displayName="",loaded=new Set(),errors=new Set();
 function card(name,art,owned,hint){
  const node=el("article","");node.className="reef-card hg-trophy";const picture=el("div","");picture.className="reef-card-art";picture.setAttribute("aria-hidden","true");picture.innerHTML=art;if(!owned)picture.style.opacity=".35";
  node.append(picture,el("h3",name),el("p",hint),el("p",owned?"Earned":"Locked"));return node;
 }
 function render(){
  const owned=id=>medals.has(id)||legacy.has(id);
  $("medal-grid").replaceChildren(...SCHOOL_MEDALS.map(([id,name,hint])=>card(name,medalArt(id),owned(id),hint)));
  const highest=validDiplomaRank(rank)?rank:legacy.has(LEGACY_CHESS_DIPLOMA)?1:0;
  const diploma=el("article","");
  diploma.className="school-diploma"+(highest?"":" school-diploma-locked");
  diploma.setAttribute("aria-label",diplomaTitle(highest||1)+" · Chess School · "+(highest?"Earned":"Locked"));
  diploma.innerHTML=diplomaArt(highest||1,!!highest,displayName||auth.currentUser?.displayName);
  $("diploma-grid").replaceChildren(diploma);
  const status=(type,done)=>!auth.currentUser?"Sign in to view your "+type+".":errors.has(type)?"Could not load "+type+". Check Firestore rules or reload.":!loaded.has(type)||!loaded.has("trophies")&&!errors.has("trophies")?"Loading "+type+"…":done;
  $("medal-status").textContent=status("medals",SCHOOL_MEDALS.filter(m=>owned(m[0])).length+" / "+SCHOOL_MEDALS.length+" medals earned");
  $("diploma-status").textContent=status("diplomas",highest?"1 diploma earned":"0 / 1 diplomas earned");
 }
 onAuthStateChanged(auth,user=>{
  const current=++epoch;stops.forEach(stop=>stop());stops=[];medals=new Set();legacy=new Set();rank=0;displayName=user?.displayName||"";loaded=new Set();errors=new Set();render();if(!user)return;
  stops.push(onSnapshot(doc(db,"users",user.uid),snap=>{
   if(current!==epoch||auth.currentUser?.uid!==user.uid||snap.metadata.hasPendingWrites)return;
   displayName=auth.currentUser?.displayName||snap.data()?.auth?.displayName||"";render();
  },()=>{}));
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
