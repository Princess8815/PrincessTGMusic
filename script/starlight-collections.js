
import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {collection,onSnapshot,query,where} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {mergeTypes,validImage,earnedOnlyType} from "./starlight-model.mjs";
import {isElementalDragon,dragonPerksLabel} from "./starlight-dragons.mjs";
import {STORE_AXOLOTL_CLUE,attachReefClue} from "./reef-clues.mjs";
const $=id=>document.getElementById(id),nav=$("sl-collection-tabs"),grid=$("sl-owned-grid"),section=$("sl-owned-section");
if(nav&&grid&&section){
 let types=mergeTypes([]),owned=[],catalog=[],selected="axolotls",stop=()=>{},epoch=0,loaded=false,error=false;
 function render(){
  const tabs=[...types];for(const item of owned)if(!tabs.some(t=>t.id===item.typeId))tabs.push({id:item.typeId,name:"Other collectibles"});
  if(!tabs.some(t=>t.id===selected))selected="axolotls";
  nav.replaceChildren();for(const t of tabs){const b=document.createElement("button");b.type="button";b.textContent=t.name;b.setAttribute("aria-pressed",String(t.id===selected));b.onclick=()=>{selected=t.id;render();};nav.append(b);}
  $("sl-original-reef").hidden=selected!=="axolotls";$("trophy-panel").hidden=selected!=="trophies";$("medal-panel").hidden=selected!=="medals";$("diploma-panel").hidden=selected!=="diplomas";
  const builtIn=selected==="axolotls"||earnedOnlyType(selected),found=owned.filter(i=>i.typeId===selected);
  const ownedIds=new Set(owned.map(i=>i.id));
  const missing=selected==="axolotls"&&loaded&&auth.currentUser?catalog.filter(i=>i.typeId==="axolotls"&&!ownedIds.has(i.id)):[];
  $("sl-owned-heading").textContent=builtIn?"Starlight Store purchases":tabs.find(t=>t.id===selected)?.name||"Collection";
  section.hidden=builtIn&&!found.length&&!missing.length&&!error;grid.replaceChildren();
  for(const item of found){const card=document.createElement("article");card.className="sl-card"+(isElementalDragon(item)?" sl-dragon":"");
   if(validImage(item.image)){const img=document.createElement("img");img.src=item.image;img.alt=item.name;img.loading="lazy";card.append(img);}
   const title=document.createElement("h3");title.textContent=item.name;const label=document.createElement("p");label.textContent=isElementalDragon(item)?"Collected · "+dragonPerksLabel:"Collected";card.append(title,label);grid.append(card);}
  for(const item of missing){const card=document.createElement("article");card.className="sl-card reef-store-locked";
   const art=document.createElement("div");art.className="reef-card-art reef-mystery";art.textContent="?";
   const heading=document.createElement("h3");heading.textContent="???";const label=document.createElement("p");label.textContent="Not yet collected";
   card.append(art,heading,label);attachReefClue(card,STORE_AXOLOTL_CLUE);grid.append(card);}
  $("sl-owned-status").textContent=error?"Purchased collections unavailable. Reload to retry.":!loaded?"Loading collection…":missing.length?found.length+" / "+(found.length+missing.length)+" collected":found.length?found.length+" collected":"Nothing collected in this category yet.";
 }
 onSnapshot(query(collection(db,"starlightItems"),where("active","==",true)),s=>{catalog=s.docs.map(d=>({...d.data(),id:d.id})).filter(i=>i.typeId==="axolotls").sort((a,b)=>a.name.localeCompare(b.name));render();},()=>{catalog=[];render();});
 onSnapshot(collection(db,"starlightTypes"),s=>{types=mergeTypes(s.docs.map(d=>({...d.data(),id:d.id})));render();},()=>{});
 onAuthStateChanged(auth,user=>{const current=++epoch;stop();owned=[];loaded=false;error=false;selected="axolotls";render();if(!user)return;
  stop=onSnapshot(collection(db,"users",user.uid,"starlightCollectibles"),{includeMetadataChanges:true},s=>{if(current!==epoch||s.metadata.fromCache||s.metadata.hasPendingWrites)return;owned=s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>a.name.localeCompare(b.name));loaded=true;error=false;render();},()=>{if(current===epoch){error=true;render();}});
 });render();
}
