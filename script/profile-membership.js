import {auth} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {memberStatus} from "./digital-packs-core.mjs";
import {digitalMode,digitalAvailable,digitalRequest} from "./digital-packs-api.js";
import {watchSelfMembership,selfMembership,previewMembership} from "./staff-membership.js";
const $=id=>document.getElementById(id);let state={ready:false};
function render(){
 const status=$("profile-membership-status"),remaining=$("profile-membership-remaining"),end=$("profile-membership-end"),note=$("profile-membership-override");
 if(!state.ready){status.textContent=state.error?"Unavailable":"Checking…";delete status.dataset.membership;remaining.textContent=state.error?"Refresh to retry.":"";end.textContent="";note.hidden=true;return;}
 const m=selfMembership(state);
 status.textContent=m.status==="paid"?"Paid":"Free";status.dataset.membership=m.status;
 if(m.actualStatus==="paid"){const seconds=Math.ceil(m.remainingMs/1000),days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);remaining.textContent=(m.override!=="actual"?"Purchased time: ":"")+days+"d "+hours+"h "+minutes+"m "+seconds%60+"s remaining";end.textContent="Expires "+new Date(m.expiresAt).toLocaleString();}
 else{remaining.textContent="No active purchased membership.";end.textContent=m.expiresAt?"Expired "+new Date(m.expiresAt).toLocaleString():"";}
 note.hidden=m.override==="actual";
 if(!note.hidden)note.textContent=(previewMembership()?"Preview-only ":"")+"Admin test override: "+m.status.toUpperCase()+". Actual membership: "+(m.actualStatus==="paid"?"Paid":"Free")+". Restore actual membership in Admin → Accounts.";
}
watchSelfMembership(next=>{state=next;render();});
setInterval(()=>{if(state.ready)render();},1000);window.addEventListener("focus",render);
async function previewBalance(){const user=auth.currentUser,el=$("profile-test-membership");if(!el)return;el.hidden=digitalMode()!=="test"||!digitalAvailable()||!user?.emailVerified;if(el.hidden)return;try{const d=await digitalRequest("testBalance");if(auth.currentUser?.uid!==user.uid)return;const m=memberStatus(d.expiresAt);el.textContent="Sandbox only: "+(m.status==="paid"?"Paid until "+new Date(m.expiresAt).toLocaleString():"Free")+" · "+d.balance.toLocaleString()+" test Star Coins (not real balance).";}catch(e){el.textContent="Sandbox balance unavailable: "+e.message;}}
onAuthStateChanged(auth,previewBalance);window.addEventListener("focus",previewBalance);
