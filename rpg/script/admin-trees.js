import { verifyStaff,watchStaffRole } from "../../script/staff-auth.js";
import { db } from "../../script/firebase.js";
import { doc,writeBatch,serverTimestamp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { loadTreeDefaults,readTreeOverrides } from "./tree-config.js";
import { validHardness,applyHardnessOverrides,HARDNESS_MAX } from "./tree-system.js";
const $=id=>document.getElementById(id);
const content=$("rpg-tree-content"),status=$("rpg-tree-status"),rows=$("rpg-tree-rows"),save=$("rpg-tree-save"),search=$("rpg-tree-search");
let allowed=false,generation=0,defaults={},baseline={},draft={},busy=false;
function deny(message){generation++;allowed=false;busy=false;content.hidden=true;rows.replaceChildren();save.disabled=true;status.textContent=message;}
function updateSave(){save.disabled=!allowed||busy||!Object.keys(draft).some(id=>draft[id]!==baseline[id])||!Object.values(draft).every(validHardness);}
function render(){
  if(!allowed)return;
  const query=search.value.toLowerCase().trim();
  rows.replaceChildren(...Object.entries(defaults).filter(([id,t])=>(id+" "+t.name).toLowerCase().includes(query)).map(([id,t])=>{
    const tr=document.createElement("tr");
    const pic=document.createElement("td"),img=document.createElement("img");img.className="rpg-tree-preview";img.alt=t.name;img.src=new URL("../"+t.iconAsset,import.meta.url).href;pic.append(img);tr.append(pic);
    const name=document.createElement("td");name.textContent=t.name;tr.append(name);
    const cell=document.createElement("td"),input=document.createElement("input");input.type="number";input.min="1";input.max=String(HARDNESS_MAX);input.step="1";input.required=true;input.value=Number.isFinite(draft[id])?String(draft[id]):"";input.className="rpg-tree-hardness";input.setAttribute("aria-label",t.name+" hardness");input.disabled=busy;input.addEventListener("input",()=>{draft[id]=input.valueAsNumber;updateSave();});cell.append(input);tr.append(cell);
    for(const text of [String(t.hardness),t.dropItem==="wood"?"Wood":t.dropItem.replaceAll("_"," "),["regular","oak"].includes(id)?"On map":"Not on map"]){const td=document.createElement("td");td.textContent=text;tr.append(td);}
    return tr;
  }));
  updateSave();
}
async function load(){
  const run=++generation;allowed=false;busy=false;content.hidden=true;save.disabled=true;status.textContent="Verifying staff access…";
  try{
    if(!await verifyStaff()){if(run===generation)deny("Administrator access required.");return;}
    if(run!==generation)return;
    status.textContent="Loading tree settings…";
    const [base,overrides]=await Promise.all([loadTreeDefaults(),readTreeOverrides()]);
    if(run!==generation)return;
    defaults=base;baseline=Object.fromEntries(Object.entries(applyHardnessOverrides(base,overrides)).map(([id,t])=>[id,t.hardness]));draft={...baseline};allowed=true;content.hidden=false;status.textContent="";render();
  }catch(e){if(run===generation)deny("Could not load server tree settings. Check Firestore rules or reopen the tab.");console.error(e);}
}
watchStaffRole(role=>{if(role!==true){deny(role===null?"Verifying staff access…":"Administrator access required.");return;}if(!allowed)void load();});
$("admin-main-tab-rpg").addEventListener("click",()=>{if(!allowed)void load();});
$("rpg-tree-refresh").addEventListener("click",()=>{if(!busy)void load();});
search.addEventListener("input",render);
$("rpg-tree-form").addEventListener("submit",async event=>{
  event.preventDefault();if(!allowed||busy||!Object.values(draft).every(validHardness))return;
  const changes=Object.entries(draft).filter(([id,n])=>n!==baseline[id]);if(!changes.length)return;
  const run=generation;busy=true;render();status.textContent="Saving tree hardness…";
  try{
    if(!await verifyStaff())throw Error("Administrator access required");
    if(run!==generation)return;
    const batch=writeBatch(db);for(const [id,hardness] of changes)batch.set(doc(db,"rpgTreeTypes",id),{hardness,updatedAt:serverTimestamp()});
    await batch.commit();if(run!==generation)return;
    baseline={...draft};status.textContent="Saved. New game sessions will use these hardness values.";
  }catch(e){if(run===generation)status.textContent="Save failed. Check staff permissions and deployed Firestore rules.";console.error(e);}
  finally{if(run===generation){busy=false;render();}}
});
