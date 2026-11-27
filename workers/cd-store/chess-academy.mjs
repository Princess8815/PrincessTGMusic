import {initialCourse,courseAction,publicCourse,PROFESSOR_ID,PASS} from "../../script/chess-academy-core.mjs";
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const pre=d=>d?{updateTime:d.updateTime}:{exists:false};
const str=stringValue=>({stringValue});
export async function academyWithStorage({read,commit,root,uid,input}){
 const user="users/"+uid,path=user+"/privateGames/chess-academy",reward=user+"/axolotls/"+PROFESSOR_ID;
 for(let i=0;i<4;i++){
  const [account,old]=await Promise.all([read(user),read(path)]);
  if(!account?.updateTime||(account.fields?.status?.stringValue||"active")!=="active"||account.fields?.role?.stringValue==="banned")fail("Active verified account required.",403);
  const s=old?JSON.parse(old.fields.payload.stringValue):initialCourse();
  if(input.action==="state")return publicCourse(s);
  if(typeof input.requestId!=="string"||!/^[a-z0-9-]{1,64}$/.test(input.requestId)||!Number.isInteger(input.revision))fail("Refresh the course first.");
  if(s.lastRequest===input.requestId)return {...publicCourse(s),discovered:!!s.lastDiscovery};
  if(s.revision!==input.revision)fail("Course changed in another tab. Reload your progress.",409);
  const next=courseAction(s,input);next.lastRequest=input.requestId;next.lastDiscovery=false;
  const writes=[{verify:root+"/"+user,currentDocument:pre(account)},{update:{name:root+"/"+path,fields:{payload:str(JSON.stringify(next))}},currentDocument:pre(old)}];
  if(next.best.every(x=>x!==null&&x>=PASS)&&!await read(reward)){
   next.lastDiscovery=true;writes[1].update.fields.payload=str(JSON.stringify(next));
   writes.push({update:{name:root+"/"+reward,fields:{source:str("chess"),foundAt:{timestampValue:new Date().toISOString()}}},currentDocument:{exists:false}});
  }
  if(await commit(writes))return {...publicCourse(next),discovered:next.lastDiscovery};
 }
 fail("Course save not confirmed. Retry.",409);
}
