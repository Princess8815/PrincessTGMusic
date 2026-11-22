// Shared Firebase email-verification flow for registration, login and Site Mail.
// Firebase's hosted action handler processes the emailed link. The optional
// continue URL returns the member to their profile afterwards.
import {auth} from "./firebase.js";
import {sendEmailVerification,reload} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

const currentReturnURL=()=>new URL("../pages/profile.html?emailVerification=1#tab-mail",import.meta.url).href;
const checks=new Map();
let notifiedUid="";

export function verificationError(error){
  const code=error?.code||"";
  switch(code){
    case "auth/too-many-requests":
      return "Firebase is temporarily limiting verification emails. Try again later.";
    case "auth/network-request-failed":
      return "Connection lost. Check your internet and try again.";
    case "auth/user-token-expired":
    case "auth/requires-recent-login":
    case "auth/user-disabled":
      return "This login expired or is disabled. Sign out and sign in again.";
    case "auth/invalid-email":
      return "This account has an invalid email address.";
    case "auth/unauthorized-continue-uri":
    case "auth/invalid-continue-uri":
      return "The website must be added under Firebase Authentication → Authorized domains.";
    default:
      return error?.message ? String(error.message).slice(0,180) : "Verification could not be completed.";
  }
}

export async function sendSiteVerification(user){
  if(!user || auth.currentUser?.uid!==user.uid)
    throw Error("Sign in to the account that needs verification.");
  if(user.emailVerified)return {alreadyVerified:true,usedReturnLink:false};
  const settings={url:currentReturnURL(),handleCodeInApp:false};
  try{
    await sendEmailVerification(user,settings);
    return {alreadyVerified:false,usedReturnLink:true};
  }catch(error){
    // A not-yet-authorized custom website domain should not make email
    // verification impossible. The default Firebase hosted action link still
    // works; the member returns to the site manually after confirming it.
    if(["auth/unauthorized-continue-uri","auth/invalid-continue-uri"].includes(error?.code)){
      await sendEmailVerification(user);
      return {alreadyVerified:false,usedReturnLink:false,needsAuthorizedDomain:true};
    }
    throw error;
  }
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
