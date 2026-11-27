import {COURSES} from "../../script/chess-school-core.mjs";
import {SCHOOL_MEDALS,CHESS_DIPLOMA_ID,shouldUpgradeDiploma} from "../../script/chess-school-awards.mjs";
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const pre=d=>d?{updateTime:d.updateTime}:{exists:false};
const str=stringValue=>({stringValue});
export async function schoolWithStorage({read,commit,root,uid,input}){
 const course=COURSES[input.school||"associates"];if(!course||!["associates","bachelors"].includes(course.id)||input.adminTest===true)fail("Invalid saved course.",400);
 const {initialCourse,courseAction,publicCourse}=course;
 const user="users/"+uid,path=user+"/privateGames/chess-school-"+course.id;
 for(let i=0;i<4;i++){
  const [account,old]=await Promise.all([read(user),read(path)]);
  if(!account?.updateTime||(account.fields?.status?.stringValue||"active")!=="active"||account.fields?.role?.stringValue==="banned")fail("Active verified account required.",403);
  if(input.action==="catalog"){const a=course.id==="associates"?old:await read(user+"/privateGames/chess-school-associates");return {associateCompleted:!!a&&COURSES.associates.graduated(JSON.parse(a.fields.payload.stringValue))};}
  const checks=[];
  if(course.id==="bachelors"){const p=user+"/privateGames/chess-school-associates",prior=await read(p);if(!prior||!COURSES.associates.graduated(JSON.parse(prior.fields.payload.stringValue)))fail("Graduate from the Associate’s course first.",403);checks.push({verify:root+"/"+p,currentDocument:pre(prior)});}
  const s=old?JSON.parse(old.fields.payload.stringValue):initialCourse();
  // A read of saved course progress also backfills awards earned on the old branch.
  if(input.action==="state"){
   if(!old)return publicCourse(s);
   const awards=await awardWrites({read,root,user,next:s,course});
   if(!awards.length)return publicCourse(s);
   if(await commit([{verify:root+"/"+user,currentDocument:pre(account)},{verify:root+"/"+path,currentDocument:pre(old)},...checks,...awards]))return publicCourse(s);
   continue;
  }
  if(typeof input.requestId!=="string"||!/^[a-z0-9-]{1,64}$/.test(input.requestId)||!Number.isInteger(input.revision))fail("Refresh the course first.");
  if(s.lastRequest===input.requestId)return {...publicCourse(s),discovered:!!s.lastDiscovery};
  if(s.revision!==input.revision)fail("Course changed in another tab. Reload your progress.",409);
  const next=courseAction(s,input);next.lastRequest=input.requestId;next.lastDiscovery=false;
  const writes=[{verify:root+"/"+user,currentDocument:pre(account)},{update:{name:root+"/"+path,fields:{payload:str("")}},currentDocument:pre(old)},...checks];
  const awards=await awardWrites({read,root,user,next,course});next.lastDiscovery=awards.length>0;writes.push(...awards);
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
async function awardWrites({read,root,user,next,course}){
 const rewards=course.id==="associates"?SCHOOL_MEDALS.filter(m=>course.passed(next,m[3])).map(m=>"medals/"+m[0]):[];
 if(course.graduated(next))rewards.push("axolotls/"+course.professorId);
 const writes=[];
 for(const reward of rewards){const p=user+"/"+reward;if(!await read(p))writes.push({update:{name:root+"/"+p,fields:{source:str("chess"),foundAt:{timestampValue:new Date().toISOString()}}},currentDocument:{exists:false}});}
 if(course.graduated(next)){const diploma=await chessDiplomaWrite({read,root,user,rank:course.id==="bachelors"?2:1});if(diploma)writes.push(diploma);}
 return writes;
}
