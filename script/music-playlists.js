import {publicError} from "./site-errors.js";
import {auth,db} from "./firebase.js";
import {showGuestReef} from "./reef-collection.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {collection,doc,onSnapshot,runTransaction,serverTimestamp,getDocsFromServer,writeBatch} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const KEY_PREFIX = "princesstg-playlists-v2:";
const CHANGE = "princesstg:playlists-change";
const normalize = x => String(x || "").trim();
const unique = items => [...new Set((Array.isArray(items)?items:[]).filter(x => typeof x === "string" && x))];
export const DEFAULT_PLAYLIST_COLOR = "#8b5cf6";
export const playlistColor = value => /^#[0-9a-f]{6}$/i.test(String(value || ""))
  ? String(value).toLowerCase() : DEFAULT_PLAYLIST_COLOR;
const validId=id=>typeof id==="string"&&/^[A-Za-z0-9_-]{1,140}$/.test(id);
const asPlaylist = p => ({
  id:p.id, name:p.name, tracks:unique(p.tracks),
  color:playlistColor(p.color),
  updatedAt:p.updatedAt?.toMillis?.() ?? (Number.isFinite(p.updatedAt)?p.updatedAt:0)
});
let owner=null, cache=[], ready=false, loading=null, unsubscribe=null, failure="", generation=0, wanted=false;
const notify=()=>window.dispatchEvent(new CustomEvent(CHANGE));
const current=uid=>!!uid&&auth.currentUser?.uid===uid;
const assertOwner=uid=>{if(!current(uid))throw Error("Sign in to your account to use playlists.");};
const pathFor=uid=>collection(db,"users",uid,"playlists");
export function playlistState(){
  if(!auth.currentUser)return "Sign in to create and use account playlists.";
  if(owner!==auth.currentUser.uid||!ready)return failure||"Loading account playlists…";
  return failure||"";
}
export function getPlaylists(){
  return current(owner)&&ready?cache.map(p=>({...p,tracks:[...p.tracks]})):[];
}
function clear(){
  generation++;unsubscribe?.();unsubscribe=null;owner=null;cache=[];ready=false;loading=null;failure="";
}
function validate(name,tracks){
  if(typeof name!=="string"||!name.trim()||name.length>90)throw Error("Playlist name must be between 1 and 90 characters.");
  if(!Array.isArray(tracks)||tracks.length>1000||tracks.some(k=>typeof k!=="string"||!k||k.length>400))throw Error("A playlist supports up to 1,000 valid song references.");
}
function readLegacy(uid){
  try{const x=JSON.parse(localStorage.getItem(KEY_PREFIX+uid)||"[]");return Array.isArray(x)?x:[];}catch{return [];}
}
// Only migrate data already scoped to this UID. Never claim guest or unscoped data.
async function migrate(uid){
  const list=readLegacy(uid);
  if(!list.length)return;
  for(const raw of list){
    assertOwner(uid);
    const p=asPlaylist(raw||{});
    if(!validId(p.id))throw Error("A local playlist has an invalid ID. Its backup has been retained.");
    validate(p.name,p.tracks);
    const ref=doc(pathFor(uid),p.id);
    await runTransaction(db,async tx=>{
      assertOwner(uid);
      const existing=await tx.get(ref);
      assertOwner(uid);
      if(!existing.exists()){
        tx.set(ref,{name:p.name,color:p.color,tracks:p.tracks,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      }else{
        const d=existing.data();
        if(d.name!==p.name||d.color!==p.color||JSON.stringify(d.tracks)!==JSON.stringify(p.tracks)){
          // Preserve a different local version rather than overwrite a cloud edit.
          let hash=2166136261;
          for(const c of JSON.stringify([p.name,p.color,p.tracks]))hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
          const copy=doc(pathFor(uid),p.id.slice(0,115)+"-local-"+hash.toString(16));
          const saved=await tx.get(copy);
          assertOwner(uid);
          if(!saved.exists())tx.set(copy,{name:p.name,color:p.color,tracks:p.tracks,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
        }
      }
    });
  }
  assertOwner(uid);
  try{localStorage.removeItem(KEY_PREFIX+uid);}catch{}
}
export async function ensurePlaylists(expectedUid){
  wanted=true;
  await auth.authStateReady();
  const uid=expectedUid??auth.currentUser?.uid;
  assertOwner(uid);
  if(owner===uid&&ready)return getPlaylists();
  if(owner===uid&&loading)return loading;
  clear();owner=uid;
  const token=generation;
  loading=(async()=>{
    // A migration failure leaves the original local backup intact and surfaces an error.
    let migrationError="";
    try{await migrate(uid);}catch(e){migrationError=publicError(e,"PTG-503");}
    assertOwner(uid);
    if(token!==generation)throw Error("Account changed.");
    const first=await getDocsFromServer(pathFor(uid));
    assertOwner(uid);
    if(token!==generation)throw Error("Account changed.");
    cache=first.docs.map(s=>asPlaylist({...s.data(),id:s.id}));ready=true;failure=migrationError;notify();
    unsubscribe=onSnapshot(pathFor(uid),{includeMetadataChanges:true},snap=>{
      if(token!==generation||!current(uid)||snap.metadata.hasPendingWrites||snap.metadata.fromCache)return;
      cache=snap.docs.map(s=>asPlaylist({...s.data(),id:s.id}));ready=true;failure=migrationError;notify();
    },e=>{if(token===generation&&current(uid)){failure=publicError(e,"PTG-503");ready=false;cache=[];notify();}});
    return getPlaylists();
  })().catch(e=>{if(token===generation){failure=publicError(e,"PTG-503");ready=false;cache=[];notify();}throw e;}).finally(()=>{if(token===generation)loading=null;});
  return loading;
}
onAuthStateChanged(auth,user=>{
  if(owner&&owner!==user?.uid){clear();notify();}
  if(wanted&&user&&!ready&&!loading)void ensurePlaylists(user.uid).catch(()=>{});
  if(!user)notify();
});
async function member(){
  const uid=auth.currentUser?.uid;assertOwner(uid);
  await ensurePlaylists(uid);assertOwner(uid);return uid;
}
function cacheResult(uid,id,data){
  if(current(uid)&&owner===uid&&ready){
    cache=cache.filter(p=>p.id!==id);
    if(data)cache.push(asPlaylist({...data,id,updatedAt:Date.now()}));
    notify();
  }
}
export async function createPlaylist(name, tracks = [], color = DEFAULT_PLAYLIST_COLOR) {
  const uid=await member();
  const cleaned=normalize(name).replace(/\s+/g," "), keys=unique(tracks);
  validate(cleaned,keys);
  if(getPlaylists().some(p=>p.name.toLowerCase()===cleaned.toLowerCase()))throw Error("A playlist with that name already exists.");
  const ref=doc(pathFor(uid)),data={name:cleaned,color:playlistColor(color),tracks:keys};
  await runTransaction(db,async tx=>{assertOwner(uid);tx.set(ref,{...data,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});});
  assertOwner(uid);cacheResult(uid,ref.id,data);return asPlaylist({...data,id:ref.id,updatedAt:Date.now()});
}
async function changePlaylist(id, transform){
  const uid=await member();
  if(!validId(id))throw Error("Invalid playlist.");
  const ref=doc(pathFor(uid),id);
  const result=await runTransaction(db,async tx=>{
    assertOwner(uid);const snap=await tx.get(ref);assertOwner(uid);
    if(!snap.exists())throw Error("Playlist not found.");
    const old=snap.data(), next=transform({...old,tracks:unique(old.tracks)});
    if(next===null){tx.delete(ref);return {data:null};}
    validate(next.name,next.tracks);
    if(JSON.stringify([old.name,old.color,old.tracks])!==JSON.stringify([next.name,next.color,next.tracks])){
      tx.update(ref,{name:next.name,color:next.color,tracks:next.tracks,updatedAt:serverTimestamp()});
    }
    return {data:next,amount:next.tracks.length-unique(old.tracks).length};
  });
  assertOwner(uid);cacheResult(uid,id,result.data);return result;
}
export async function deletePlaylist(id){await changePlaylist(id,()=>null);}
export async function addToPlaylist(id,keys){return (await changePlaylist(id,p=>({...p,tracks:unique([...p.tracks,...unique(keys)])}))).amount;}
export async function removeFromPlaylist(id,key){await changePlaylist(id,p=>({...p,tracks:p.tracks.filter(k=>k!==key)}));}
export async function movePlaylistSong(id,from,to){
  const p=getPlaylists().find(p=>p.id===id);
  if(!p||from<0||to<0||from>=p.tracks.length||to>=p.tracks.length||from===to)return;
  const moving=p.tracks[from],target=p.tracks[to],after=from<to;
  await changePlaylist(id,p=>{
    const a=p.tracks.indexOf(moving),b=p.tracks.indexOf(target);
    if(a<0||b<0)throw Error("Playlist changed on another device. Try again.");
    p.tracks.splice(a,1);p.tracks.splice(p.tracks.indexOf(target)+(after?1:0),0,moving);return p;
  });
}
export async function setPlaylistColor(id,color){
  if(!/^#[0-9a-f]{6}$/i.test(String(color||"")))throw Error("Choose a valid playlist color.");
  await changePlaylist(id,p=>({...p,color:playlistColor(color)}));
}
export async function deleteAccountPlaylists(uid){
  assertOwner(uid);
  const snap=await getDocsFromServer(pathFor(uid));assertOwner(uid);
  for(let i=0;i<snap.docs.length;i+=400){
    const batch=writeBatch(db);
    for(const item of snap.docs.slice(i,i+400))batch.delete(item.ref);
    assertOwner(uid);await batch.commit();
  }
  try{localStorage.removeItem(KEY_PREFIX+uid);}catch{}
}

const slug = text => normalize(text).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const stem = path => {
  let filename = normalize(path).split(/[\\/]/).pop().split(/[?#]/)[0];
  try {filename = decodeURIComponent(filename);} catch {}
  return slug(filename.replace(/\.[^.]+$/, ""));
};
let indexPromise = null;
export async function getAudioIndex() {
  if (!indexPromise) {
    const url = new URL("../audioPlayer/audio/index.json", import.meta.url);
    indexPromise = fetch(url, {cache:"no-store"}).then(async res => {
      if (!res.ok) throw Error("Audio catalog unavailable.");
      const entries = await res.json();
      if (!Array.isArray(entries)) throw Error("Audio index is invalid.");
      return entries.map(item => typeof item === "string" ? item : item?.path || item?.file || item?.src || "")
        .filter(path => typeof path === "string" && path.startsWith("audio/"));
    }).catch(err => {indexPromise = null;throw err;});
  }
  return indexPromise;
}
export function songId(song) {return normalize(song?.pageId || slug(song?.title));}
export function keyForSong(song, paths = []) {
  const wanted = stem(song?.file || song?.title || "");
  const path = paths.find(p => stem(p) === wanted);
  return path || "song:" + songId(song);
}
export function songLink(id) {
  return new URL("../audioPlayer/pages/song.html?id=" + encodeURIComponent(id), import.meta.url).href;
}
export function audioLink(path) {
  if (!path?.startsWith("audio/") || path.includes("..") || path.includes("\\"))
    return null;
  return new URL("../audioPlayer/" + path.split("/").map(encodeURIComponent).join("/"), import.meta.url).href;
}
export function orderByIds(songs, ids) {
  const ranks = new Map((Array.isArray(ids) ? ids : []).map((id,i)=>[String(id),i]));
  const original = new Map(songs.map((song,index)=>[songId(song),index]));
  return [...songs].sort((a,b) => {
    const x=ranks.get(songId(a)) ?? Number.MAX_SAFE_INTEGER;
    const y=ranks.get(songId(b)) ?? Number.MAX_SAFE_INTEGER;
    return x-y || (original.get(songId(a)) ?? 0) - (original.get(songId(b)) ?? 0);
  });
}

let stylesInstalled = false;
function ensureStyles() {
  if (stylesInstalled || document.querySelector('link[data-playlists-style]')) return;
  stylesInstalled = true;
  const link = document.createElement("link");
  link.rel="stylesheet";
  link.href=new URL("../styles/music-playlists.css",import.meta.url).href;
  link.dataset.playlistsStyle="1";
  document.head.append(link);
}
export function addToPlaylistControl(getKeys, options = {}) {
  ensureStyles();
  const root=document.createElement("details");
  root.className="ptg-add-playlist";
  const summary=document.createElement("summary");
  summary.textContent=options.label || "+ Playlist";
  root.append(summary);
  summary.addEventListener("click",event=>{
    if(auth.currentUser)return;
    event.preventDefault();
    void showGuestReef().then(shown=>{if(!shown)root.open=true;}).catch(e=>{console.warn(e);root.open=true;});
  });
  const inner=document.createElement("div");
  inner.className="ptg-add-playlist__content";
  const select=document.createElement("select");
  select.setAttribute("aria-label","Choose playlist");
  const add=document.createElement("button");
  add.type="button";add.textContent="Add";
  const input=document.createElement("input");
  input.type="text";input.placeholder="New playlist name";input.maxLength=90;
  input.setAttribute("aria-label","New playlist name");
  const create=document.createElement("button");create.type="button";
  create.textContent="Create & add";
  const message=document.createElement("p");message.className="ptg-playlist-message";
  message.setAttribute("role","status");
  function refresh() {
    const selectedValue=select.value;
    const unavailable=playlistState();
    select.disabled=add.disabled=input.disabled=create.disabled=!(current(owner)&&ready);
    message.textContent=unavailable;
    select.replaceChildren(new Option("Select a playlist", ""));
    for(const p of getPlaylists()) select.add(new Option(p.name,p.id));
    if([...select.options].some(o=>o.value===selectedValue)) select.value=selectedValue;
  }
  async function keys() {
    const values=await getKeys();
    const list=unique(Array.isArray(values)?values:[values]);
    if(!list.length) throw Error("No songs are available to add.");
    return list;
  }
  add.addEventListener("click",async()=>{
    add.disabled=true;
    try{const uid=auth.currentUser?.uid;const id=select.value;const list=await keys();assertOwner(uid);const amount=await addToPlaylist(id,list);message.textContent=amount+" song(s) added.";root.open=false;}
    catch(err){message.textContent=publicError(err,"PTG-503");}finally{add.disabled=false;}
  });
  create.addEventListener("click",async()=>{
    create.disabled=true;
    try{
      const uid=auth.currentUser?.uid;const name=input.value;const list=await keys();assertOwner(uid);const playlist=await createPlaylist(name,list);
      input.value="";
      refresh();select.value=playlist.id;
      message.textContent="Created "+playlist.name+" with "+playlist.tracks.length+" song(s).";
      root.open=false;
    }catch(err){message.textContent=publicError(err,"PTG-503");}finally{create.disabled=false;}
  });
  root.addEventListener("toggle",()=>{if(root.open){refresh();void auth.authStateReady().then(()=>auth.currentUser?ensurePlaylists():null).then(refresh).catch(e=>{refresh();message.textContent=publicError(e,"PTG-503");});}});
  // Rebuild choices when the picker opens; detached rows do not retain listeners.
  const signIn=document.createElement("a");signIn.textContent="Sign in or register to save playlists";signIn.href=new URL("../pages/profile.html",import.meta.url).href;
  function update(){refresh();signIn.hidden=!!auth.currentUser;}
  window.addEventListener(CHANGE,()=>{if(root.isConnected)update();});
  inner.append(signIn,select,add,input,create,message);
  root.append(inner);
  update();
  return root;
}
