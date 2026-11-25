import assert from "node:assert/strict";
import test from "node:test";
import {QUESTIONS,validateAnswers,answerText} from "../script/survey-schema.js";
import {allSurveyResponses} from "../script/survey-results.js";
import {surveyResultsDocx} from "../script/survey-export.js";

test("Survey validation preserves skipped questions and validates every answer type",()=>{
 assert.equal(QUESTIONS.length,18);
 assert.deepEqual(validateAnswers({}),{});
 assert.deepEqual(validateAnswers({q01:0,q07:[9,0],q07Other:" Other reason ",q09:{r0:4},q11:"  Some thoughts  ",q18:" "}),{q01:0,q07:[0,9],q09:{r0:4},q11:"Some thoughts",q07Other:"Other reason"});
 for(const invalid of [null,[],{uid:"person"},{q01:"1"},{q01:8},{q07:[0,0]},{q07:[0,10]},{q07Other:"Not selected"},{q09:{r6:2}},{q09:{r0:5}},{q11:"x".repeat(2001)},{q01:0,accountId:"person"}])assert.throws(()=>validateAnswers(invalid),{publicCode:"PTG-007"});
 assert.match(answerText(QUESTIONS[6],{q07:[9],q07Other:"Something else"}),/Other: Something else/);
 assert.match(answerText(QUESTIONS[8],{q09:{r0:4}}),/Social media: \?/);
});

test("Download all follows every page and stops if staff access changes",async()=>{
 const all=Array.from({length:251},(_,n)=>({n}));let calls=0;
 const pages=await allSurveyResponses(async cursor=>{calls++;const offset=cursor||0;return {responses:all.slice(offset,offset+100),next:offset+100<all.length?offset+100:null};});
 assert.equal(calls,3);assert.deepEqual(pages,all);
 let allowed=true;
 await assert.rejects(allSurveyResponses(async()=>{allowed=false;return {responses:[{}],next:null};},()=>allowed),{publicCode:"PTG-003"});
});

function unzipStored(buffer){
 const data=new Uint8Array(buffer),view=new DataView(buffer),files=new Map();let offset=0;
 while(view.getUint32(offset,true)===0x04034b50){
  assert.equal(view.getUint16(offset+8,true),0);
  const size=view.getUint32(offset+18,true),nameSize=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true);
  const begin=offset+30+nameSize+extra;
  files.set(new TextDecoder().decode(data.slice(offset+30,offset+30+nameSize)),new TextDecoder().decode(data.slice(begin,begin+size)));
  offset=begin+size;
 }
 return files;
}
test("Native Word export separates responses and marks tests without account details",async()=>{
 const blob=surveyResultsDocx([{submittedOn:"2026-11-25",isTest:false,answers:{q11:'<Thoughts> & "views"\nAnother line'},uid:"NEVER-EXPORTED-UID",id:"NEVER-EXPORTED-ID"},{submittedOn:"2026-11-25",isTest:true,answers:{q01:0,q09:{r0:4}}}]);
 assert.equal(blob.type,"application/vnd.openxmlformats-officedocument.wordprocessingml.document");
 const files=unzipStored(await blob.arrayBuffer()),xml=files.get("word/document.xml");
 assert.ok(files.has("[Content_Types].xml"));assert.ok(files.has("_rels/.rels"));
 assert.equal((xml.match(/<w:pageBreakBefore\/>/g)||[]).length,1);
 assert.equal((xml.match(/Anonymous response/g)||[]).length,2);
 assert.equal((xml.match(/18\. Is there anything/g)||[]).length,2);
 assert.match(xml,/<w:sz w:val="80"\/>.*?>TEST</);
 assert.match(xml,/&lt;Thoughts&gt; &amp; &quot;views&quot;/);
 assert.ok(!xml.includes("NEVER-EXPORTED"));
 assert.ok(!files.has("docProps/core.xml"));
});
