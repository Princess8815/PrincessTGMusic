// Purchase rewards are written by the trusted Worker, not the browser.
const rewardIds=["tide"];
const enc=new TextEncoder();
const b64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const json=s=>JSON.parse(new TextDecoder().decode(decode(s)));
const reject=(message,status=401)=>{throw Object.assign(new Error(message),{status});};
let keysCache=null,oauthCache=null;
// Explicit opt-in for staff testing against the production Firebase project.
export function adminSandboxRewards(env){
 return env.STORE_MODE==="test"&&env.ADMIN_TEST_TIDE==="yes"&&!!env.FIREBASE_PROJECT&&env.REWARD_FIREBASE_PROJECT===env.FIREBASE_PROJECT&&!!env.FIREBASE_REWARD_SERVICE_ACCOUNT;
}
export function rewardProject(env){
 const project=env.REWARD_FIREBASE_PROJECT||"";
 if(!project||!["test","live"].includes(env.STORE_MODE))return "";
 if(env.STORE_MODE==="test"&&project===env.FIREBASE_PROJECT&&!adminSandboxRewards(env))return "";
 if(env.STORE_MODE==="live"&&project!==env.FIREBASE_PROJECT)return "";
 return project;
}
export function rewardAvailable(env,row){
 return !!rewardProject(env)&&(!adminSandboxRewards(env)||!!row?.reward_uid);
}
export function eligibleStaffAccount(data){
 return ["admin","owner"].includes(data?.fields?.role?.stringValue)&&
  (data?.fields?.status?.stringValue||"active")==="active";
}
function accountRoot(project,uid){
 return "https://firestore.googleapis.com/v1/projects/"+encodeURIComponent(project)+"/databases/(default)/documents/users/"+encodeURIComponent(uid);
}
async function verifiedStaffAccount(env,uid){
 const token=await accessToken(env);
 const response=await fetch(accountRoot(rewardProject(env),uid),{headers:{Authorization:"Bearer "+token}});
 if(response.status===404)return false;
 if(!response.ok)reject("Staff reward verification unavailable.",503);
 return eligibleStaffAccount(await response.json());
}
export async function verifiedBuyer(env,token){
 const project=rewardProject(env);
 if(!project||!token)return null;
 if(typeof token!=="string"||token.length>12000)reject("Invalid sign-in token.");
 try{
  const parts=token.split(".");
  if(parts.length!==3)throw Error("JWT");
  const h=json(parts[0]),p=json(parts[1]),now=Math.floor(Date.now()/1000);
  if(h.alg!=="RS256"||typeof h.kid!=="string"||p.aud!==project||p.iss!=="https://securetoken.google.com/"+project||typeof p.sub!=="string"||!p.sub||p.sub.length>128||p.sub.includes("/")||!Number.isFinite(p.exp)||p.exp<=now||!Number.isFinite(p.iat)||p.iat>now+60||!Number.isFinite(p.auth_time)||p.auth_time>now+60)throw Error("Claims");
  if(!keysCache||keysCache.expires<now||!keysCache.keys.some(k=>k.kid===h.kid)){
   const r=await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
   if(!r.ok)reject("Firebase sign-in verification unavailable.",503);
   const data=await r.json();keysCache={keys:data.keys||[],expires:now+300};
  }
  const jwk=keysCache.keys.find(k=>k.kid===h.kid&&k.kty==="RSA");
  if(!jwk)throw Error("Key");
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  if(!await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,decode(parts[2]),enc.encode(parts[0]+"."+parts[1])))throw Error("Signature");
  // No guest or non-staff binding for production sandbox rewards.
  if(adminSandboxRewards(env)&&!await verifiedStaffAccount(env,p.sub))return null;
  return p.sub;
 }catch(e){if(e.status)throw e;reject("Sign in again before claiming purchase collectibles.");}
}
async function accessToken(env){
 const project=rewardProject(env);
 if(!project)reject("Purchase rewards are disabled in this environment.",503);
 if(oauthCache?.project===project&&oauthCache.exp>Date.now()+60000)return oauthCache.token;
 let sa;try{sa=JSON.parse(env.FIREBASE_REWARD_SERVICE_ACCOUNT||"");}catch{reject("Reward service is not configured.",503);}
 if(sa.project_id!==project||!sa.client_email||!sa.private_key)reject("Reward service account project mismatch.",503);
 const pem=sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
 const key=await crypto.subtle.importKey("pkcs8",decode(pem),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const iat=Math.floor(Date.now()/1000),aud="https://oauth2.googleapis.com/token";
 const jwt=b64url(enc.encode(JSON.stringify({alg:"RS256",typ:"JWT"})))+"."+b64url(enc.encode(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/datastore",aud,iat,exp:iat+3600})));
 const signature=b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc.encode(jwt)));
 const r=await fetch(aud,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt+"."+signature})});
 const data=await r.json();if(!r.ok||!data.access_token)reject("Reward authorization unavailable.",503);
 oauthCache={project,token:data.access_token,exp:Date.now()+Number(data.expires_in||3600)*1000};return data.access_token;
}
export async function awardPaidOrder(env,row){
 const project=rewardProject(env);
 if(!project||row.status!=="paid"||!row.reward_uid)return [];
 const uid=row.reward_uid,token=await accessToken(env),headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 const root=accountRoot(project,uid);
 const account=await fetch(root,{headers});
 if(!account.ok)reject("Buyer account is unavailable for the purchase reward.",409);
 const accountData=await account.json();
 if(accountData.fields?.status?.stringValue==="archived")reject("Archived accounts cannot receive rewards.",409);
 if(adminSandboxRewards(env)&&!eligibleStaffAccount(accountData))reject("Only active administrators or owners can receive production Tide from a sandbox payment.",403);
 if(row.reward_done)return JSON.parse(row.reward_added||"[]").filter(id=>rewardIds.includes(id));
 const added=[];
 for(const id of rewardIds){
  // createDocument with a fixed ID is atomic and will not overwrite a previous reward.
  const r=await fetch(root+"/axolotls?documentId="+id,{method:"POST",headers,body:JSON.stringify({fields:{foundAt:{timestampValue:new Date().toISOString()},sourceOrder:{stringValue:row.id},...(adminSandboxRewards(env)?{sourceMode:{stringValue:"admin_sandbox"}}:{})}})});
  if(r.ok)added.push(id);
  else if(r.status===409){
   const existing=await fetch(root+"/axolotls/"+id,{headers});
   if(!existing.ok)reject("Purchase reward lookup unavailable.",503);
   const saved=await existing.json();if(saved.fields?.sourceOrder?.stringValue===row.id)added.push(id);
  }else reject("Purchase reward storage unavailable.",503);
 }
 await env.ORDERS.prepare("UPDATE orders SET reward_done=1,reward_added=? WHERE id=? AND status='paid' AND reward_uid=?").bind(JSON.stringify(added),row.id,uid).run();
 return added;
}

export async function verifiedShippingStaff(env,token){const uid=await verifiedBuyer(env,token);return !!uid&&await verifiedStaffAccount(env,uid);}
