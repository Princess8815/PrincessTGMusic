import {FEATURES,validateMilestones} from "./orange-knock-down-core.mjs";
import {editorRequest} from "./orange-editor-api.js";
const $=id=>document.getElementById(id);
let loaded=false,busy=false;
const fields=new Map();
async function load(){
 if(loaded||busy)return;busy=true;$("orange-admin-status").textContent="Loading milestones…";
 try{const {milestones}=await editorRequest("config");$("orange-unlock-fields").replaceChildren();
 for(const f of FEATURES){const row=document.createElement("label");row.style.display="grid";row.style.gridTemplateColumns="minmax(0,1fr) 110px";row.style.gap="12px";row.style.margin="8px 0";const name=document.createElement("span");name.textContent=f.name;const i=document.createElement("input");i.type="number";i.min=1;i.max=1000000;i.required=true;i.value=milestones[f.id];i.disabled=f.id==="wood";row.append(name,i);$("orange-unlock-fields").append(row);fields.set(f.id,i);}
 loaded=true;$("orange-unlock-save").disabled=false;$("orange-admin-status").textContent="Levels unlock upon completing the previous level. Wood starts at level 1.";
 }catch(e){$("orange-admin-status").textContent=e.message;}finally{busy=false;}
}
$("admin-main-tab-orange").addEventListener("click",load);document.addEventListener("ptg:orange-admin-open",load);if(["#admin-orange","#admin-games","#admin-games-orange"].includes(location.hash))void load();
$("orange-unlock-form").onsubmit=async e=>{e.preventDefault();if(!loaded||busy)return;busy=true;$("orange-unlock-save").disabled=true;try{const milestones=validateMilestones(Object.fromEntries([...fields].map(([id,i])=>[id,Number(i.value)])));if(!confirm("Save new campaign unlock levels? Existing attempts keep their current layout and schedule."))return;await editorRequest("milestones",{milestones},true);$("orange-admin-status").textContent="Unlock schedule saved.";}catch(e){$("orange-admin-status").textContent=e.message;}finally{busy=false;$("orange-unlock-save").disabled=false;}};
