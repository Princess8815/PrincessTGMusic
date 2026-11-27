import {watchSelfMembership,setSelfMembership,selfMembership,previewMembership,membershipLookupError} from "./staff-membership.js";
import {toggleMembership} from "./staff-membership-core.mjs";
const $=id=>document.getElementById(id),panel=$("admin-self-membership"),badge=$("admin-self-membership-badge"),toggle=$("admin-self-membership-toggle"),note=$("admin-self-membership-note"),message=$("admin-self-membership-message");
let state={ready:false},busy=false;
function render(){
 panel.hidden=!state.staff;
 if(panel.hidden)return;
 if(!state.ready){badge.textContent=state.error?"Unavailable":"Checking…";delete badge.dataset.membership;toggle.disabled=true;note.textContent=state.error?membershipLookupError(state):"Checking membership permissions…";return;}
 const m=selfMembership(state);
 badge.textContent=m.status==="paid"?"Paid":"Free";badge.dataset.membership=m.status;
 toggle.textContent=m.status==="paid"?"Switch to Free":"Switch to Paid";
 toggle.setAttribute("aria-pressed",String(m.status==="paid"));
 toggle.disabled=busy;
 note.textContent=(previewMembership()?"Preview only · ":"")+(m.complimentary?"Complimentary staff membership · No expiration while active staff.":"Free member view enabled.")+" Purchased membership: "+(m.actualStatus==="paid"?"Paid until "+new Date(m.expiresAt).toLocaleString():"Free")+". Your role and expiration are unchanged.";
}
watchSelfMembership(next=>{if(state.uid!==next.uid)message.textContent="";state=next;render();});
async function change(mode){if(busy||!state.ready||!state.staff)return;const uid=state.uid;busy=true;render();message.textContent="Saving…";try{await setSelfMembership(mode,uid);if(state.uid===uid){message.textContent=mode==="actual"?"Complimentary Paid membership restored.":"Free member view enabled.";document.dispatchEvent(new Event("ptg:membership-override-changed"));}}catch(e){if(state.uid===uid)message.textContent=e.message||"Unable to save membership mode.";}finally{busy=false;render();}}
toggle.onclick=()=>change(toggleMembership(selfMembership(state)));setInterval(render,1000);
