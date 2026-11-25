import assert from "node:assert/strict";
import test from "node:test";
import {submitSurvey} from "../surveys.js";
import worker from "../worker.js";
import {ownerTools} from "../owner-tools.js";
import {TERMINAL_COMMANDS} from "../terminal-commands.js";
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
let docs,commits,failCommit=false,archiveDuringCommit=false,storageStatus=503;
function reset(){docs=new Map([[account.name,structuredClone(account)]]);commits=[];failCommit=false;archiveDuringCommit=false;storageStatus=503;}
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
  if(failCommit)return response({error:{message:"PRIVATE DATABASE DETAILS",status:storageStatus===403?"PERMISSION_DENIED":"UNAVAILABLE"}},storageStatus);
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
test("Changing project previews reach test surveys without widening production or checkout access",async()=>{
 const previewEnv={...env,STORE_MODE:"test",SURVEY_PREVIEW_HOST:"princesstgcreations.pages.dev"};
 const check=async(origin,mode="test",path="/surveys/submit")=>worker.fetch(new Request("https://worker.test"+path,{method:"OPTIONS",headers:{Origin:origin}}),{...previewEnv,STORE_MODE:mode},{});
 for(const origin of ["https://2226eecb.princesstgcreations.pages.dev","https://feature-clean-shop-errors-20.princesstgcreations.pages.dev"]){
  const response=await check(origin);assert.equal(response.status,204);assert.equal(response.headers.get("Access-Control-Allow-Origin"),origin);
  assert.equal((await check(origin,"live")).status,403);
  assert.equal((await check(origin,"test","/checkout")).status,403);
  assert.equal((await check(origin,"test","/owner/terminal-commands")).status,204);
 }
 for(const origin of ["https://princesstgcreations.pages.dev.evil.test","https://another-project.pages.dev","https://nested.branch.princesstgcreations.pages.dev","http://branch.princesstgcreations.pages.dev","https://branch.princesstgcreations.pages.dev:444","https://branch.princesstgcreations.pages.dev/path","not-an-origin"]){
  const response=await check(origin);assert.equal(response.status,403);assert.equal(response.headers.get("Access-Control-Allow-Origin"),null);
 }
});
test("Command catalog is served only after a signed token and active owner check",async()=>{
 reset();const input={idToken:identityToken,action:"list"};
 await assert.rejects(ownerTools(env,{action:"list"}));
 for(const role of ["user","admin"]){docs.get(account.name).fields.role={stringValue:role};await assert.rejects(ownerTools(env,input),{publicCode:"PTG-003"});}
 docs.get(account.name).fields.role={stringValue:"owner"};
 for(const value of ["banned","archived",""]){docs.get(account.name).fields.status={stringValue:value};await assert.rejects(ownerTools(env,input),{publicCode:"PTG-003"});}
 docs.get(account.name).fields.status={stringValue:"active"};
 const result=await ownerTools(env,input);assert.equal(result.root,"PrincessTGMusic");assert.deepEqual(result.commands,TERMINAL_COMMANDS);
 assert.ok(!JSON.stringify(result).includes(identityToken));assert.ok(!JSON.stringify(result).includes(privateKey));
 await assert.rejects(ownerTools(env,{...input,action:"run",command:"anything"}),{publicCode:"PTG-007"});
 docs.get(account.name).fields.role={stringValue:"admin"};
 const denied=await worker.fetch(new Request("https://worker.test/owner/terminal-commands",{method:"POST",headers:{Origin:"https://example.test","Content-Type":"application/json"},body:JSON.stringify(input)}),env,{});
 assert.equal(denied.status,403);assert.ok(!JSON.stringify(await denied.json()).includes("wrangler deploy"));
});
test("Every command uses root paths and command IDs are unique",()=>{
 assert.equal(new Set(TERMINAL_COMMANDS.map(item=>item.id)).size,TERMINAL_COMMANDS.length);
 for(const item of TERMINAL_COMMANDS){
  assert.ok(item.description&&item.category&&item.command);
  assert.ok(!/\bcd\s/i.test(item.command),"Commands do not change away from the project root");
  for(const match of item.command.matchAll(/--config (\S+)/g))assert.match(match[1],/^workers\/cd-store\/wrangler(?:\.live)?\.toml$/);
  for(const match of item.command.matchAll(/--file (\S+)/g))assert.match(match[1],/^workers\/cd-store\//);
 }
});
test("Owner connection checks save only TEST records and diagnostics omit private details",async()=>{
 reset();docs.get(account.name).fields.role={stringValue:"owner"};
 const input={idToken:identityToken,action:"check-survey"};
 const saved=await ownerTools({...env,STORE_MODE:"test"},input);
 assert.deepEqual(saved,{ok:true,isTest:true,awarded:0});assert.ok(![...docs.keys()].some(path=>path.includes("/wallets/")||path.includes("/surveyRewards/")));
 failCommit=true;storageStatus=403;
 const warn=console.warn,logs=[];console.warn=(...args)=>logs.push(args);
 try{
  const failure=await ownerTools(env,input);assert.equal(failure.ok,false);assert.equal(failure.code,"PTG-711");assert.equal(failure.diagnostic.step,"Save answers");assert.equal(failure.diagnostic.status,403);assert.equal(failure.diagnostic.reason,"PERMISSION_DENIED");
  const diagnostic=JSON.stringify({failure,logs});assert.ok(!diagnostic.includes("PRIVATE DATABASE DETAILS"));assert.ok(!diagnostic.includes(identityToken));assert.ok(!diagnostic.includes("member-one"));
 }finally{console.warn=warn;}
});
test.after(()=>{globalThis.fetch=originalFetch;});
