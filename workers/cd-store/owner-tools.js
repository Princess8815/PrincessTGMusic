import {accessToken,verifyFirebaseIdentity} from "./rewards.js";
import {isActiveOwner} from "../../script/owner-access.js";
import {TERMINAL_COMMANDS} from "./terminal-commands.js";
import {submitSurvey} from "./surveys.js";
import {SURVEY_ID,SURVEY_VERSION} from "../../script/survey-schema.js";
import {errorCode} from "../../script/site-errors.js";
const fail=(code,status)=>{throw Object.assign(Error(code),{publicCode:code,status});};
export async function ownerTools(env,input){
 if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(key=>!["idToken","action"].includes(key))||!["list","check-survey"].includes(input.action))fail("PTG-007",400);
 if(!env.FIREBASE_PROJECT||env.REWARD_FIREBASE_PROJECT!==env.FIREBASE_PROJECT)fail("PTG-903",503);
 const uid=await verifyFirebaseIdentity(env.FIREBASE_PROJECT,input.idToken);
 const token=await accessToken(env,env.FIREBASE_PROJECT);
 const response=await fetch("https://firestore.googleapis.com/v1/projects/"+encodeURIComponent(env.FIREBASE_PROJECT)+"/databases/(default)/documents/users/"+encodeURIComponent(uid),{headers:{Authorization:"Bearer "+token}});
 if(response.status===404)fail("PTG-003",403);
 if(!response.ok)fail("PTG-903",503);
 const fields=(await response.json()).fields||{};
 const account={role:fields.role?.stringValue,...(Object.hasOwn(fields,"status")?{status:fields.status?.stringValue}:{})};
 if(!isActiveOwner(account))fail("PTG-003",403);
 if(input.action==="check-survey"){
  try{
   const result=await submitSurvey(env,{idToken:input.idToken,surveyId:SURVEY_ID,version:SURVEY_VERSION,answers:{q18:"Owner connection check. Testing purposes only."},isTest:true,submissionToken:crypto.randomUUID()});
   return {ok:true,isTest:true,awarded:result.awarded};
  }catch(error){return {ok:false,code:errorCode(error,"PTG-711"),diagnostic:error.surveyDiagnostic||{step:"Request",status:error.status||503,reason:"UNAVAILABLE"}};}
 }
 return {root:"PrincessTGMusic",commands:TERMINAL_COMMANDS};
}
