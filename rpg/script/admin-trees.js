import { verifyStaff,watchStaffRole } from "../../script/staff-auth.js";
import { db } from "../../script/firebase.js";
import { doc,writeBatch,serverTimestamp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { loadTreeDefaults,readTreeOverrides } from "./tree-config.js";
import { validHardness,applyHardnessOverrides,HARDNESS_MAX,validTreeXp,TREE_XP_MAX } from "./tree-system.js";
const $=id=>document.getElementById(id);
const content=$("rpg-tree-content"),status=$("rpg-tree-status"),rows=$("rpg-tree-rows"),save=$("rpg-tree-save"),search=$("rpg-tree-search");
let allowed=false,generation=0,defaults={},baseline={},draft={},busy=false;
function deny(message){generation++;allowed=false;busy=false;content.hidden=true;rows.replaceChildren();save.disabled=true;status.textContent=message;}
const changed=(id)=>draft[id].hardness!==baseline[id].hardness||draft[id].woodcuttingXp!==baseline[id].woodcuttingXp;
const valid=()=>Object.values(draft).every(t=>validHardness(t.hardness)&&validTreeXp(t.woodcuttingXp));
function updateSave(){save.disabled=!allowed||busy||!Object.keys(draft).some(changed)||!valid();}
function render(){
  if(!allowed)return;
  const query=search.value.toLowerCase().trim();
  rows.replaceChildren(...Object.entries(defaults).filter(([id,t])=>(id+" "+t.name).toLowerCase().includes(query)).map(([id,t])=>{
    const tr=document.createElement("tr");
    const pic=document.createElement("td"),img=document.createElement("img");img.className="rpg-tree-preview";img.alt=t.name;img.src=new URL("../"+t.iconAsset,import.meta.url).href;pic.append(img);tr.append(pic);
    const name=document.createElement("td");name.textContent=t.name;tr.append(name);
    const cell=document.createElement("td"),input=document.createElement("input");input.type="number";input.min="1";input.max=String(HARDNESS_MAX);input.step="1";input.required=true;input.value=Number.isFinite(draft[id].hardness)?String(draft[id].hardness):"";input.className="rpg-tree-hardness";input.setAttribute("aria-label",t.name+" hardness");input.disabled=busy;input.addEventListener("input",()=>{draft[id].hardness=input.valueAsNumber;updateSave();});cell.append(input);tr.append(cell);
    const xpCell=document.createElement("td"),xp=document.createElement("input");xp.type="number";xp.min="0";xp.max=String(TREE_XP_MAX);xp.step="1";xp.required=true;xp.value=Number.isFinite(draft[id].woodcuttingXp)?String(draft[id].woodcuttingXp):"";xp.className="rpg-tree-hardness";xp.setAttribute("aria-label",t.name+" woodcutting XP");xp.disabled=busy;xp.addEventListener("input",()=>{draft[id].woodcuttingXp=xp.valueAsNumber;updateSave();});xpCell.append(xp);tr.append(xpCell);
    for(const text of [String(t.hardness)+" / "+String(t.woodcuttingXp),t.dropItem==="wood"?"Wood":t.dropItem.replaceAll("_"," "),["regular","oak"].includes(id)?"On map":"Not on map"]){const td=document.createElement("td");td.textContent=text;tr.append(td);}
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
    defaults=base;baseline=Object.fromEntries(Object.entries(applyHardnessOverrides(base,overrides)).map(([id,t])=>[id,{hardness:t.hardness,woodcuttingXp:t.woodcuttingXp}]));draft=structuredClone(baseline);allowed=true;content.hidden=false;status.textContent="";render();
  }catch(e){if(run===generation)deny("Could not load server tree settings. Check Firestore rules or reopen the tab.");console.error(e);}
}
watchStaffRole(role=>{if(role!==true){deny(role===null?"Verifying staff access…":"Administrator access required.");return;}if(!allowed)void load();});
$("admin-main-tab-rpg").addEventListener("click",()=>{if(!allowed)void load();});
$("rpg-tree-refresh").addEventListener("click",()=>{if(!busy)void load();});
search.addEventListener("input",render);
$("rpg-tree-form").addEventListener("submit",async event=>{
  event.preventDefault();if(!allowed||busy||!valid())return;
  const changes=Object.entries(draft).filter(([id])=>changed(id));if(!changes.length)return;
  const run=generation;busy=true;render();status.textContent="Saving tree settings…";
  try{
    if(!await verifyStaff())throw Error("Administrator access required");
    if(run!==generation)return;
    const batch=writeBatch(db);for(const [id,values] of changes)batch.set(doc(db,"rpgTreeTypes",id),{...values,updatedAt:serverTimestamp()});
    await batch.commit();if(run!==generation)return;
    baseline=structuredClone(draft);status.textContent="Saved. New game sessions will use these hardness and XP values.";
  }catch(e){if(run===generation)status.textContent="Save failed. Check staff permissions and deployed Firestore rules.";console.error(e);}
  finally{if(run===generation){busy=false;render();}}
});
