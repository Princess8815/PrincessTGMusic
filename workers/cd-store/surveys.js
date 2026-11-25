import {accessToken,verifyFirebaseIdentity} from "./rewards.js";
import {SURVEY_ID,SURVEY_VERSION,SURVEY_REWARD,validateAnswers} from "../../script/survey-schema.js";
const fail=(code,status=503)=>{throw Object.assign(Error(code),{publicCode:code,status});};
const value=data=>{
 if(typeof data==="string")return {stringValue:data};
 if(typeof data==="boolean")return {booleanValue:data};
 if(Number.isInteger(data))return {integerValue:String(data)};
 if(Array.isArray(data))return {arrayValue:{values:data.map(value)}};
 return {mapValue:{fields:fields(data)}};
};
const fields=data=>Object.fromEntries(Object.entries(data).map(([key,item])=>[key,value(item)]));
const unpack=item=>{
 if(item?.mapValue)return Object.fromEntries(Object.entries(item.mapValue.fields||{}).map(([key,child])=>[key,unpack(child)]));
 if(item?.arrayValue)return (item.arrayValue.values||[]).map(unpack);
 if(item&&"integerValue"in item)return Number(item.integerValue);
 return item?.stringValue;
};
const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(data))),n=>n.toString(16).padStart(2,"0")).join("");

// Identity stays on account reward records. Answer documents contain no account
// identifiers, tokens, response-to-account links, IP addresses or precise dates.
export async function submitSurvey(env,input){
 if(!["live","test"].includes(env.STORE_MODE)||!env.FIREBASE_PROJECT||env.REWARD_FIREBASE_PROJECT!==env.FIREBASE_PROJECT)fail("PTG-710");
 const allowed=["idToken","surveyId","version","answers","isTest","submissionToken"];
 if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key))||input.surveyId!==SURVEY_ID||input.version!==SURVEY_VERSION||typeof input.isTest!=="boolean"||typeof input.submissionToken!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.submissionToken))fail("PTG-007",400);
 // Sandbox cannot mint real coins or add unmarked research responses.
 if(env.STORE_MODE!=="live"&&!input.isTest)fail("PTG-714",409);
 const answers=validateAnswers(input.answers);
 if(!input.isTest&&!Object.keys(answers).length)fail("PTG-715",400);
 let uid;
 try{uid=await verifyFirebaseIdentity(env.FIREBASE_PROJECT,input.idToken,true);}
 catch(error){if(error.publicCode)throw error;fail(error.status===503?"PTG-710":"PTG-005",error.status||401);}
 const token=await accessToken(env,env.FIREBASE_PROJECT);
 const root="projects/"+env.FIREBASE_PROJECT+"/databases/(default)/documents";
 const headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 const read=async path=>{
  const response=await fetch("https://firestore.googleapis.com/v1/"+root+"/"+path,{headers});
  if(response.status===404)return null;
  if(!response.ok)fail("PTG-711");
  return response.json();
 };
 const accountPath="users/"+encodeURIComponent(uid);
 const claimPath=accountPath+"/surveyRewards/"+SURVEY_ID;
 const responsePath="researchSurveys/"+SURVEY_ID+"/responses/"+await hash((input.isTest?"test:":"response:")+input.submissionToken);
 const account=await read(accountPath);
 if(!account||!account.updateTime||(account.fields?.status?.stringValue||"active")!=="active"||account.fields?.role?.stringValue==="banned")fail("PTG-003",403);
 if(!input.isTest&&await read(claimPath))return {saved:true,alreadySubmitted:true,awarded:0};
 const response={surveyId:SURVEY_ID,version:SURVEY_VERSION,isTest:input.isTest,submittedOn:new Date().toISOString().slice(0,10),answers};
 const writes=[{update:{name:root+"/"+responsePath,fields:fields(response)},currentDocument:{exists:false}}];
 if(!input.isTest){
  writes.push({update:{name:root+"/"+claimPath,fields:fields({surveyId:SURVEY_ID,amount:SURVEY_REWARD,currency:"starCoins"})},currentDocument:{exists:false}});
  writes.push({update:{name:root+"/"+accountPath+"/wallets/starCoins",fields:fields({currency:"starCoins"})},updateMask:{fieldPaths:["currency"]},updateTransforms:[{fieldPath:"balance",increment:{integerValue:String(SURVEY_REWARD)}}]});
 }
 // A no-op verification write makes a concurrent ban/archive fail the entire
 // commit. No partial answers, credit, or claim can survive a failed commit.
 writes.push({update:{name:root+"/"+accountPath,fields:{}},updateMask:{fieldPaths:[]},currentDocument:{updateTime:account.updateTime}});
 const result=await fetch("https://firestore.googleapis.com/v1/"+root+":commit",{method:"POST",headers,body:JSON.stringify({writes})});
 if(result.ok)return {saved:true,isTest:input.isTest,awarded:input.isTest?0:SURVEY_REWARD};
 if([409,412].includes(result.status)){
  if(!input.isTest&&await read(claimPath))return {saved:true,alreadySubmitted:true,awarded:0};
  if(input.isTest){
   const existing=await read(responsePath);
   if(existing?.fields?.isTest?.booleanValue===true&&JSON.stringify(validateAnswers(unpack(existing.fields.answers)))===JSON.stringify(answers))return {saved:true,isTest:true,awarded:0};
  }
  fail("PTG-009",409);
 }
 fail("PTG-711");
}
