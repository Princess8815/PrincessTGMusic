import {accessToken,verifyFirebaseIdentity} from "./rewards.js";
import {FEATURES,validateDesign,validateMilestones,checkDesignUnlocks,builtInOrangeDesign} from "../../script/orange-knock-down-core.mjs";
const fail=(m,status=400)=>{throw Object.assign(Error(m),{status});};
const str=stringValue=>({stringValue});
const value=(d,k)=>d?.fields?.[k]?.stringValue;
const parse=d=>JSON.parse(value(d,"payload"));
const idOK=id=>typeof id==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id);
const levelOK=n=>Number.isInteger(n)&&n>=1&&n<=1000000;
export async function editorAction({input,uid,read,commit,list,root,clock=Date.now,makeId=()=>crypto.randomUUID()}){
 const action=input?.action;
 if(!["config","load","official","browse","save","publish","milestones","delete"].includes(action))fail("Unknown editor action.");
 const publicAction=["config","load","official","browse"].includes(action);
 let account,staff=false;
 if(!publicAction){
  if(!uid)fail("Sign in to save levels.",401);
  account=await read("users/"+uid);
  if(!account?.updateTime||(value(account,"status")||"active")!=="active"||value(account,"role")==="banned")fail("Active account required.",403);
  staff=["owner","admin"].includes(value(account,"role"));
  if(["publish","milestones"].includes(action)&&!staff)fail("Administrator access required.",403);
 }
 const config=async()=>{const d=await read("orangeConfig/milestones");return d?validateMilestones(parse(d)):Object.fromEntries(FEATURES.map(f=>[f.id,f.level]));};
 if(action==="config")return {milestones:await config()};
 if(action==="browse"){const r=await list("orangeCommunityLevels",typeof input.cursor==="string"?input.cursor.slice(0,1000):"");return {levels:r.documents.map(d=>({id:d.name.split("/").at(-1),title:value(d,"title")})),cursor:r.nextPageToken||null};}
 if(action==="load"||action==="official"){
  if(action==="load"?!idOK(input.id):!levelOK(input.level))fail("Invalid level identifier.");
  const d=await read(action==="load"?"orangeCommunityLevels/"+input.id:"orangeOfficialLevels/"+input.level);
  if(!d){const preset=action==="official"?builtInOrangeDesign(input.level):null;if(preset)return {design:preset,id:null,level:input.level,builtIn:true};fail("Level not found. Create a design and publish it to this number.",404);}
  return {design:validateDesign(parse(d)),id:input.id||null,level:input.level||null,builtIn:false};
 }
 let path,fields,previous,del=false,extra=[];
 try{
  if(action==="milestones"){
   path="orangeConfig/milestones";fields={payload:str(JSON.stringify(validateMilestones(input.milestones)))};
  }else if(action==="publish"){
   if(!levelOK(input.level))fail("Choose an official level number.");
   const d=validateDesign(input.design);
   path="orangeOfficialLevels/"+input.level;fields={title:str(d.title),payload:str(JSON.stringify(d)),authorUid:str(uid)};
   // Make sure a concurrent milestone edit cannot invalidate this publication.
   const cfg=await read("orangeConfig/milestones");const actual=cfg?validateMilestones(parse(cfg)):null;checkDesignUnlocks(d,input.level,actual);
   extra.push({verify:root+"/orangeConfig/milestones",currentDocument:cfg?{updateTime:cfg.updateTime}:{exists:false}});
  }else{
   const id=input.id||makeId();if(!idOK(id))fail("Invalid community level ID.");
   path="orangeCommunityLevels/"+id;previous=await read(path);
   if(previous&&value(previous,"authorUid")!==uid&&!staff)fail("You can only edit your own levels.",403);
   if(action==="delete"){if(!previous)fail("Level not found.",404);del=true;}
   else{const d=validateDesign(input.design);fields={title:str(d.title),payload:str(JSON.stringify(d)),authorUid:str(previous?value(previous,"authorUid"):uid)};}
  }
 }catch(e){if(e.status)throw e;fail(e.message);}
 if(previous===undefined)previous=await read(path);
 const pre=previous?{updateTime:previous.updateTime}:{exists:false};
 const writes=[{verify:root+"/users/"+uid,currentDocument:{updateTime:account.updateTime}},...extra];
 if(del)writes.push({delete:root+"/"+path,currentDocument:pre});else writes.push({update:{name:root+"/"+path,fields:{...fields,updatedAt:{timestampValue:new Date(clock()).toISOString()}}},currentDocument:pre});
 if(!await commit(writes))fail("Level changed during save. Reload and retry.",409);
 return {ok:true,id:path.split("/").at(-1)};
}
export async function orangeEditor(env,input){
 if(env.STORE_MODE!=="live"||!env.FIREBASE_PROJECT||env.REWARD_FIREBASE_PROJECT!==env.FIREBASE_PROJECT)fail("Editor unavailable.",503);
 const uid=["config","load","official","browse"].includes(input?.action)?null:await verifyFirebaseIdentity(env.FIREBASE_PROJECT,input?.idToken,["publish","milestones"].includes(input?.action));
 const token=await accessToken(env,env.FIREBASE_PROJECT),root="projects/"+env.FIREBASE_PROJECT+"/databases/(default)/documents",url="https://firestore.googleapis.com/v1/"+root,headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 const read=async p=>{const r=await fetch(url+"/"+p,{headers});if(r.status===404)return null;if(!r.ok)fail("Level storage unavailable.",503);return r.json();};
 const list=async(p,cursor)=>{const q=new URLSearchParams({pageSize:"20","mask.fieldPaths":"title"});if(cursor)q.set("pageToken",cursor);const r=await fetch(url+"/"+p+"?"+q,{headers});if(!r.ok)fail("Level list unavailable.",503);const d=await r.json();return {...d,documents:d.documents||[]};};
 const commit=async writes=>{const r=await fetch(url+":commit",{method:"POST",headers,body:JSON.stringify({writes})});if(r.ok)return true;const e=await r.json().catch(()=>({}));if([409,412].includes(r.status)||["ABORTED","FAILED_PRECONDITION","ALREADY_EXISTS"].includes(e.error?.status))return false;fail("Level save unavailable.",503);};
 return editorAction({input,uid,read,commit,list,root});
}
