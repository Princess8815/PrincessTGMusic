// Shared Firebase email-verification flow for registration, login and Site Mail.
// Firebase's own hosted action handler processes the emailed link.
// Do not specify a custom continue URL: it can make mail sending fail when
// the GitHub Pages domain isn't in the Firebase authorized-domain list.
import {auth} from "./firebase.js";
import {sendEmailVerification,reload} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

const checks=new Map();
const sends=new Map();
let notifiedUid="";

export function verificationError(error){
  const code=error?.code||"";
  switch(code){
    case "auth/too-many-requests":
      return "Firebase blocked additional verification requests temporarily. This may affect several test accounts using the same IP. Stop retrying for now and inspect Firebase Authentication limits. ("+code+")";
    case "auth/network-request-failed":
      return "Connection lost. Check your internet and try again.";
    case "auth/user-token-expired":
    case "auth/requires-recent-login":
    case "auth/user-disabled":
      return "This login expired or is disabled. Sign out and sign in again.";
    case "auth/invalid-email":
      return "This account has an invalid email address. ("+code+")";
    case "auth/missing-email":
      return "This login does not have an email address for Firebase to verify. ("+code+")";
    case "auth/unauthorized-continue-uri":
    case "auth/invalid-continue-uri":
    case "auth/unauthorized-domain":
      return "Firebase rejected the verification link domain. Check Authentication → Settings → Authorized domains. ("+code+")";
    case "auth/quota-exceeded":
      return "Firebase's email sending quota was reached. Check Authentication usage and retry when the limit resets. ("+code+")";
    case "auth/operation-not-allowed":
      return "Email/password sign-in may not be enabled in Firebase Authentication. ("+code+")";
    default:
      // Expose the Firebase error code rather than hiding the root cause
      // behind a generic 'Something went wrong' message.
      return (error?.message ? String(error.message).slice(0,160) : "Verification request failed.")+
        (code?" ("+code+")":"");
  }
}

export async function sendSiteVerification(user){
  if(!user || auth.currentUser?.uid!==user.uid){
    const error=new Error("The signed-in account changed. Sign in to the account that needs verification.");
    error.code="auth/account-mismatch";
    throw error;
  }
  if(user.emailVerified)return {alreadyVerified:true,usedReturnLink:false};
  if(!user.email){
    const error=new Error("No email address is associated with the current Firebase account.");
    error.code="auth/missing-email";
    throw error;
  }
  // Two verification buttons exist (login and profile mail). Deduplicate
  // simultaneous requests for this UID to avoid accidental rapid repeats.
  if(sends.has(user.uid))return sends.get(user.uid);
  const pending=(async()=>{
    // Firebase Auth sends to user.email, not an arbitrary entered address.
    // No Cloud Function or Firestore permission is involved in delivery.
    await sendEmailVerification(user);
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
