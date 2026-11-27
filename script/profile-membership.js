import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {doc,onSnapshot} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {memberStatus} from "./digital-packs-core.mjs";
const $=id=>document.getElementById(id);let stop=()=>{},expiry=null,known=false;
function render(){const status=$("profile-membership-status"),remaining=$("profile-membership-remaining"),end=$("profile-membership-end");if(!known){status.textContent="Checking…";remaining.textContent="";end.textContent="";return;}
 const m=memberStatus(expiry);status.textContent=m.status==="paid"?"Paid":"Free";status.dataset.membership=m.status;
 if(m.status==="paid"){const seconds=Math.ceil(m.remainingMs/1000),days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);remaining.textContent=days+"d "+hours+"h "+minutes+"m "+seconds%60+"s remaining";end.textContent="Expires "+new Date(m.expiresAt).toLocaleString();}
 else{remaining.textContent="No active paid membership.";end.textContent=m.expiresAt?"Expired "+new Date(m.expiresAt).toLocaleString():"";}
}
onAuthStateChanged(auth,user=>{stop();expiry=null;known=false;render();if(!user)return;
 stop=onSnapshot(doc(db,"memberships",user.uid),{includeMetadataChanges:true},snap=>{if(auth.currentUser?.uid!==user.uid||snap.metadata.fromCache)return;expiry=snap.data()?.expiresAt?.toMillis?.()??null;known=true;render();},()=>{if(auth.currentUser?.uid===user.uid){known=false;$("profile-membership-status").textContent="Unavailable";$("profile-membership-remaining").textContent="Refresh to retry.";}});});
setInterval(()=>{if(known)render();},1000);window.addEventListener("focus",render);
