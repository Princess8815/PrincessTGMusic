import {songAlbums} from "./song-albums.js";
// Admin CD listing editor, mounted inside existing album administration.
import {auth,db} from "./firebase.js";
import {verifyStaff} from "./staff-auth.js";
import {loadAllSongs} from "./song-data.js";
import {MAX_VOLUMES,DEFAULT_PRICE} from "./store-catalog.js";
import {collection,doc,getDocs,getDoc,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
const $=id=>document.getElementById(id);
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const norm=x=>String(x||"").trim().toLowerCase();
const slug=x=>norm(x).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"album";
let records=new Map(),songs=[],current=null,volumes=[],assignment=new Map(),epoch=0;
const status=message=>{$("cd-admin-status").textContent=message;};
function defaults(count){return Array.from({length:count},(_,i)=>({name:count===1?"":"Volume "+(i+1),priceCents:DEFAULT_PRICE}));}
function readVolumeInputs(){document.querySelectorAll("[data-cd-volume]").forEach(row=>{const i=Number(row.dataset.cdVolume);if(volumes[i]){const name=row.querySelector("input[type=text]");volumes[i].name=name?name.value:"";volumes[i].priceCents=Math.round(Number(row.querySelector("input[type=number]").value)*100);}});}
function render(){
 const list=$("cd-volume-editor");list.replaceChildren();
 volumes.forEach((v,i)=>{
  const row=node("div");row.className="cd-admin-volume";row.dataset.cdVolume=i;
  const single=volumes.length===1;
  row.classList.toggle("cd-admin-single",single);
  if(!single){
   const h=node("h4","Volume "+(i+1));row.append(h);
   const name=node("input");name.type="text";name.maxLength=100;name.value=v.name||"Volume "+(i+1);name.required=true;name.setAttribute("aria-label","Volume "+(i+1)+" name");
   const nLabel=node("label","Volume name");nLabel.append(name);row.append(nLabel);
  }
  const price=node("input");price.type="number";price.min=".50";price.max="1000";price.step=".01";price.required=true;price.value=(v.priceCents/100).toFixed(2);price.setAttribute("aria-label",single?"Album price in US dollars":"Volume "+(i+1)+" price in US dollars");
  const pLabel=node("label",single?"Album price (USD)":"Price (USD)");pLabel.append(price);row.append(pLabel);list.append(row);
 });
 const tracks=$("cd-track-assignments");tracks.replaceChildren();
 $("cd-track-section").hidden=volumes.length===1;
 if(volumes.length===1)return;
 for(const song of songs){
  const label=node("label");label.className="cd-admin-track";label.append(node("span",song.title));
  const select=node("select");select.setAttribute("aria-label","Volume for "+song.title);
  for(let i=0;i<volumes.length;i++)select.add(new Option("Volume "+(i+1),String(i)));
  const index=assignment.get(song.id)??0;select.value=String(Math.min(index,volumes.length-1));
  select.onchange=()=>assignment.set(song.id,Number(select.value));label.append(select);tracks.append(label);
 }
}
async function loadAlbums(){
 if(!await verifyStaff())throw Error("Administrator access required.");
 const [rich,enums]=await Promise.all([getDocs(collection(db,"albums")),getDoc(doc(db,"enums","albums"))]);
 records=new Map(rich.docs.map(s=>[s.id,s.data()]));
 for(const name of enums.data()?.values||[]){if(typeof name==="string"&&!records.has(slug(name)))records.set(slug(name),{name});}
 const select=$("cd-admin-album"),old=select.value;select.replaceChildren(new Option("Choose an album",""));
 for(const [id,data] of [...records].sort((a,b)=>String(a[1].name).localeCompare(String(b[1].name))))select.add(new Option(data.name||id,id));
 if(records.has(old))select.value=old;
}
async function choose(){
 const id=$("cd-admin-album").value,token=++epoch;current=null;$("cd-admin-fields").hidden=true;if(!id)return;
 status("Loading album tracks…");
 const data=records.get(id),all=await loadAllSongs("../audioPlayer/audio/song-details.json");
 if(token!==epoch)return;
 songs=all.filter(s=>songAlbums(s).some(x=>norm(x)===norm(data.name))).map(s=>({id:String(s.pageId||slug(s.title)),title:String(s.title)}));
 const rank=new Map((data.trackOrder||[]).map((id,i)=>[id,i]));songs.sort((a,b)=>(rank.get(a.id)??99999)-(rank.get(b.id)??99999)||a.title.localeCompare(b.title));
 const stored=Array.isArray(data.store?.volumes)?data.store.volumes:[];
 volumes=stored.length&&stored.length<=MAX_VOLUMES?stored.map((v,i)=>({name:stored.length===1?"":v.name||"Volume "+(i+1),priceCents:Number.isInteger(v.priceCents)?v.priceCents:DEFAULT_PRICE})):defaults(1);
 assignment=new Map();stored.forEach((v,i)=>(v.songIds||[]).forEach(id=>assignment.set(id,i)));
 current=id;$("cd-sellable").checked=data.store?.sellable===true;$("cd-volume-count").value=volumes.length;
 $("cd-admin-fields").hidden=false;render();status(songs.length+" album tracks loaded.");
}
async function save(){
 if(!current||!await verifyStaff()||!auth.currentUser)throw Error("Choose an album while signed in as staff.");
 readVolumeInputs();const enabled=$("cd-sellable").checked;
 const result=volumes.map((v,i)=>({name:volumes.length===1?"":String(v.name).trim()||"Volume "+(i+1),priceCents:v.priceCents,songIds:songs.filter(s=>Math.min(assignment.get(s.id)??0,volumes.length-1)===i).map(s=>s.id)}));
 if(result.some(v=>!Number.isInteger(v.priceCents)||v.priceCents<50||v.priceCents>100000||v.name.length>100||v.songIds.length>380))throw Error("Each CD price must be $0.50–$1,000.00; max 380 tracks per volume.");
 if(enabled&&result.some(v=>!v.songIds.length))throw Error("Assign at least one song to each sellable volume.");
 const id=current,data=records.get(id),ref=doc(db,"albums",id);
 await runTransaction(db,async tx=>{const existing=await tx.get(ref);if(!existing.exists())tx.set(ref,{name:data.name,releaseDate:"tbd",description:"",coverUrl:"",trackOrder:songs.map(s=>s.id),createdAt:serverTimestamp(),updatedAt:serverTimestamp(),store:{sellable:enabled,volumes:result}});else tx.update(ref,{store:{sellable:enabled,volumes:result},updatedAt:serverTimestamp()});});
 records.set(id,{...data,store:{sellable:enabled,volumes:result}});status(enabled?"CD listing saved to the public store.":"CD listing disabled.");
}
function mount(){
 if(!$("cd-admin-form"))return;
 $("cd-admin-load").onclick=()=>loadAlbums().then(choose).catch(e=>status(e.message));
 $("cd-admin-album").onchange=()=>choose().catch(e=>status(e.message));
 $("cd-volume-count").onchange=()=>{readVolumeInputs();const n=Number($("cd-volume-count").value);if(!Number.isInteger(n)||n<1||n>MAX_VOLUMES)return;volumes=defaults(n).map((v,i)=>({...v,...(volumes[i]||{}),name:n===1?"":(volumes[i]?.name||v.name)}));for(const [id,i] of assignment)if(i>=n)assignment.set(id,n-1);render();};
 $("cd-admin-form").onsubmit=async e=>{e.preventDefault();const button=$("cd-admin-save");button.disabled=true;try{await save();}catch(err){status(err.message);}finally{button.disabled=false;}};
}
mount();
