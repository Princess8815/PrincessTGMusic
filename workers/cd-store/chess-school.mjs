import {initialCourse,courseAction,publicCourse,PROFESSOR_ID,passed,graduated} from "../../script/chess-school-core.mjs";
import {SCHOOL_MEDALS,CHESS_DIPLOMA_ID,shouldUpgradeDiploma} from "../../script/chess-school-awards.mjs";
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const pre=d=>d?{updateTime:d.updateTime}:{exists:false};
const str=stringValue=>({stringValue});
export async function schoolWithStorage({read,commit,root,uid,input}){
 const user="users/"+uid,path=user+"/privateGames/chess-school-associates";
 for(let i=0;i<4;i++){
  const [account,old]=await Promise.all([read(user),read(path)]);
  if(!account?.updateTime||(account.fields?.status?.stringValue||"active")!=="active"||account.fields?.role?.stringValue==="banned")fail("Active verified account required.",403);
  const s=old?JSON.parse(old.fields.payload.stringValue):initialCourse();
  // A read of saved course progress also backfills awards earned on the old branch.
  if(input.action==="state"){
   if(!old)return publicCourse(s);
   const awards=await awardWrites({read,root,user,next:s});
   if(!awards.length)return publicCourse(s);
   if(await commit([{verify:root+"/"+user,currentDocument:pre(account)},{verify:root+"/"+path,currentDocument:pre(old)},...awards]))return publicCourse(s);
   continue;
  }
  if(typeof input.requestId!=="string"||!/^[a-z0-9-]{1,64}$/.test(input.requestId)||!Number.isInteger(input.revision))fail("Refresh the course first.");
  if(s.lastRequest===input.requestId)return {...publicCourse(s),discovered:!!s.lastDiscovery};
  if(s.revision!==input.revision)fail("Course changed in another tab. Reload your progress.",409);
  const next=courseAction(s,input);next.lastRequest=input.requestId;next.lastDiscovery=false;
  const writes=[{verify:root+"/"+user,currentDocument:pre(account)},{update:{name:root+"/"+path,fields:{payload:str("")}},currentDocument:pre(old)}];
  const awards=await awardWrites({read,root,user,next});next.lastDiscovery=awards.length>0;writes.push(...awards);
  writes[1].update.fields.payload=str(JSON.stringify(next));
  if(await commit(writes))return {...publicCourse(next),discovered:next.lastDiscovery};
 }
 fail("Course save not confirmed. Retry.",409);
}

// Future courses can call this helper with their server-verified rank; a lower rank never replaces a higher one.
export async function chessDiplomaWrite({read,root,user,rank}){
 const p=user+"/diplomas/"+CHESS_DIPLOMA_ID,old=await read(p),prior=Number(old?.fields?.rank?.integerValue);
 if(!shouldUpgradeDiploma(prior,rank))return null;
 const now={timestampValue:new Date().toISOString()};
 return {update:{name:root+"/"+p,fields:{subject:str("chess"),source:str("chess"),rank:{integerValue:String(rank)},foundAt:old?.fields?.foundAt||now,updatedAt:now}},currentDocument:pre(old)};
}
async function awardWrites({read,root,user,next}){
 const rewards=SCHOOL_MEDALS.filter(m=>passed(next,m[3])).map(m=>"medals/"+m[0]);
 if(graduated(next))rewards.push("axolotls/"+PROFESSOR_ID);
 const writes=[];
 for(const reward of rewards){const p=user+"/"+reward;if(!await read(p))writes.push({update:{name:root+"/"+p,fields:{source:str("chess"),foundAt:{timestampValue:new Date().toISOString()}}},currentDocument:{exists:false}});}
 if(graduated(next)){const diploma=await chessDiplomaWrite({read,root,user,rank:1});if(diploma)writes.push(diploma);}
 return writes;
}
