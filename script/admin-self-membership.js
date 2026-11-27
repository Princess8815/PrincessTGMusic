import {watchSelfMembership,setSelfMembership,selfMembership,previewMembership} from "./staff-membership.js";
import {toggleMembership} from "./staff-membership-core.mjs";
const $=id=>document.getElementById(id),panel=$("admin-self-membership"),badge=$("admin-self-membership-badge"),toggle=$("admin-self-membership-toggle"),reset=$("admin-self-membership-reset"),note=$("admin-self-membership-note"),message=$("admin-self-membership-message");
let state={ready:false},busy=false;
function render(){
 panel.hidden=!state.ready||!state.staff;
 if(panel.hidden)return;
 const m=selfMembership(state);
 badge.textContent=m.status==="paid"?"Paid":"Free";badge.dataset.membership=m.status;
 toggle.textContent="Switch self to "+(m.status==="paid"?"Free":"Paid");
 toggle.setAttribute("aria-pressed",String(m.status==="paid"));
 toggle.disabled=busy;reset.disabled=busy||m.override==="actual";
 note.textContent=(previewMembership()?"Preview only · ":"")+(m.override==="actual"?"Using normal purchased membership.":"Admin test override: "+m.override.toUpperCase()+".")+" Purchased membership: "+(m.actualStatus==="paid"?"Paid until "+new Date(m.expiresAt).toLocaleString():"Free")+". Your role and expiration are unchanged.";
}
watchSelfMembership(next=>{if(state.uid!==next.uid)message.textContent="";state=next;render();});
async function change(mode){if(busy||!state.ready||!state.staff)return;const uid=state.uid;busy=true;render();message.textContent="Saving…";try{await setSelfMembership(mode,uid);if(state.uid===uid){message.textContent=mode==="actual"?"Normal membership restored.":"Self-test mode saved.";document.dispatchEvent(new Event("ptg:membership-override-changed"));}}catch(e){if(state.uid===uid)message.textContent=e.message||"Unable to save membership mode.";}finally{busy=false;render();}}
toggle.onclick=()=>change(toggleMembership(selfMembership(state)));reset.onclick=()=>change("actual");setInterval(render,1000);
