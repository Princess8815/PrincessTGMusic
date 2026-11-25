// Run with the Firebase emulator and SURVEY_TEST_DEPS pointing to an installed
// node_modules containing @firebase/rules-unit-testing and firebase (see README).
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import {submitSurvey} from "../workers/cd-store/surveys.js";
import {SURVEY_ID} from "../script/survey-schema.js";
const require=createRequire(resolve(process.env.SURVEY_TEST_DEPS||"node_modules","../package.json"));
const {initializeTestEnvironment,assertFails,assertSucceeds}=require("@firebase/rules-unit-testing");
const {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,increment}=require("firebase/firestore");
const projectId="demo-princesstg",host=process.env.FIRESTORE_EMULATOR_HOST||"127.0.0.1:8080";
assert.match(host,/^(127\.0\.0\.1|localhost):\d+$/,"Security tests must use a local emulator");
const [hostname,port]=host.split(":"),environment=await initializeTestEnvironment({projectId,firestore:{host:hostname,port:Number(port),rules:await readFile(new URL("./firestore.rules",import.meta.url),"utf8")}});
const responsePath="researchSurveys/"+SURVEY_ID+"/responses/anonymous-example",walletPath="users/member/wallets/starCoins",claimPath="users/member/surveyRewards/"+SURVEY_ID;
try{
 await environment.clearFirestore();
 await environment.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  for(const [uid,role,status] of [["member","user","active"],["other","user","active"],["admin","admin","active"],["owner","owner","active"],["inactive","admin","archived"],["banned","admin","banned"],["integration-member","user","active"]])await setDoc(doc(db,"users",uid),{role,status});
  await setDoc(doc(db,responsePath),{surveyId:SURVEY_ID,version:1,answers:{q11:"Anonymous"},isTest:false,submittedOn:"2026-11-25"});
  await setDoc(doc(db,walletPath),{currency:"starCoins",balance:500});
  await setDoc(doc(db,claimPath),{surveyId:SURVEY_ID,amount:500,currency:"starCoins"});
 });
 const guest=environment.unauthenticatedContext().firestore();
 const contexts=Object.fromEntries(["member","other","admin","owner","inactive","banned"].map(uid=>[uid,environment.authenticatedContext(uid,{email_verified:true}).firestore()]));
 for(const db of [guest,contexts.member,contexts.other,contexts.inactive,contexts.banned]){
  await assertFails(getDoc(doc(db,responsePath)));
  await assertFails(getDocs(collection(db,"researchSurveys",SURVEY_ID,"responses")));
 }
 for(const db of [contexts.admin,contexts.owner]){
  await assertSucceeds(getDoc(doc(db,responsePath)));
  await assertSucceeds(getDocs(collection(db,"researchSurveys",SURVEY_ID,"responses")));
 }
 await assertSucceeds(getDoc(doc(contexts.member,walletPath)));
 await assertSucceeds(getDoc(doc(contexts.member,claimPath)));
 for(const db of [guest,contexts.other,contexts.admin,contexts.owner]){
  await assertFails(getDoc(doc(db,walletPath)));await assertFails(getDoc(doc(db,claimPath)));
 }
 // Even a verified member or staff client cannot manufacture, edit or erase
 // answers, balances or completion records, or reset a reward for another claim.
 for(const db of [guest,contexts.member,contexts.admin,contexts.owner])for(const path of [responsePath,walletPath,claimPath]){
  await assertFails(setDoc(doc(db,path+"-new"),{balance:50000}));
  await assertFails(updateDoc(doc(db,path),{balance:increment(50000)}));
  await assertFails(deleteDoc(doc(db,path)));
 }
 await assertFails(getDocs(collection(contexts.member,"users","member","wallets")));
 await assertFails(getDocs(collection(contexts.member,"users","member","surveyRewards")));
 console.log("Rules: anonymous result isolation and server-only coin/claim writes passed.");

 // Exercise the actual trusted endpoint against real atomic emulator commits.
 const pair=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
 const b64=value=>Buffer.from(value).toString("base64url"),now=Math.floor(Date.now()/1000);
 const jwk={...await crypto.subtle.exportKey("jwk",pair.publicKey),kid:"emulator-test"};
 const pem="-----BEGIN PRIVATE KEY-----\n"+Buffer.from(await crypto.subtle.exportKey("pkcs8",pair.privateKey)).toString("base64")+"\n-----END PRIVATE KEY-----";
 const unsigned=b64(JSON.stringify({alg:"RS256",kid:jwk.kid}))+"."+b64(JSON.stringify({aud:projectId,iss:"https://securetoken.google.com/"+projectId,sub:"integration-member",email_verified:true,exp:now+3600,iat:now,auth_time:now}));
 const idToken=unsigned+"."+b64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(unsigned)));
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  if(String(url).includes("/jwk/securetoken"))return Response.json({keys:[jwk]});
  if(String(url)==="https://oauth2.googleapis.com/token")return Response.json({access_token:"owner",expires_in:3600});
  assert.ok(String(url).startsWith("https://firestore.googleapis.com/v1/projects/"+projectId+"/"));
  return originalFetch(String(url).replace("https://firestore.googleapis.com","http://"+host),options);
 };
 try{
  const env={STORE_MODE:"live",FIREBASE_PROJECT:projectId,REWARD_FIREBASE_PROJECT:projectId,FIREBASE_REWARD_SERVICE_ACCOUNT:JSON.stringify({project_id:projectId,client_email:"test@example.test",private_key:pem})};
  const input={idToken,surveyId:SURVEY_ID,version:1,answers:{q01:2,q11:"Integration test only"},isTest:false,submissionToken:crypto.randomUUID()};
  const results=await Promise.all([submitSurvey(env,input),submitSurvey(env,input)]);
  assert.equal(results.reduce((sum,item)=>sum+item.awarded,0),500);
  await environment.withSecurityRulesDisabled(async context=>{
   const db=context.firestore();
   assert.equal((await getDoc(doc(db,"users/integration-member/wallets/starCoins"))).data().balance,500);
   assert.deepEqual((await getDoc(doc(db,"users/integration-member"))).data(),{role:"user",status:"active"},"No-op account precondition preserves all account fields");
   const saved=(await getDocs(collection(db,"researchSurveys",SURVEY_ID,"responses"))).docs.map(item=>item.data()).find(item=>item.answers.q11==="Integration test only");
   assert.deepEqual(Object.keys(saved).sort(),["answers","isTest","submittedOn","surveyId","version"]);
  });
  const testInput={...input,isTest:true,submissionToken:crypto.randomUUID()};
  assert.equal((await submitSurvey(env,testInput)).awarded,0);
  assert.equal((await submitSurvey(env,testInput)).awarded,0,"Retries of marked tests are idempotent against real Firestore");
  console.log("Trusted endpoint: real concurrent commits, account preservation, 500 coins and test retries passed.");
 }finally{globalThis.fetch=originalFetch;}
}finally{await environment.cleanup();}
