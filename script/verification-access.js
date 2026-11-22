// Per-account, owner-managed SITE access exception. This never sets
// Firebase Auth's emailVerified flag, and may not be used to claim that
// someone has proved ownership of their email address.
import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {doc,getDoc,onSnapshot} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const overrides=new Map();
let stopOverride=()=>{};

export function hasSiteVerificationAccess(user){
  return !!user && (user.emailVerified===true || overrides.get(user.uid)===true);
}
export function hasOwnerVerificationBypass(user){
  return !!user && overrides.get(user.uid)===true;
}
function publish(user){
  if(!user || auth.currentUser?.uid!==user.uid)return;
  window.dispatchEvent(new CustomEvent("princesstg:verification-access-changed",{
    detail:{uid:user.uid,allowed:hasSiteVerificationAccess(user),
      bypassed:hasOwnerVerificationBypass(user)}
  }));
}
export async function refreshSiteVerificationAccess(user){
  if(!user||auth.currentUser?.uid!==user.uid)return false;
  if(user.emailVerified===true)return true;
  try{
    const snapshot=await getDoc(doc(db,"verificationOverrides",user.uid));
    if(auth.currentUser?.uid!==user.uid)return false;
    const allowed=snapshot.exists() && snapshot.data().enabled===true;
    overrides.set(user.uid,allowed);
    publish(user);
    return allowed;
  }catch(error){
    overrides.delete(user.uid);
    publish(user);
    console.warn("Verification exception lookup unavailable:",error?.code||error);
    return false;
  }
}

// Listen for grants AND revocations. A revoked exception immediately locks
// verified-only UI; Firestore rules independently deny subsequent writes.
onAuthStateChanged(auth,user=>{
  stopOverride();
  stopOverride=()=>{};
  overrides.clear();
  if(!user)return;
  if(user.emailVerified===true){
    publish(user);
    return;
  }
  stopOverride=onSnapshot(doc(db,"verificationOverrides",user.uid),snapshot=>{
    if(auth.currentUser?.uid!==user.uid)return;
    overrides.set(user.uid,snapshot.exists()&&snapshot.data().enabled===true);
    publish(user);
  },error=>{
    overrides.delete(user.uid);
    publish(user);
    console.warn("Verification exception listener unavailable:",error?.code||error);
  });
});
