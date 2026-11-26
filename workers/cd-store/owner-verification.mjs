
import {accessToken,verifyFirebaseIdentity} from "./rewards.js";
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const val=(doc,key)=>doc?.fields?.[key]?.stringValue;
const str=stringValue=>({stringValue});
export async function approveVerification({actorUid,input,read,lookup,markVerified,audit,finish,clock=Date.now,makeId=()=>crypto.randomUUID()}){
 const uid=input?.targetUid;
 if(!["status","grant"].includes(input?.action)||typeof uid!=="string"||!uid||uid.length>128||uid.includes("/")||uid===actorUid)fail("Choose another account.");
 const [actor,target]=await Promise.all([read("users/"+actorUid),read("users/"+uid)]);
 if(val(actor,"role")!=="owner"||(val(actor,"status")||"active")!=="active")fail("Active site owner required.",403);
 if(!target||val(target,"role")==="owner"||(val(target,"status")||"active")!=="active")fail("Protected or inactive account.",403);
 const [owner,account]=await Promise.all([lookup(actorUid),lookup(uid)]);
 if(!owner||owner.disabled||owner.emailVerified!==true)fail("Verified owner required.",403);
 if(!account||account.disabled||!account.email)fail("Active email account required.",409);
 if(account.email!==target.fields?.auth?.mapValue?.fields?.email?.stringValue)fail("Account email changed. Refresh its profile first.",409);
 if(input.action==="status")return {email:account.email,emailVerified:account.emailVerified===true};
 if(input.expectedEmail!==account.email)fail("Email changed. Review the account again.",409);
 if(account.emailVerified===true)return {email:account.email,emailVerified:true,alreadyVerified:true};
 const id=makeId();
 await audit(id,{actorUid:str(actorUid),targetUid:str(uid),targetEmail:str(account.email),status:str("pending"),createdAt:{timestampValue:new Date(clock()).toISOString()}},actor,target);
 await markVerified(uid,account.email);
 const verified=await lookup(uid);
 if(!verified||verified.email!==account.email||verified.emailVerified!==true)fail("Verification not confirmed. Review account status.",503);
 await finish(id,{status:str("verified"),completedAt:{timestampValue:new Date(clock()).toISOString()}});
 return {email:verified.email,emailVerified:true};
}
export async function ownerVerification(env,input){
 if(env.STORE_MODE!=="live"||!env.FIREBASE_PROJECT||env.REWARD_FIREBASE_PROJECT!==env.FIREBASE_PROJECT)fail("Live verification unavailable.",503);
 const project=env.FIREBASE_PROJECT,actorUid=await verifyFirebaseIdentity(project,input?.idToken,true);
 const token=await accessToken(env,project),root="projects/"+project+"/databases/(default)/documents",base="https://firestore.googleapis.com/v1/"+root;
 const headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 const read=async path=>{const r=await fetch(base+"/"+path.split("/").map(encodeURIComponent).join("/"),{headers});if(r.status===404)return null;if(!r.ok)fail("Account storage unavailable.",503);return r.json();};
 let authToken;
 const authCall=async(action,body)=>{
  authToken||=await accessToken(env,project,"https://www.googleapis.com/auth/identitytoolkit");
  const r=await fetch("https://identitytoolkit.googleapis.com/v1/projects/"+encodeURIComponent(project)+"/accounts:"+action,{method:"POST",headers:{Authorization:"Bearer "+authToken,"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok)fail(r.status===403?"Worker service account requires Firebase Authentication user read/update permissions.":"Firebase Authentication request failed. Review account status.",503);
  return r.json();
 };
 const claims=JSON.parse(atob(input.idToken.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
 const lookup=async uid=>{const result=await authCall("lookup",{localId:[uid]});const u=result.users?.find(u=>u.localId===uid)||null;if(uid===actorUid&&u&&Number(u.validSince||0)>Number(claims.auth_time||0))fail("Owner session revoked. Sign in again.",403);return u;};
 const markVerified=async(uid,email)=>{const u=await lookup(uid);if(!u||u.disabled||u.email!==email)fail("Account changed. No verification granted.",409);if(!u.emailVerified)await authCall("update",{localId:uid,emailVerified:true});};
 const commit=async writes=>{const r=await fetch(base+":commit",{method:"POST",headers,body:JSON.stringify({writes})});if(!r.ok)fail("Verification audit could not be saved. Review account status.",503);};
 const audit=(id,fields,actor,target)=>commit([{verify:root+"/users/"+actorUid,currentDocument:{updateTime:actor.updateTime}},{verify:root+"/users/"+input.targetUid,currentDocument:{updateTime:target.updateTime}},{update:{name:root+"/ownerEmailVerificationAudit/"+id,fields},currentDocument:{exists:false}}]);
 const finish=(id,fields)=>commit([{update:{name:root+"/ownerEmailVerificationAudit/"+id,fields},updateMask:{fieldPaths:Object.keys(fields)},currentDocument:{exists:true}}]);
 return approveVerification({actorUid,input,read,lookup,markVerified,audit,finish});
}
