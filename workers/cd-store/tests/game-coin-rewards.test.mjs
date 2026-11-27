import test from "node:test";
import assert from "node:assert/strict";
import {rewardMultiplier,multiplyGameCoins,gameCoinAward} from "../game-coin-rewards.mjs";
import {initialState,begin,guess,COINS} from "../hanggirl-core.mjs";
const now=1800000000000;
const account=(role="user",status="active")=>({updateTime:"account-v1",fields:{role:{stringValue:role},status:{stringValue:status}}});
const membership=ms=>({updateTime:"membership-v1",fields:{expiresAt:{timestampValue:new Date(ms).toISOString()}}});
const override=mode=>({updateTime:"override-v1",fields:{mode:{stringValue:mode}}});
test("current membership, expiry boundary, staff complimentary membership and Free override",()=>{
 for(const [a,m,o,want] of [[account(),null,null,1],[account(),membership(now+1),null,2],[account(),membership(now),null,1],[account(),membership(now-1),null,1],[account("owner"),null,null,2],[account("admin"),null,override("actual"),2],[account("owner"),membership(now+1),override("free"),1],[account("admin","banned"),null,null,1],[account("banned"),membership(now+1),null,1]])assert.equal(rewardMultiplier(a,m,o,now),want);
});
test("double positive earnings only, preserve purchase costs and safe integer checks",()=>{
 for(const n of [1,2,10,11,30,50,104])assert.equal(multiplyGameCoins(n,2),n*2);
 assert.equal(multiplyGameCoins(-100,2),-100);assert.equal(multiplyGameCoins(0,2),0);assert.throws(()=>multiplyGameCoins(Number.MAX_SAFE_INTEGER,2));assert.throws(()=>multiplyGameCoins(1.5,2));
});
test("server uses only authoritative membership and live override docs, with CAS guards",async()=>{
 const reads=[];let value=membership(now+1000);const read=async path=>{reads.push(path);return value;};
 const ctx={read,root:"documents",uid:"test",clock:()=>now};
 let r=await gameCoinAward({...ctx,account:account(),coins:10});assert.equal(r.coins,20);assert.deepEqual(r.checks,[{verify:"documents/memberships/test",currentDocument:{updateTime:"membership-v1"}}]);
 value=override("free");r=await gameCoinAward({...ctx,account:account("owner"),coins:10});assert.equal(r.coins,10);assert.equal(r.checks[0].verify,"documents/staffMembershipOverrides/test");
 value=null;r=await gameCoinAward({...ctx,account:account("admin"),coins:5});assert.equal(r.coins,10);assert.deepEqual(r.checks[0].currentDocument,{exists:false});
 r=await gameCoinAward({...ctx,account:account(),coins:-100});assert.equal(r.coins,-100);assert.deepEqual(r.checks,[]);assert.deepEqual(reads,["memberships/test","staffMembershipOverrides/test","staffMembershipOverrides/test"]);
});
test("Hanggirl new base amounts and verified Paid amounts; old completed rounds untouched",async()=>{
 assert.deepEqual(COINS,{easy:10,medium:30,hard:50});
 for(const d of Object.keys(COINS)){
  let s=begin(initialState(),d,"cry","round");for(const l of "cry")s=guess(s,l);
  assert.equal(s.round.awarded,COINS[d]);
  const r=await gameCoinAward({read:async()=>membership(now+1000),root:"documents",uid:"u",account:account(),coins:s.round.awarded,clock:()=>now});assert.equal(r.coins,2*COINS[d]);assert.equal(guess(s,"a"),s);
 }
});
