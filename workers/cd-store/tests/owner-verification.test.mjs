import test from "node:test";
import assert from "node:assert/strict";
import {approveVerification} from "../owner-verification.mjs";
function fixture(){
 const docs={"users/owner":{fields:{role:{stringValue:"owner"}}},"users/member":{fields:{role:{stringValue:"user"},auth:{mapValue:{fields:{email:{stringValue:"test@example.test"}}}}}}};
 const accounts={owner:{emailVerified:true},member:{email:"test@example.test",emailVerified:false}},events=[];
 return {docs,accounts,events,opts:{actorUid:"owner",input:{action:"grant",targetUid:"member",expectedEmail:"test@example.test"},read:async p=>docs[p],lookup:async u=>accounts[u],markVerified:async u=>{events.push("update");accounts[u].emailVerified=true;},audit:async()=>events.push("audit"),finish:async()=>events.push("finish"),clock:()=>0,makeId:()=>"event"}};
}
test("approval updates Auth after audit and does not repeat the mutation",async()=>{const a=fixture();assert.equal((await approveVerification(a.opts)).emailVerified,true);assert.deepEqual(a.events,["audit","update","finish"]);assert.equal((await approveVerification(a.opts)).alreadyVerified,true);assert.equal(a.events.length,3);});
test("status is read only",async()=>{const a=fixture();a.opts.input.action="status";assert.equal((await approveVerification(a.opts)).emailVerified,false);assert.equal(a.events.length,0);});
test("unauthorized or mismatched accounts and failed audit cannot be verified",async()=>{
 for(const change of [x=>x.docs["users/owner"].fields.role.stringValue="admin",x=>x.accounts.owner.emailVerified=false,x=>x.opts.input.expectedEmail="wrong",x=>x.accounts.member.disabled=true,x=>x.docs["users/member"].fields.role.stringValue="owner",x=>x.opts.audit=async()=>{throw Error("unavailable")},x=>x.opts.input.targetUid="owner",x=>x.docs["users/member"].fields.status={stringValue:"banned"}]){const x=fixture();change(x);await assert.rejects(()=>approveVerification(x.opts));assert.equal(x.accounts.member.emailVerified,false);}
});
