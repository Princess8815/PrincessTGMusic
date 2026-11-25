import assert from "node:assert/strict";
import test from "node:test";
import {submitSurvey} from "../surveys.js";
import worker from "../worker.js";
import {SURVEY_ID} from "../../../script/survey-schema.js";
const encoder=new TextEncoder(),b64=data=>Buffer.from(data).toString("base64url");
const pair=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
const jwk={...await crypto.subtle.exportKey("jwk",pair.publicKey),kid:"survey-test-key"};
const privateKey="-----BEGIN PRIVATE KEY-----\n"+Buffer.from(await crypto.subtle.exportKey("pkcs8",pair.privateKey)).toString("base64")+"\n-----END PRIVATE KEY-----";
const env={STORE_MODE:"live",FIREBASE_PROJECT:"survey-test",REWARD_FIREBASE_PROJECT:"survey-test",FIREBASE_REWARD_SERVICE_ACCOUNT:JSON.stringify({project_id:"survey-test",client_email:"test@survey-test.iam.gserviceaccount.com",private_key:privateKey}),ALLOWED_ORIGINS:"https://example.test"};
async function token(claims={}){
 const now=Math.floor(Date.now()/1000),data=b64(JSON.stringify({alg:"RS256",kid:jwk.kid}))+"."+b64(JSON.stringify({aud:env.FIREBASE_PROJECT,iss:"https://securetoken.google.com/"+env.FIREBASE_PROJECT,sub:"member-one",exp:now+3600,iat:now,auth_time:now,email_verified:true,...claims}));
 return data+"."+b64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,encoder.encode(data)));
}
const identityToken=await token(),root="projects/survey-test/databases/(default)/documents/";
const account={name:root+"users/member-one",fields:{role:{stringValue:"user"},status:{stringValue:"active"}},updateTime:"2026-11-25T12:00:00.000000Z"};
let docs,commits,failCommit=false,archiveDuringCommit=false;
function reset(){docs=new Map([[account.name,structuredClone(account)]]);commits=[];failCommit=false;archiveDuringCommit=false;}
function response(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});}
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{
 url=String(url);
 if(url.includes("/jwk/securetoken"))return response({keys:[jwk]});
 if(url==="https://oauth2.googleapis.com/token")return response({access_token:"test-service-token",expires_in:3600});
 assert.match(url,/^https:\/\/firestore.googleapis.com\/v1\//);
 assert.equal(options.headers.Authorization,"Bearer test-service-token");
 if(url.endsWith(":commit")){
  const {writes}=JSON.parse(options.body);commits.push(writes);
  if(failCommit)return response({error:{message:"PRIVATE DATABASE DETAILS"}},503);
  if(archiveDuringCommit){docs.get(account.name).fields.status={stringValue:"archived"};docs.get(account.name).updateTime="changed";archiveDuringCommit=false;}
  for(const write of writes){
   const existing=docs.get(write.update.name);
   if(write.currentDocument?.exists===false&&existing||write.currentDocument?.updateTime&&write.currentDocument.updateTime!==existing?.updateTime)return response({},409);
  }
  // Preconditions are all checked before any write, just like an atomic commit.
  for(const write of writes){
   const existing=docs.get(write.update.name),data=write.updateMask?structuredClone(existing||{name:write.update.name,fields:{}}):structuredClone(write.update);
   for(const path of write.updateMask?.fieldPaths||[])data.fields[path]=structuredClone(write.update.fields[path]);
   for(const transform of write.updateTransforms||[])data.fields[transform.fieldPath]={integerValue:String(Number(data.fields[transform.fieldPath]?.integerValue||0)+Number(transform.increment.integerValue))};
   docs.set(write.update.name,data);
  }
  return response({writeResults:writes.map(()=>({}))});
 }
 const doc=docs.get(decodeURIComponent(url.split("/v1/")[1]));return response(doc||{},doc?200:404);
};
const submission=(overrides={})=>({idToken:identityToken,surveyId:SURVEY_ID,version:1,answers:{q01:2,q07:[0,9],q07Other:"Another reason",q09:{r0:4},q11:"A written answer"},isTest:false,submissionToken:crypto.randomUUID(),...overrides});

test("Verified completion saves anonymous answers and credits once, including concurrent retries",async()=>{
 reset();const input=submission(),results=await Promise.all([submitSurvey(env,input),submitSurvey(env,input)]);
 assert.equal(results.reduce((sum,result)=>sum+result.awarded,0),500);
 assert.equal([...docs.keys()].filter(path=>path.includes("/responses/")).length,1);
 assert.equal(docs.get(root+"users/member-one/wallets/starCoins").fields.balance.integerValue,"500");
 const saved=[...docs.entries()].find(([path])=>path.includes("/responses/"))[1];
 assert.deepEqual(Object.keys(saved.fields).sort(),["answers","isTest","submittedOn","surveyId","version"]);
 assert.match(saved.fields.submittedOn.stringValue,/^\d{4}-\d{2}-\d{2}$/);
 assert.ok(!JSON.stringify(saved).includes("member-one"));assert.ok(!JSON.stringify(saved).includes(identityToken));
 const claim=docs.get(root+"users/member-one/surveyRewards/"+SURVEY_ID);
 assert.deepEqual(Object.keys(claim.fields).sort(),["amount","currency","surveyId"]);
 assert.ok(!JSON.stringify(claim).includes(input.submissionToken));assert.ok(!JSON.stringify(claim).includes(saved.name));
 const again=await submitSurvey(env,submission());assert.equal(again.awarded,0);assert.equal(again.alreadySubmitted,true);
});
test("Tests are clearly marked, idempotent, and never grant rewards",async()=>{
 reset();const input=submission({isTest:true});
 assert.equal((await submitSurvey({...env,STORE_MODE:"test"},input)).awarded,0);
 assert.equal((await submitSurvey(env,input)).awarded,0);
 assert.equal([...docs.values()].filter(doc=>doc.fields?.isTest?.booleanValue).length,1);
 assert.ok(![...docs.keys()].some(path=>path.includes("/wallets/")||path.includes("/surveyRewards/")));
 assert.equal((await submitSurvey(env,submission())).awarded,500,"Testing does not consume the real reward");
});
test("Forged, unverified, expired, wrong-project, inactive and malformed requests fail closed",async()=>{
 reset();
 for(const claims of [{email_verified:false},{email_verified:undefined},{aud:"another-project"},{exp:1},{sub:".."}])await assert.rejects(submitSurvey(env,submission({idToken:await token(claims)})));
 await assert.rejects(submitSurvey(env,submission({idToken:identityToken.slice(0,-16)+"forged"})));
 for(const override of [{amount:50000},{uid:"someone-else"},{isTest:"false"},{answers:{q11:"x".repeat(2001)}},{answers:{uid:"person"}},{answers:{}},{surveyId:"invented"},{submissionToken:"not-random"}])await assert.rejects(submitSurvey(env,submission(override)));
 await assert.rejects(submitSurvey({...env,STORE_MODE:"test"},submission()),{publicCode:"PTG-714"});
 docs.get(account.name).fields.status={stringValue:"banned"};
 await assert.rejects(submitSurvey(env,submission()),{publicCode:"PTG-003"});
 assert.equal(commits.length,0);assert.equal(docs.size,1);
});
test("A failed commit or concurrent archive saves neither answers nor coins",async()=>{
 reset();failCommit=true;await assert.rejects(submitSurvey(env,submission()),{publicCode:"PTG-711"});assert.equal(docs.size,1);
 reset();archiveDuringCommit=true;await assert.rejects(submitSurvey(env,submission()),{publicCode:"PTG-009"});assert.equal(docs.size,1);
});
test("The HTTP route enforces origins and returns only public error codes",async()=>{
 reset();failCommit=true;
 const call=async(origin,body)=>worker.fetch(new Request("https://worker.test/surveys/submit",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify(body)}),env,{});
 const denied=await call("https://untrusted.test",submission());assert.equal(denied.status,403);
 const failed=await call("https://example.test",submission()),data=await failed.json();assert.equal(failed.status,503);assert.equal(data.code,"PTG-711");assert.ok(!JSON.stringify(data).includes("PRIVATE"));
 failCommit=false;
 const long=await call("https://example.test",submission({answers:Object.fromEntries(QUESTIONS_TEXT.map(key=>[key,"A".repeat(2000)]))}));assert.equal(long.status,200);
});
const QUESTIONS_TEXT=["q08","q11","q12","q13","q14","q16","q17","q18"];
test.after(()=>{globalThis.fetch=originalFetch;});
