
import {db,usingLocalFirebaseEmulators} from "./firebase.js";
import {collection,doc,onSnapshot,setDoc,serverTimestamp,runTransaction} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {watchStaffRole,verifyStaff} from "./staff-auth.js";
import {DRAGON_TYPE,validateDragonImport} from "./starlight-dragons.mjs";
import {mergeTypes,validName,validPrice,validImage,earnedOnlyType} from "./starlight-model.mjs";
const $=id=>document.getElementById(id),status=$("sl-admin-status"),body=$("sl-admin-body"),typeForm=$("sl-type-form"),itemForm=$("sl-item-form"),packForm=$("sl-pack-form");
let allowed=false,epoch=0,stops=[],custom=[],items=[],packs=[],busy=false;
const types=()=>mergeTypes(custom),id=()=>crypto.randomUUID(),report=t=>status.textContent=t;
function choices(select,rows,placeholder){const old=select.value;select.replaceChildren(new Option(placeholder,""),...rows.map(r=>new Option(r.name,r.id)));if([...select.options].some(o=>o.value===old))select.value=old;}
function refresh(){
 choices($("sl-type-edit"),custom,"New collection tab");choices($("sl-item-edit"),items,"New collectible");choices($("sl-item-type"),types().filter(t=>!earnedOnlyType(t.id)),"Choose a collection type");choices($("sl-pack-edit"),packs,"New card pack");
 const pool=$("sl-pack-pool"),selected=new Set([...pool.querySelectorAll("input:checked")].map(x=>x.value));pool.replaceChildren();
 for(const card of items.filter(i=>i.typeId==="cards")){const label=document.createElement("label");label.className="sl-check";const c=document.createElement("input");c.type="checkbox";c.value=card.id;c.checked=selected.has(card.id);label.append(c,document.createTextNode(card.name));pool.append(label);}
 if(!pool.children.length)pool.textContent="Create collectible items of type Cards first.";
}
function preview(key,value){const p=$("sl-"+key+"-preview");p.hidden=!value;if(value)p.src=value;else p.removeAttribute("src");}
function loadItem(){const i=items.find(x=>x.id===$("sl-item-edit").value);$("sl-item-name").value=i?.name||"";$("sl-item-price").value=i?.price||"";$("sl-item-type").value=i?.typeId||"";$("sl-item-type").disabled=!!i;$("sl-item-active").checked=i?.active??false;$("sl-item-image").value="";preview("item",i?.image);}
function loadPack(){const p=packs.find(x=>x.id===$("sl-pack-edit").value);$("sl-pack-name").value=p?.name||"";$("sl-pack-price").value=p?.price||"";$("sl-pack-count").value=p?.cardsPerPack||5;$("sl-pack-image").value="";preview("pack",p?.image);for(const c of $("sl-pack-pool").querySelectorAll("input"))c.checked=(p?.cardIds||[]).includes(c.value);}
async function imageFor(input,existing){
 const f=input.files?.[0];if(!f){if(validImage(existing))return existing;throw Error("Choose an image.");}
 if(!["image/png","image/jpeg","image/webp","image/gif"].includes(f.type)||f.size>12000000)throw Error("Choose PNG, JPEG, WebP or GIF under 12 MB.");
 const bmp=await createImageBitmap(f);try{const scale=Math.min(1,512/Math.max(bmp.width,bmp.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bmp.width*scale));canvas.height=Math.max(1,Math.round(bmp.height*scale));canvas.getContext("2d").drawImage(bmp,0,0,canvas.width,canvas.height);
 for(const q of [.88,.74,.58,.42,.28]){const r=canvas.toDataURL("image/webp",q);if(validImage(r))return r;}throw Error("Image too large after compression.");}finally{bmp.close();}
}
const nameOf=key=>{const n=$("sl-"+key+"-name").value.trim();if(!validName(n))throw Error("Enter a name (1–80 characters).");return n;};
const priceOf=key=>{const n=Number($("sl-"+key+"-price").value);if(!validPrice(n))throw Error("Enter a whole-number Star Coin price (1–100,000,000).");return n;};
async function save(form,work){if(!allowed||busy)return;const current=epoch;busy=true;form.querySelector("button[type=submit]").disabled=true;report("Saving…");try{const result=await work(()=>allowed&&epoch===current);if(epoch===current)report(result);}catch(e){if(epoch===current)report(e.message||"Save failed.");}finally{if(epoch===current){busy=false;form.querySelector("button[type=submit]").disabled=false;}}}
// The supplied catalog contains the optimized transparent artwork. Import only as verified staff.
const dragonForm=document.createElement("form");
dragonForm.innerHTML='<fieldset><legend>Elemental Dragon collection</legend><p>Import the six-dragon catalog. Existing item IDs are preserved, so repeating the import will never reset prices or ownership.</p><label>Dragon catalog JSON<input type="file" accept=".json,application/json" required></label><button type="submit">Publish six dragons</button><p role="status" aria-live="polite"></p></fieldset>';
itemForm.after(dragonForm);
dragonForm.onsubmit=event=>{
 event.preventDefault();
 void save(dragonForm,async current=>{
  const note=dragonForm.querySelector('[role="status"]'),file=dragonForm.querySelector("input").files?.[0];
  if(!file||file.size>2000000)throw Error("Choose the dragon catalog JSON under 2 MB.");
  const rows=validateDragonImport(JSON.parse(await file.text()));
  if(!current()||!await verifyStaff()||!current())throw Error("Staff access required.");
  const target=usingLocalFirebaseEmulators?"local Firebase emulator":"LIVE Firebase";
  if(!confirm("Publish up to six dragons to "+target+"? Existing items are not overwritten. No Star Coins will be charged."))return "Dragon import canceled.";
  const type=doc(db,"starlightTypes",DRAGON_TYPE);
  // Existing rules use exists(), so create the type before the item transaction.
  await runTransaction(db,async tx=>{
   const old=await tx.get(type);if(!current())throw Error("Staff session changed.");
   if(old.exists()){if(old.data().name!=="Dragons")throw Error("The Dragons category ID is already in use.");}
   else tx.set(type,{name:"Dragons",updatedAt:serverTimestamp()});
  });
  const result=await runTransaction(db,async tx=>{
   const refs=rows.map(row=>doc(db,"starlightItems",row.id));
   const snapshots=await Promise.all(refs.map(ref=>tx.get(ref)));
   if(!current())throw Error("Staff session changed.");
   let added=0;
   snapshots.forEach((snap,index)=>{
    const {id,...row}=rows[index];
    if(snap.exists()){if(snap.data().typeId!==DRAGON_TYPE)throw Error("Collectible ID already in use: "+id);return;}
    tx.set(refs[index],{...row,updatedAt:serverTimestamp()});added++;
   });
   return added;
  });
  const msg=result+" dragons published; "+(rows.length-result)+" existing items preserved.";
  if(current()){note.textContent=msg;dragonForm.reset();}return msg;
 });
};
$("sl-type-edit").onchange=()=>{$("sl-type-name").value=custom.find(t=>t.id===$("sl-type-edit").value)?.name||"";};$("sl-item-edit").onchange=loadItem;$("sl-pack-edit").onchange=loadPack;
for(const key of ["item","pack"]){$("sl-"+key+"-image").onchange=async()=>{const current=epoch,input=$("sl-"+key+"-image"),f=input.files?.[0];try{if(f){const value=await imageFor(input,null);if(allowed&&current===epoch&&input.files?.[0]===f)preview(key,value);}}catch(e){if(current===epoch)report(e.message);}};}
typeForm.onsubmit=e=>{e.preventDefault();void save(typeForm,async current=>{const name=nameOf("type"),key=$("sl-type-edit").value||id();if(types().some(t=>t.id!==key&&t.name.toLowerCase()===name.toLowerCase()))throw Error("That tab already exists.");if(!current())return "";await setDoc(doc(db,"starlightTypes",key),{name,updatedAt:serverTimestamp()});if(current()&&!$("sl-type-edit").value){typeForm.reset();}return "Collection tab saved.";});};
itemForm.onsubmit=e=>{e.preventDefault();void save(itemForm,async current=>{const key=$("sl-item-edit").value||id(),old=items.find(x=>x.id===key),name=nameOf("item"),price=priceOf("item"),typeId=old?.typeId||$("sl-item-type").value,active=$("sl-item-active").checked;if(earnedOnlyType(typeId)||!types().some(t=>t.id===typeId))throw Error("Choose a purchasable collection type.");const image=await imageFor($("sl-item-image"),old?.image);if(!current())return "";await setDoc(doc(db,"starlightItems",key),{name,price,typeId,image,active,updatedAt:serverTimestamp()});if(current()&&!old){itemForm.reset();loadItem();}return active?"Collectible published.":"Collectible saved and hidden from the store.";});};
packForm.onsubmit=e=>{e.preventDefault();void save(packForm,async current=>{const key=$("sl-pack-edit").value||id(),old=packs.find(x=>x.id===key),name=nameOf("pack"),price=priceOf("pack"),cardsPerPack=Number($("sl-pack-count").value),cardIds=[...$("sl-pack-pool").querySelectorAll("input:checked")].map(x=>x.value);if(!Number.isInteger(cardsPerPack)||cardsPerPack<1||cardsPerPack>20||cardIds.length<cardsPerPack||cardIds.length>100)throw Error("Select enough distinct cards (max 100), with 1–20 cards per pack.");const image=await imageFor($("sl-pack-image"),old?.image);if(!current())return "";await setDoc(doc(db,"starlightPacks",key),{name,price,image,cardsPerPack,cardIds,status:"draft",updatedAt:serverTimestamp()});if(current()&&!old){packForm.reset();loadPack();}return "Pack draft saved. Sales and opening are not enabled yet.";});};
watchStaffRole(value=>{const next=value===true;if(next===allowed)return;allowed=next;const current=++epoch;busy=false;stops.forEach(s=>s());stops=[];body.hidden=!allowed;custom=[];items=[];packs=[];for(const f of [typeForm,itemForm,packForm,dragonForm]){f.reset();f.querySelector("button[type=submit]").disabled=false;}$("sl-item-type").disabled=false;preview("item","");preview("pack","");refresh();if(!allowed){report("Staff access required.");return;}report("Manage your catalog and future packs.");for(const [name,assign] of [["starlightTypes",v=>custom=v],["starlightItems",v=>items=v],["starlightPacks",v=>packs=v]])stops.push(onSnapshot(collection(db,name),s=>{if(current!==epoch)return;assign(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>a.name.localeCompare(b.name)));refresh();},()=>{if(current===epoch)report("Catalog unavailable. Publish the updated Firestore rules.");}));});
