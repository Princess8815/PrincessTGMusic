import { verifyStaff,watchStaffRole } from "../../script/staff-auth.js";
import { db } from "../../script/firebase.js";
import { doc,writeBatch,serverTimestamp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { SKILLS,defaultSkillSettings,mergeSkillSettings,validSkillSettings,xpForLevel,xpCost } from "./skills.js";
import { readSkillOverrides } from "./skill-config.js";
const $=id=>document.getElementById(id);
const content=$("rpg-skill-content"),status=$("rpg-skill-status"),rows=$("rpg-skill-rows"),save=$("rpg-skill-save");
const fields=[["startLevel",1,30,"Starting level"],["baseXp",1,100000,"Base XP"],["growthPercent",1,100,"Growth percent"]];
let allowed=false,busy=false,generation=0,baseline={},draft={};
function changed(id){return fields.some(([key])=>draft[id][key]!==baseline[id][key]);}
function valid(){return SKILLS.every(s=>validSkillSettings(draft[s.id]));}
function deny(message){generation++;allowed=false;busy=false;content.hidden=true;rows.replaceChildren();save.disabled=true;status.textContent=message;}
function updateSave(){save.disabled=!allowed||busy||!valid()||!SKILLS.some(s=>changed(s.id));}
function render(){
  if(!allowed)return;
  rows.replaceChildren(...SKILLS.map(s=>{
    const tr=document.createElement("tr"),name=document.createElement("td");name.textContent=s.name;tr.append(name);
    const total=document.createElement("td"),next=document.createElement("td");
    function preview(){const d=draft[s.id];total.textContent=validSkillSettings(d)?xpForLevel(d.startLevel,d).toLocaleString():"Invalid";next.textContent=validSkillSettings(d)?xpCost(d.startLevel,d).toLocaleString():"Invalid";updateSave();}
    for(const [key,min,max,label] of fields){
      const td=document.createElement("td"),input=document.createElement("input");
      input.type="number";input.min=String(min);input.max=String(max);input.step="1";input.required=true;input.className="rpg-tree-hardness";input.value=Number.isFinite(draft[s.id][key])?String(draft[s.id][key]):"";input.disabled=busy;input.setAttribute("aria-label",s.name+" "+label);
      input.addEventListener("input",()=>{draft[s.id][key]=input.valueAsNumber;preview();});td.append(input);tr.append(td);
    }
    tr.append(total,next);preview();return tr;
  }));
  $("rpg-skill-defaults").disabled=busy;updateSave();
}
async function load(){
  const run=++generation;allowed=false;busy=false;content.hidden=true;save.disabled=true;status.textContent="Verifying staff access…";
  try{
    if(!await verifyStaff()){if(run===generation)deny("Administrator access required.");return;}
    if(run!==generation)return;
    const overrides=await readSkillOverrides();if(run!==generation)return;
    baseline=mergeSkillSettings(overrides);draft=structuredClone(baseline);allowed=true;content.hidden=false;status.textContent="";render();
  }catch(e){if(run===generation)deny("Could not load skill settings. Check deployed Firestore rules.");console.error(e);}
}
watchStaffRole(role=>{if(role!==true){deny(role===null?"Verifying staff access…":"Administrator access required.");return;}if(!allowed)void load();});
$("admin-main-tab-rpg").addEventListener("click",()=>{if(!allowed)void load();});
$("rpg-skill-refresh").addEventListener("click",()=>{if(!busy)void load();});
$("rpg-skill-defaults").addEventListener("click",()=>{if(allowed&&!busy){draft=defaultSkillSettings();render();}});
$("rpg-skill-form").addEventListener("submit",async event=>{
  event.preventDefault();if(!allowed||busy||!valid())return;
  const changes=SKILLS.filter(s=>changed(s.id));if(!changes.length)return;
  const run=generation;busy=true;render();status.textContent="Saving skill settings…";
  try{
    if(!await verifyStaff())throw Error("Administrator access required");
    if(run!==generation)return;
    const batch=writeBatch(db);for(const s of changes)batch.set(doc(db,"rpgSkillSettings",s.id),{...draft[s.id],updatedAt:serverTimestamp()});
    await batch.commit();if(run!==generation)return;
    baseline=structuredClone(draft);status.textContent="Saved. New game sessions use these settings.";
  }catch(e){if(run===generation)status.textContent="Save failed. Check staff permissions and deployed Firestore rules.";console.error(e);}
  finally{if(run===generation){busy=false;render();}}
});
