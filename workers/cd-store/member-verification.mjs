import {accessToken,verifyFirebaseIdentity} from "./rewards.js";

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const DAY=86400000, HOUR=3600000;
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,"0")).join("");
export function verificationPreviewOrigin(env,origin){
 return env.STORE_MODE==="live"&&!!env.VERIFICATION_PREVIEW_ORIGIN&&origin===env.VERIFICATION_PREVIEW_ORIGIN;
}
// One atomic INSERT prevents simultaneous requests bypassing the limits.
// 1/minute and 5/rolling day per account OR email; 20/hour per IP;
// 80/rolling day across verification mail (leaves room for other mail).
export const RESERVE_SQL=`INSERT INTO verification_sends(id,uid,email_hash,ip_hash,created)
SELECT ?,?,?,?,?
WHERE NOT EXISTS(SELECT 1 FROM verification_sends WHERE uid=? AND created>?)
AND NOT EXISTS(SELECT 1 FROM verification_sends WHERE email_hash=? AND created>?)
AND (SELECT COUNT(*) FROM verification_sends WHERE uid=? AND created>?)<5
AND (SELECT COUNT(*) FROM verification_sends WHERE email_hash=? AND created>?)<5
AND (?='' OR (SELECT COUNT(*) FROM verification_sends WHERE ip_hash=? AND created>?)<20)
AND (SELECT COUNT(*) FROM verification_sends WHERE created>?)<80`;
// Read-only status mirrors every rolling window enforced by the atomic INSERT.
export const STATUS_SQL=`SELECT
 (SELECT created FROM verification_sends WHERE uid=? ORDER BY created DESC LIMIT 1) AS uid_latest,
 (SELECT created FROM verification_sends WHERE email_hash=? ORDER BY created DESC LIMIT 1) AS email_latest,
 (SELECT created FROM verification_sends WHERE uid=? ORDER BY created DESC LIMIT 1 OFFSET 4) AS uid_daily,
 (SELECT created FROM verification_sends WHERE email_hash=? ORDER BY created DESC LIMIT 1 OFFSET 4) AS email_daily,
 (SELECT created FROM verification_sends WHERE ip_hash=? AND ip_hash!='' ORDER BY created DESC LIMIT 1 OFFSET 19) AS ip_hourly,
 (SELECT created FROM verification_sends ORDER BY created DESC LIMIT 1 OFFSET 79) AS global_daily`;
export function verificationWait(row,now){
 const limits={uid_latest:60000,email_latest:60000,uid_daily:DAY,email_daily:DAY,ip_hourly:HOUR,global_daily:DAY};
 return Math.max(0,...Object.entries(limits).map(([key,window])=>row?.[key]==null?0:Number(row[key])+window-now));
}
export async function verificationCooldown(db,uid,email,ip,now=Date.now()){
 const emailHash=await hash(email.trim().toLowerCase()),ipHash=ip?await hash(ip):"";
 const row=await db.prepare(STATUS_SQL).bind(uid,emailHash,uid,emailHash,ipHash).first();
 return {retryAfterMs:verificationWait(row,now)};
}
export async function reserveVerification(db,uid,email,ip,now=Date.now()){
 const emailHash=await hash(email.trim().toLowerCase()),ipHash=ip?await hash(ip):"";
 const result=await db.prepare(RESERVE_SQL).bind(crypto.randomUUID(),uid,emailHash,ipHash,now,
 uid,now-60000,emailHash,now-60000,uid,now-DAY,emailHash,now-DAY,ipHash,ipHash,now-HOUR,now-DAY).run();
 return result.meta?.changes===1;
}
export async function deliverVerification({uid,claims,ip,lookup,reserve,generate,send}){
 const user=await lookup(uid);
 if(!user||user.disabled||!user.email||user.email!==claims.email||Number(user.validSince||0)>claims.auth_time)fail("Sign in again to verify your current email.",401);
 if(user.emailVerified===true)return {alreadyVerified:true};
 if(!await reserve(uid,user.email,ip))fail("Too many verification requests. Please try again later.",429);
 const link=await generate(user.email);
 let url;try{url=new URL(link);}catch{fail("Verification link unavailable.",503);}
 if(url.protocol!=="https:"||url.searchParams.get("mode")!=="verifyEmail"||!url.searchParams.get("oobCode"))fail("Verification link unavailable.",503);
 // Recheck account ownership before delivery if the address changed meanwhile.
 const current=await lookup(uid);
 if(!current||current.disabled||current.email!==user.email||Number(current.validSince||0)>claims.auth_time)fail("Sign in again to verify your current email.",401);
 if(current.emailVerified===true)return {alreadyVerified:true};
 await send(user.email,url.href);
 return {accepted:true,alreadyVerified:false};
}
export function verificationMessage(email,link,from){
 return {from,to:[email],subject:"Verify your PrincessTG Creations account",
 text:"Welcome to PrincessTG Creations!\n\nVerify your email address by opening this secure link:\n"+link+"\n\nIf you didn't request this, you can ignore this email.\n\nPrincessTG Creations",
 html:"<h1 style=\"color:#7651bf\">Welcome to PrincessTG Creations!</h1><p>One more step before you can explore member features. Verify your email address using the secure button below.</p><p><a style=\"display:inline-block;background:#7651bf;color:white;padding:12px 20px;border-radius:8px;text-decoration:none\" href=\""+escapeHTML(link)+"\">Verify my email</a></p><p>If you didn't request this, you can ignore this email.</p><p>PrincessTG Creations</p>"};
}
// Fixed trusted site destinations only. Older clients retain Firebase's hosted handler.
export function memberActionLink(link,env,origin,optIn){
 if(optIn!==true)return link;
 const approved=origin==="https://princesstg-creations.com"||origin==="https://princesstgcreations.pages.dev"||verificationPreviewOrigin(env,origin);
 if(!approved)return link;
 const original=new URL(link),code=original.searchParams.get("oobCode");
 if(original.protocol!=="https:"||original.searchParams.get("mode")!=="verifyEmail"||!code)fail("Verification link unavailable.",503);
 const destination=new URL("/pages/verify-email.html",origin);
 destination.hash=new URLSearchParams({oobCode:code}).toString();
 return destination.href;
}
export async function sendMemberVerification(env,input,ip,origin="",statusOnly=false){
 if(env.STORE_MODE!=="live"||!env.FIREBASE_PROJECT||env.REWARD_FIREBASE_PROJECT!==env.FIREBASE_PROJECT||!env.RESEND_API_KEY||!env.VERIFICATION_FROM||!env.ORDERS)fail("Email verification is temporarily unavailable.",503);
 const project=env.FIREBASE_PROJECT,idToken=input?.idToken;
 const uid=await verifyFirebaseIdentity(project,idToken);
 const payload=idToken.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
 const claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload),c=>c.charCodeAt(0))));
 const token=await accessToken(env,project,"https://www.googleapis.com/auth/identitytoolkit");
 const call=async(action,body)=>{
  const response=await fetch("https://identitytoolkit.googleapis.com/v1/projects/"+encodeURIComponent(project)+"/accounts:"+action,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!response.ok){const details = await response.json().catch(() => ({}));
const reason = String(details?.error?.message || "").match(/^[A-Z][A-Z0-9_]+/)?.[0] || "UNKNOWN";
console.warn("Verification Firebase API failed", action, response.status, reason);fail("Email verification is temporarily unavailable.",503);}
  return response.json();
 };
 const lookup=async uid=>(await call("lookup",{localId:[uid]})).users?.find(u=>u.localId===uid);
 if(statusOnly){
  const user=await lookup(uid);
  if(!user||user.disabled||!user.email||user.email!==claims.email||Number(user.validSince||0)>claims.auth_time)fail("Sign in again to verify your current email.",401);
  if(user.emailVerified===true)return {alreadyVerified:true,retryAfterMs:0};
  return {alreadyVerified:false,...await verificationCooldown(env.ORDERS,uid,user.email,ip)};
 }
 const result=await deliverVerification({uid,claims,ip,
 lookup,
 reserve:(uid,email,ip)=>reserveVerification(env.ORDERS,uid,email,ip),
 generate:async email=>(await call("sendOobCode",{requestType:"VERIFY_EMAIL",email,returnOobLink:true})).oobLink,
 send:async(email,link)=>{
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify(verificationMessage(email,memberActionLink(link,env,origin,input.actionPage),env.VERIFICATION_FROM))});
  if(!response.ok){console.warn("Verification Resend API failed",response.status);fail("Email delivery is temporarily unavailable.",503);}
  const receipt=await response.json();if(typeof receipt.id!=="string")fail("Email delivery could not be confirmed.",503);
  console.info("Verification email accepted by Resend",receipt.id);
 }});
 // Reservation occurred before sending, so this conservative local timer cannot expire too early.
 return {...result,retryAfterMs:result.accepted?60000:0};
}
