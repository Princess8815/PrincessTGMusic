import {db} from "./firebase.js";
import {collection,query,orderBy,limit,startAfter,getDocsFromServer} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {watchStaffRole} from "./staff-auth.js";
import {publicError} from "./site-errors.js";
import {SURVEY_ID,QUESTIONS,SECTIONS,answerText} from "./survey-schema.js";
import {allSurveyResponses} from "./survey-results.js";
import {surveyResultsDocx} from "./survey-export.js";
const $=id=>document.getElementById(id),PAGE_SIZE=100;
let allowed=false,epoch=0,responses=[],cursor=null,finished=false,busy=false;
const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
async function page(after){
 const constraints=[orderBy("submittedOn","desc")];if(after)constraints.push(startAfter(after));constraints.push(limit(PAGE_SIZE));
 const snapshot=await getDocsFromServer(query(collection(db,"researchSurveys",SURVEY_ID,"responses"),...constraints));
 return {responses:snapshot.docs.map(item=>item.data()),next:snapshot.size===PAGE_SIZE?snapshot.docs.at(-1):null};
}
function controls(){
 $("survey-admin-refresh").disabled=!allowed||busy;$("survey-admin-download").disabled=!allowed||busy;
 $("survey-admin-more").disabled=!allowed||busy;$("survey-admin-more").hidden=finished||!responses.length;
}
function render(){
 const list=$("survey-admin-results");list.replaceChildren();
 const filter=$("survey-admin-filter").value,shown=responses.filter(item=>filter==="all"||(filter==="test")===!!item.isTest);
 const tests=responses.filter(item=>item.isTest).length;
 $("survey-admin-counts").textContent=responses.length+" responses "+(finished?"total":"loaded")+" · "+(responses.length-tests)+" research · "+tests+" test · "+shown.length+" shown";
 for(const response of shown){
  const card=element("details");card.className="survey-response";
  const summary=element("summary","Anonymous response · "+(response.submittedOn||"Date unavailable"));
  if(response.isTest){const tag=element("span","TEST");tag.className="survey-test-tag";summary.append(tag);}
  card.append(summary);
  if(response.isTest){const banner=element("div","TEST");banner.className="survey-test-banner";card.append(banner);}
  let section=-1,answers=element("dl");
  for(const question of QUESTIONS){
   if(question.section!==section){section=question.section;card.append(element("h4",SECTIONS[section]));answers=element("dl");card.append(answers);}
   answers.append(element("dt",question.number+". "+question.label),element("dd",answerText(question,response.answers)));
  }
  list.append(card);
 }
 controls();
}
async function load(reset=false){
 if(!allowed||busy)return;const version=epoch;busy=true;controls();$("survey-admin-status").textContent="Loading responses…";
 if(reset){responses=[];cursor=null;finished=false;render();}
 try{
  const result=await page(cursor);if(!allowed||epoch!==version)return;
  responses.push(...result.responses);cursor=result.next;finished=!cursor;render();
  $("survey-admin-status").textContent=responses.length?"":"No responses yet.";
 }catch(error){if(epoch===version)$("survey-admin-status").textContent=publicError(error,"PTG-712");}
 finally{if(epoch===version){busy=false;controls();}}
}
$("survey-admin-refresh").addEventListener("click",()=>load(true));
$("survey-admin-more").addEventListener("click",()=>load());
$("survey-admin-filter").addEventListener("change",render);
$("survey-admin-download").addEventListener("click",async()=>{
 if(!allowed||busy)return;const version=epoch;busy=true;controls();$("survey-admin-status").textContent="Preparing all responses…";
 try{
  const all=await allSurveyResponses(page,()=>allowed&&epoch===version);
  const blob=surveyResultsDocx(all);if(!allowed||epoch!==version)return;
  const url=URL.createObjectURL(blob),link=element("a");link.href=url;link.download="transgender-attitudes-all-responses-"+new Date().toISOString().slice(0,10)+".docx";
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  responses=all;cursor=null;finished=true;render();$("survey-admin-status").textContent="Downloaded all "+all.length+" responses, including tests.";
 }catch(error){if(epoch===version)$("survey-admin-status").textContent=publicError(error,"PTG-713");}
 finally{if(epoch===version){busy=false;controls();}}
});
watchStaffRole(value=>{
 if(value===allowed)return;
 allowed=value===true;epoch++;busy=false;responses=[];cursor=null;finished=false;render();
 $("survey-admin-status").textContent=allowed?"":"Administrator access required.";
 if(allowed)load(true);
});
