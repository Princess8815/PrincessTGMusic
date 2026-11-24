import {auth,db} from "./firebase.js";
import {packDocument} from "./docs-cloud.js";
import {doc,collection,getDocFromServer,getDocsFromServer,runTransaction,serverTimestamp,query,where,limit,startAfter}
 from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
export const validToken=t=>typeof t==="string"&&/^[a-f0-9]{64}$/.test(t);
const validId=t=>typeof t==="string"&&/^[A-Za-z0-9-]{1,100}$/.test(t);
function check(uid){if(!uid||auth.currentUser?.uid!==uid)throw Error("Sign in to manage document sharing.");}
function mapping(uid,id){if(!validId(id))throw Error("Invalid document ID.");return doc(db,"users",uid,"documentShares",id);}
function shared(token){if(!validToken(token))throw Error("Invalid share link.");return doc(db,"sharedDocs",token);}
const part=(root,i)=>doc(collection(root,"chunks"),String(i).padStart(3,"0"));
function count(meta){const n=meta?.chunkCount;if(!Number.isInteger(n)||n<1||n>80)throw Error("Invalid shared document.");return n;}
function tokenNew(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");}
export function shareUrl(token){if(!validToken(token))throw Error("Invalid share link.");const url=new URL("docs-board.html",location.href);url.searchParams.set("share",token);return url.href;}
export async function shareStatus(uid,id){
 check(uid);const snap=await getDocFromServer(mapping(uid,id));check(uid);
 return snap.exists()?snap.data():null;
}
export async function shareSnapshot(uid,value,visibility){
 check(uid);if(!["link","public"].includes(visibility))throw Error("Invalid sharing mode.");
 const packed=packDocument(value),map=mapping(uid,value.id),fresh=tokenNew();
 return runTransaction(db,async tx=>{
  check(uid);const existing=await tx.get(map);const token=existing.exists()?existing.data().token:fresh;
  const root=shared(token),previous=await tx.get(root);
  if(previous.exists()&&previous.data().ownerUid!==uid)throw Error("Share ownership mismatch.");
  const oldCount=previous.exists()?count(previous.data()):0;
  const revision=(previous.exists()?previous.data().revision:0)+1;
  const meta={ownerUid:uid,title:value.title,pageCount:value.pages.length,chunkCount:packed.chunks.length,bytes:packed.bytes,revision,visibility,updatedAt:serverTimestamp()};
  tx.set(root,meta);
  for(let i=0;i<packed.chunks.length;i++)tx.set(part(root,i),{text:packed.chunks[i],revision});
  for(let i=packed.chunks.length;i<oldCount;i++)tx.delete(part(root,i));
  tx.set(map,{token,visibility});return {token,visibility};
 });
}
export async function revokeShare(uid,id){
 check(uid);const map=mapping(uid,id);
 await runTransaction(db,async tx=>{
  check(uid);const m=await tx.get(map);if(!m.exists())return;
  const root=shared(m.data().token),snap=await tx.get(root);
  if(snap.exists()){
   const meta=snap.data();if(meta.ownerUid!==uid)throw Error("Share ownership mismatch.");
   for(let i=0;i<count(meta);i++)tx.delete(part(root,i));
   tx.delete(root);
  }
  tx.delete(map);
 });
}
export async function readShared(token){
 const root=shared(token);
 for(let attempt=0;attempt<3;attempt++){
  const head=await getDocFromServer(root);if(!head.exists())throw Error("This link has been removed or does not exist.");
  const meta=head.data(),n=count(meta),parts=[];
  for(let i=0;i<n;i+=8){
   const batch=await Promise.all(Array.from({length:Math.min(8,n-i)},(_,j)=>getDocFromServer(part(root,i+j))));
   parts.push(...batch.map(s=>s.exists()?s.data():null));
  }
  if(parts.some(p=>!p||p.revision!==meta.revision||typeof p.text!=="string"))continue;
  const value=JSON.parse(parts.map(p=>p.text).join(""));
  return {meta,value};
 }
 throw Error("The shared copy changed during loading. Please retry.");
}
export async function boardPage(cursor=null){
 const constraints=[where("visibility","==","public"),limit(50)];
 if(cursor)constraints.push(startAfter(cursor));
 const snap=await getDocsFromServer(query(collection(db,"sharedDocs"),...constraints));
 return {items:snap.docs.map(d=>({token:d.id,...d.data()})),cursor:snap.docs.length===50?snap.docs.at(-1):null};
}
