import {publicError} from "./site-errors.js";
// Shared verification flow. Firebase still validates the action link;
// production delivery is handled by the trusted Cloudflare Worker and Resend.
import {auth,usingLocalFirebaseEmulators} from "./firebase.js";
import {sendEmailVerification,reload} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

const checks=new Map();
const sends=new Map();
const cooldownChecks=new Map();
const emulatorDeadlines=new Map();
const endpoint="https://princesstg-cd-store-live.transgirl1991.workers.dev/auth/email-verification";
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
      emulatorDeadlines.set(user.uid,Date.now()+60000);
      return {alreadyVerified:false,usedReturnLink:false,recipient:user.email,retryAfterMs:60000};
    }
    const idToken=await user.getIdToken(true);
    if(auth.currentUser?.uid!==user.uid)throw Object.assign(Error("Account changed."),{code:"auth/account-mismatch"});
    const response=await fetch(endpoint,{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,actionPage:true})
    });
    const data=await response.json();
    if(!response.ok)throw Object.assign(Error("Verification email unavailable."),{code:response.status===429?"auth/too-many-requests":"PTG-108"});
    if(data.alreadyVerified===true){await refreshSiteVerification(user);return {alreadyVerified:true,usedReturnLink:false};}
    if(data.accepted!==true)throw Error("Verification email unavailable.");
    return {alreadyVerified:false,usedReturnLink:false,recipient:user.email,retryAfterMs:Number.isFinite(data.retryAfterMs)?data.retryAfterMs:60000};
  })();
  sends.set(user.uid,pending);
  const notify=(phase,result)=>window.dispatchEvent(new CustomEvent("princesstg:verification-resend",{detail:{uid:user.uid,phase,result}}));
  notify("sending");
  try{const result=await pending;notify("sent",result);return result;}
  catch(error){notify("failed");throw error;}
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

// The Worker is authoritative. Only the visual countdown uses the browser clock.
export async function checkVerificationCooldown(user){
 if(!user||auth.currentUser?.uid!==user.uid)throw Error("Account changed.");
 if(user.emailVerified)return {alreadyVerified:true,retryAfterMs:0};
 if(usingLocalFirebaseEmulators)return {alreadyVerified:false,retryAfterMs:Math.max(0,(emulatorDeadlines.get(user.uid)||0)-Date.now())};
 if(cooldownChecks.has(user.uid))return cooldownChecks.get(user.uid);
 const task=(async()=>{
  const idToken=await user.getIdToken();
  if(auth.currentUser?.uid!==user.uid)throw Error("Account changed.");
  const response=await fetch(endpoint+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken})});
  const data=await response.json();
  if(!response.ok||typeof data.alreadyVerified!=="boolean"||!Number.isFinite(data.retryAfterMs)||data.retryAfterMs<0)throw Error("Could not check resend availability.");
  if(data.alreadyVerified)await refreshSiteVerification(user);
  return data;
 })();
 cooldownChecks.set(user.uid,task);
 try{return await task;}finally{if(cooldownChecks.get(user.uid)===task)cooldownChecks.delete(user.uid);}
}
export function bindVerificationCooldown(button,label){
 let activeUid="",deadline=0,phase="idle",revision=0;
 const visible=()=>button.isConnected&&button.getClientRects().length>0&&document.visibilityState==="visible";
 const paint=()=>{
  const seconds=Math.max(0,Math.ceil((deadline-performance.now())/1000));
  button.disabled=phase!=="ready";
  button.style.opacity=button.disabled?"0.5":"";
  const text=phase==="checking"?"Checking resend availability…":phase==="sending"?"Sending verification email…":phase==="waiting"?"You can resend in "+seconds+" seconds.":phase==="error"?"Could not check resend availability. Close and reopen verification to retry.":phase==="verified"?"Email already verified. Refresh the page if needed.":"";
  if(label.textContent!==text)label.textContent=text;
 };
 const check=async user=>{
  const version=++revision;phase="checking";paint();
  try{
   const result=await checkVerificationCooldown(user);
   if(version!==revision||activeUid!==user.uid)return;
   deadline=performance.now()+result.retryAfterMs;
   phase=result.alreadyVerified?"verified":result.retryAfterMs>0?"waiting":"ready";
  }catch{if(version===revision)phase="error";}
  if(version===revision)paint();
 };
 const tick=()=>{
  const user=auth.currentUser;
  if(!visible()||!user){if(activeUid){activeUid="";revision++;phase="idle";paint();}return;}
  if(activeUid!==user.uid){activeUid=user.uid;deadline=0;void check(user);return;}
  if(phase==="waiting"&&performance.now()>=deadline){void check(user);return;}
  paint();
 };
 window.addEventListener("princesstg:verification-resend",event=>{
  const detail=event.detail,user=auth.currentUser;
  if(!user||detail?.uid!==user.uid||!visible())return;
  activeUid=user.uid;revision++;
  if(detail.phase==="sending")phase="sending";
  else if(detail.phase==="sent"){
   deadline=performance.now()+(detail.result.retryAfterMs||0);
   phase=detail.result.alreadyVerified?"verified":deadline>performance.now()?"waiting":"ready";
  }else{void check(user);return;}
  paint();
 });
 // No periodic network polling: this timer updates only the label and detects
 // opening the panel or reaching the locally displayed deadline.
 const timer=setInterval(tick,250);
 document.addEventListener("visibilitychange",tick);
 window.addEventListener("pagehide",event=>{if(!event.persisted)clearInterval(timer);});
 tick();
 return tick;
}
