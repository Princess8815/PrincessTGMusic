import test from "node:test";
import assert from "node:assert/strict";
import {deliverVerification,verificationMessage,verificationPreviewOrigin,memberActionLink,RESERVE_SQL,STATUS_SQL,verificationWait} from "../member-verification.mjs";
const link="https://music-and-poetry.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=test";
function setup(overrides={}){
 const calls=[];const account={email:"member@yahoo.com",emailVerified:false,validSince:"5"};
 const input={uid:"uid",claims:{email:account.email,auth_time:10},ip:"192.0.2.1",
 lookup:async()=>({...account}),reserve:async(...a)=>{calls.push(["reserve",...a]);return true;},
 generate:async email=>{calls.push(["generate",email]);return link;},send:async(email,url)=>{calls.push(["send",email,url]);},...overrides};
 return {input,account,calls};
}
test("only authenticated account email is used and link is not returned",async()=>{
 const {input,calls}=setup();input.email="attacker@example.com";
 assert.deepEqual(await deliverVerification(input),{accepted:true,alreadyVerified:false});
 assert.equal(calls[2][1],"member@yahoo.com");assert.equal(calls[2][2],link);
});
test("already verified, disabled, stale or mismatched accounts do not send",async()=>{
 for(const account of [{email:"member@yahoo.com",emailVerified:true},{email:"member@yahoo.com",disabled:true},{email:"other@example.com"},{email:"member@yahoo.com",validSince:"11"}]){
  const {input,calls}=setup({lookup:async()=>account});
  if(account.emailVerified)assert.deepEqual(await deliverVerification(input),{alreadyVerified:true});
  else await assert.rejects(deliverVerification(input),{status:401});
  assert.equal(calls.length,0);
 }
});
test("rate limit stops upstream link generation",async()=>{
 const {input,calls}=setup({reserve:async()=>false});await assert.rejects(deliverVerification(input),{status:429});assert.equal(calls.length,0);
});
test("reject invalid link and changed address before sending",async()=>{
 const bad=setup({generate:async()=>"https://example.com/"});await assert.rejects(deliverVerification(bad.input),{status:503});
 let n=0;const changed=setup({lookup:async()=>({email:++n===1?"member@yahoo.com":"other@example.com"})});
 await assert.rejects(deliverVerification(changed.input),{status:401});assert.equal(changed.calls.some(c=>c[0]==="send"),false);
});
test("provider failure propagates; no false success",async()=>{
 const {input}=setup({send:async()=>{throw Error("provider failed");}});await assert.rejects(deliverVerification(input),/provider failed/);
});
test("escape HTML and restrict preview origin",()=>{
 assert.match(verificationMessage("member@yahoo.com",link,"sender@example.com").html,/mode=verifyEmail&amp;oobCode=test/);
 const env={STORE_MODE:"live",VERIFICATION_PREVIEW_ORIGIN:"https://branch.example.com"};
 assert.equal(verificationPreviewOrigin(env,env.VERIFICATION_PREVIEW_ORIGIN),true);
 assert.equal(verificationPreviewOrigin(env,"https://other.example.com"),false);
 assert.equal(verificationPreviewOrigin({...env,STORE_MODE:"test"},env.VERIFICATION_PREVIEW_ORIGIN),false);
 assert.match(RESERVE_SQL,/INSERT INTO verification_sends/);
});

test("custom action links stay on trusted origins without query secrets",()=>{
 const env={STORE_MODE:"live",VERIFICATION_PREVIEW_ORIGIN:"https://preview.example.com"};
 const url=new URL(memberActionLink(link,env,"https://princesstg-creations.com",true));
 assert.equal(url.origin,"https://princesstg-creations.com");assert.equal(url.pathname,"/pages/verify-email.html");
 assert.equal(url.search,"");assert.equal(new URLSearchParams(url.hash.slice(1)).get("oobCode"),"test");
 assert.equal(memberActionLink(link,env,"https://untrusted.example.com",true),link);
 assert.equal(memberActionLink(link,env,env.VERIFICATION_PREVIEW_ORIGIN,false),link);
 assert.equal(new URL(memberActionLink(link,env,env.VERIFICATION_PREVIEW_ORIGIN,true)).origin,env.VERIFICATION_PREVIEW_ORIGIN);
});

test("cooldown reflects the longest active rolling limit",()=>{
 const now=100000000;
 assert.equal(verificationWait({},now),0);
 assert.equal(verificationWait({uid_latest:now-15000},now),45000);
 assert.equal(verificationWait({email_latest:now-60000},now),0);
 assert.equal(verificationWait({uid_latest:now-10000,email_daily:now-86400000+120000},now),120000);
 assert.equal(verificationWait({ip_hourly:now-3600000+70000,global_daily:now-86400000+90000},now),90000);
 assert.match(STATUS_SQL,/OFFSET 79/);
});
