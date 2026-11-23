// Per-account, owner-managed SITE access exception. This never sets
// Firebase Auth's emailVerified flag, and may not be used to claim that
// someone has proved ownership of their email address.
import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {doc,getDocFromServer,onSnapshot} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const overrides=new Map();
function exceptionFromSnapshot(snapshot){
  const data=snapshot.exists()?snapshot.data():null;
  return data?.enabled===true&&typeof data.targetEmail==="string"
    ? {enabled:true,targetEmail:data.targetEmail} : null;
}
let stopOverride=()=>{};
let pendingCheck=null;
let pendingCheckKey="";

export function hasSiteVerificationAccess(user){
  return !!user && (user.emailVerified===true || hasOwnerVerificationBypass(user));
}
export function hasOwnerVerificationBypass(user){
  return !!user && overrides.get(user.uid)?.enabled===true
    && overrides.get(user.uid).targetEmail===user.email;
}
function publish(user){
  if(!user || auth.currentUser?.uid!==user.uid)return;
  window.dispatchEvent(new CustomEvent("princesstg:verification-access-changed",{
    detail:{uid:user.uid,allowed:hasSiteVerificationAccess(user),
      bypassed:hasOwnerVerificationBypass(user)}
  }));
}
// Return one shared, server-confirmed result for the initial page load.
// A cached "not verified" result must not briefly open the verification modal
// while the owner's bypass is still being loaded from Firestore.
export function refreshSiteVerificationAccess(user){
  if(!user||auth.currentUser?.uid!==user.uid)return Promise.resolve(false);
  if(user.emailVerified===true)return Promise.resolve(true);
  const key=user.uid+"|"+(user.email||"");
  if(pendingCheck && pendingCheckKey===key)return pendingCheck;
  pendingCheckKey=key;
  const attempt=(async()=>{
    try{
      const snapshot=await getDocFromServer(doc(db,"verificationOverrides",user.uid));
      if(auth.currentUser?.uid!==user.uid)return false;
      overrides.set(user.uid,exceptionFromSnapshot(snapshot));
      publish(user);
      return hasSiteVerificationAccess(user);
    }catch(error){
      // If lookup fails, keep verification restrictions enabled. A bypass
      // cannot be granted from localStorage or a Firestore cache.
      if(auth.currentUser?.uid===user.uid){
        overrides.delete(user.uid);
        publish(user);
      }
      console.warn("Verification exception lookup unavailable:",error?.code||error);
      return false;
    }
  })();
  pendingCheck=attempt;
  void attempt.finally(()=>{
    if(pendingCheck===attempt){
      pendingCheck=null;
      pendingCheckKey="";
    }
  });
  return attempt;
}

// Listen for grants AND revocations. A revoked exception immediately locks
// verified-only UI; Firestore rules independently deny subsequent writes.
onAuthStateChanged(auth,user=>{
  stopOverride();
  stopOverride=()=>{};
  overrides.clear();
  pendingCheck=null;
  pendingCheckKey="";
  if(!user)return;
  if(user.emailVerified===true){
    publish(user);
    return;
  }
  stopOverride=onSnapshot(doc(db,"verificationOverrides",user.uid),
  {includeMetadataChanges:true},snapshot=>{
    if(auth.currentUser?.uid!==user.uid||snapshot.metadata.fromCache)return;
    overrides.set(user.uid,exceptionFromSnapshot(snapshot));
    publish(user);
  },error=>{
    overrides.delete(user.uid);
    publish(user);
    console.warn("Verification exception listener unavailable:",error?.code||error);
  });
});
