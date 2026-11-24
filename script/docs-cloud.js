import {auth,db} from "./firebase.js";
import {collection,doc,getDocsFromServer,getDocFromServer,runTransaction,serverTimestamp}
  from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

// A Firestore document has a 1 MiB limit. Split the complete document
// (including formatting and images) into bounded chunks, committed atomically.
export const MAX_BYTES=4*1024*1024;
const CHUNK_SIZE=100000;
const MAX_CHUNKS=80;
export function packDocument(value){
  const json=JSON.stringify(value);
  const bytes=new TextEncoder().encode(json).length;
  if(bytes>MAX_BYTES)throw Error("Cloud document exceeds 4 MiB. Resize pictures or split the document; your local backup is unchanged.");
  const chunks=[];
  for(let start=0;start<json.length;){
    let end=Math.min(start+CHUNK_SIZE,json.length);
    if(end<json.length&&/[\uD800-\uDBFF]/.test(json[end-1]))end--;
    chunks.push(json.slice(start,end));start=end;
  }
  if(chunks.length>MAX_CHUNKS)throw Error("Too many document chunks.");
  return {bytes,chunks};
}
function assertOwner(uid){
  if(!uid||auth.currentUser?.uid!==uid)throw Error("Sign in to the correct account to access cloud documents.");
}
function validId(id){return typeof id==="string"&&/^[A-Za-z0-9-]{1,100}$/.test(id);}
function refs(uid,id){
  if(!validId(id))throw Error("Invalid document identifier.");
  const root=doc(db,"users",uid,"documents",id);
  return {root,chunks:collection(root,"chunks")};
}
const chunkName=i=>String(i).padStart(3,"0");
export async function listCloud(uid){
  assertOwner(uid);
  const snap=await getDocsFromServer(collection(db,"users",uid,"documents"));
  assertOwner(uid);
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
export async function loadCloud(uid,id){
  assertOwner(uid);const {root,chunks}=refs(uid,id);
  for(let attempt=0;attempt<3;attempt++){
    const head=await getDocFromServer(root);assertOwner(uid);
    if(!head.exists())return null;
    const meta=head.data();
    if(!Number.isInteger(meta.chunkCount)||meta.chunkCount<1||meta.chunkCount>MAX_CHUNKS)throw Error("Invalid cloud document metadata.");
    const data=await getDocsFromServer(chunks);assertOwner(uid);
    const parts=new Map(data.docs.map(d=>[d.id,d.data()]));
    const ordered=Array.from({length:meta.chunkCount},(_,i)=>parts.get(chunkName(i)));
    if(ordered.some(p=>!p||p.revision!==meta.revision||typeof p.text!=="string"))continue;
    const value=JSON.parse(ordered.map(p=>p.text).join(""));
    if(value.id!==id)throw Error("Cloud document identifier mismatch.");
    return {value,revision:meta.revision};
  }
  throw Error("Document changed while loading. Try again.");
}
export async function saveCloud(uid,value,expectedRevision){
  assertOwner(uid);const {root,chunks}=refs(uid,value.id);
  const packed=packDocument(value);
  return runTransaction(db,async tx=>{
    assertOwner(uid);
    const old=await tx.get(root);
    const previous=old.exists()?old.data():null;
    if((previous?.revision??0)!==expectedRevision){
      const err=Error("Cloud document changed on another device. Your edits are backed up locally. Download a copy or open the cloud version.");err.code="docs-conflict";throw err;
    }
    const count=previous?.chunkCount??0;
    if(!Number.isInteger(count)||count<0||count>MAX_CHUNKS)throw Error("Invalid existing chunk count.");
    const revision=expectedRevision+1;
    for(let i=0;i<packed.chunks.length;i++){
      tx.set(doc(chunks,chunkName(i)),{text:packed.chunks[i],revision});
    }
    for(let i=packed.chunks.length;i<count;i++)tx.delete(doc(chunks,chunkName(i)));
    tx.set(root,{title:value.title,pageCount:value.pages.length,chunkCount:packed.chunks.length,bytes:packed.bytes,revision,updatedAt:serverTimestamp()});
    return revision;
  });
}
export async function deleteCloud(uid,id,expectedRevision){
  assertOwner(uid);const {root,chunks}=refs(uid,id);
  await runTransaction(db,async tx=>{
    assertOwner(uid);const snap=await tx.get(root);
    if(!snap.exists())return;
    const data=snap.data();
    if(data.revision!==expectedRevision)throw Error("Document was changed on another device. Refresh the library before deleting.");
    if(!Number.isInteger(data.chunkCount)||data.chunkCount<1||data.chunkCount>MAX_CHUNKS)throw Error("Invalid document chunk count.");
    for(let i=0;i<data.chunkCount;i++)tx.delete(doc(chunks,chunkName(i)));
    tx.delete(root);
  });
}
