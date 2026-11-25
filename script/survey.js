import {auth,db} from "./firebase.js";
import {onIdTokenChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {doc,getDocFromServer} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {sendSiteVerification,refreshSiteVerification} from "./email-verification.js";
import {publicError,siteError} from "./site-errors.js";
import {SURVEY_ID,SURVEY_VERSION} from "./survey-schema.js";
import {renderSurveyForm,collectSurveyAnswers} from "./survey-form.js";
import {STORE_WORKER_URL} from "./store-config.js";
const $=id=>document.getElementById(id);
const form=$("survey-form"),member=$("survey-member"),test=$("survey-is-test"),status=$("survey-status");
let epoch=0,memberUid="",complete=false,busy=false,submissionToken=crypto.randomUUID(),previousUid="";
renderSurveyForm($("survey-questions"));
function mode(){
 $("survey-test-banner").hidden=!test.checked;$("survey-completed").hidden=!complete;
 form.hidden=complete&&!test.checked;$("survey-submit").textContent=test.checked?"Save test response":"Submit anonymous answers";
}
test.addEventListener("change",()=>{submissionToken=crypto.randomUUID();status.textContent="";mode();});
async function access(user){
 const version=++epoch;memberUid="";member.hidden=true;$("survey-gate").hidden=false;
 for(const id of ["survey-login","survey-send-verification","survey-check-verification","survey-retry-access"])$(id).hidden=true;
 const message=$("survey-gate-message");
 if(previousUid!==(user?.uid||"")){form.reset();renderSurveyForm($("survey-questions"));test.checked=false;complete=false;status.textContent="";submissionToken=crypto.randomUUID();previousUid=user?.uid||"";mode();}
 if(!user){message.textContent="Sign in with a verified account to submit.";$("survey-login").hidden=false;return;}
 message.textContent="Checking account…";
 try{
  const result=await user.getIdTokenResult();if(version!==epoch||auth.currentUser?.uid!==user.uid)return;
  if(result.claims.email_verified!==true){
   message.textContent="Verify your email before taking the survey.";
   $("survey-send-verification").hidden=false;$("survey-check-verification").hidden=false;return;
  }
  const account=await getDocFromServer(doc(db,"users",user.uid));
  if(version!==epoch||auth.currentUser?.uid!==user.uid)return;
  if(!account.exists()||(account.data().status||"active")!=="active"||account.data().role==="banned")throw siteError("PTG-003");
  const reward=await getDocFromServer(doc(db,"users",user.uid,"surveyRewards",SURVEY_ID));
  if(version!==epoch||auth.currentUser?.uid!==user.uid)return;
  complete=reward.exists();memberUid=user.uid;$("survey-gate").hidden=true;member.hidden=false;mode();
 }catch(error){if(version!==epoch)return;message.textContent=publicError(error,"PTG-710");$("survey-retry-access").hidden=false;}
}
onIdTokenChanged(auth,user=>{if(!busy||user?.uid!==memberUid)access(user);});
$("survey-retry-access").addEventListener("click",()=>access(auth.currentUser));
$("survey-login").addEventListener("click",()=>$("auth-open")?.click());
$("survey-send-verification").addEventListener("click",async event=>{
 const user=auth.currentUser;event.target.disabled=true;
 try{await sendSiteVerification(user);if(auth.currentUser===user)$("survey-gate-message").textContent="Verification email sent. Check your inbox.";}
 catch(error){if(auth.currentUser===user)$("survey-gate-message").textContent=publicError(error,"PTG-108");}
 finally{event.target.disabled=false;}
});
$("survey-check-verification").addEventListener("click",async event=>{
 const user=auth.currentUser;event.target.disabled=true;
 try{if(!await refreshSiteVerification(user))$("survey-gate-message").textContent=publicError(null,"PTG-109");else await access(user);}
 catch(error){$("survey-gate-message").textContent=publicError(error,"PTG-109");}
 finally{event.target.disabled=false;}
});
form.addEventListener("submit",async event=>{
 event.preventDefault();if(busy)return;
 const user=auth.currentUser;if(!user||memberUid!==user.uid){await access(user);return;}
 const isTest=test.checked;
 busy=true;$("survey-submit").disabled=true;test.disabled=true;status.textContent="Saving…";
 try{
  const answers=collectSurveyAnswers(form);
  for(const group of form.querySelectorAll("fieldset"))group.disabled=true;
  if(!isTest&&!Object.keys(answers).length)throw siteError("PTG-715");
  const token=await user.getIdTokenResult(true);
  if(auth.currentUser?.uid!==user.uid)throw siteError("PTG-005");
  if(token.claims.email_verified!==true)throw siteError("PTG-109");
  const response=await fetch(STORE_WORKER_URL+"/surveys/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:token.token,surveyId:SURVEY_ID,version:SURVEY_VERSION,answers,isTest,submissionToken})});
  let data;try{data=await response.json();}catch{throw siteError("PTG-711");}
  if(!response.ok||!data.saved)throw siteError(data.code||"PTG-711");
  if(auth.currentUser?.uid!==user.uid)return;
  if(!isTest){complete=true;form.reset();renderSurveyForm($("survey-questions"));status.textContent=data.alreadySubmitted?"You've already completed this survey.":"Thank you. Your anonymous answers are saved and 500 Star Coins have been added to your account.";}
  else status.textContent="Test response saved. No coins awarded.";
  submissionToken=crypto.randomUUID();mode();
 }catch(error){if(auth.currentUser?.uid===user.uid)status.textContent=publicError(error,"PTG-711");}
 finally{busy=false;$("survey-submit").disabled=false;test.disabled=false;for(const group of form.querySelectorAll("fieldset"))group.disabled=false;}
});
