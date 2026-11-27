import {auth,usingLocalFirebaseEmulators} from "./firebase.js";
import {STORE_WORKER_URL} from "./store-config.js";
export const digitalMode=()=>STORE_WORKER_URL.includes("-live.")?"live":"test";
export const digitalAvailable=()=>!usingLocalFirebaseEmulators;
export const liveDigital=()=>digitalMode()==="live"&&digitalAvailable();
export async function digitalRequest(action,extra={},authenticated=true){
 if(!digitalAvailable())throw Error("Use Live Firebase authentication to test Stripe sandbox checkout. No real payment or rewards will be issued on a preview.");
 let idToken;const user=auth.currentUser;
 if(authenticated){if(!user?.emailVerified)throw Error("Sign in and verify your email.");idToken=await user.getIdToken();if(auth.currentUser?.uid!==user.uid)throw Error("Account changed.");}
 const r=await fetch(STORE_WORKER_URL+"/digital-packs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...extra,idToken})});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(d.error||"Digital store unavailable."),{status:r.status});return d;
}
export const money=c=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(c/100);
export const packBenefit=p=>p.kind==="membership"?p.days.toLocaleString()+" days of Paid membership":p.coins.toLocaleString()+" Star Coins";
