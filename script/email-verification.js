import {publicError} from "./site-errors.js";
// Shared verification flow. Firebase still validates the action link;
// production delivery is handled by the trusted Cloudflare Worker and Resend.
import {auth,usingLocalFirebaseEmulators} from "./firebase.js";
import {sendEmailVerification,reload} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

const checks=new Map();
const sends=new Map();
let notifiedUid="";

export function verificationError(error){
  return publicError(error,"PTG-108");
}

export async function sendSiteVerification(user){
  if(!user || auth.currentUser?.uid!==user.uid){
    const error=new Error("The signed-in account changed. Sign in to the account that needs verification.");
    error.code="auth/account-mismatch";
    throw error;
  }
  if(user.emailVerified)return {alreadyVerified:true,usedReturnLink:false};
  if(!user.email){
    const error=new Error("No email address is associated with this account.");
    error.code="auth/missing-email";
    throw error;
  }
  // Two verification buttons exist (login and profile mail). Deduplicate
  // simultaneous requests for this UID to avoid accidental rapid repeats.
  if(sends.has(user.uid))return sends.get(user.uid);
  const pending=(async()=>{
    if(usingLocalFirebaseEmulators){
      await sendEmailVerification(user);
      return {alreadyVerified:false,usedReturnLink:false,recipient:user.email};
    }
    const idToken=await user.getIdToken(true);
    if(auth.currentUser?.uid!==user.uid)throw Object.assign(Error("Account changed."),{code:"auth/account-mismatch"});
    const response=await fetch("https://princesstg-cd-store-live.transgirl1991.workers.dev/auth/email-verification",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken})
    });
    const data=await response.json();
    if(!response.ok)throw Object.assign(Error("Verification email unavailable."),{code:response.status===429?"auth/too-many-requests":"PTG-108"});
    if(data.alreadyVerified===true){await refreshSiteVerification(user);return {alreadyVerified:true,usedReturnLink:false};}
    if(data.accepted!==true)throw Error("Verification email unavailable.");
    return {alreadyVerified:false,usedReturnLink:false,recipient:user.email};
  })();
  sends.set(user.uid,pending);
  try{return await pending;}
  finally{if(sends.get(user.uid)===pending)sends.delete(user.uid);}
}

export async function refreshSiteVerification(user){
  if(!user || auth.currentUser?.uid!==user.uid)return false;
  if(checks.has(user.uid))return checks.get(user.uid);
  const task=(async()=>{
    await reload(user);
    if(auth.currentUser?.uid!==user.uid)return false;
    if(!user.emailVerified)return false;
    // Security rules and other Firebase services must receive the new claim.
    await user.getIdToken(true);
    if(auth.currentUser?.uid!==user.uid)return false;
    if(notifiedUid!==user.uid){
      notifiedUid=user.uid;
      window.dispatchEvent(new CustomEvent("princesstg:email-verified",{
        detail:{uid:user.uid}
      }));
    }
    return true;
  })();
  checks.set(user.uid,task);
  try{return await task;}
  finally{if(checks.get(user.uid)===task)checks.delete(user.uid);}
}
