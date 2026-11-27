import test from "node:test";
import assert from "node:assert/strict";
import {activeMembershipStaff,membershipOverrideCollection,effectiveMembership,toggleMembership} from "../../../script/staff-membership-core.mjs";
const NOW=100000,END=200000;
test("staff can switch both ways and return to real membership",()=>{
 for(const expiry of [null,END]){
  const base=effectiveMembership(expiry,"actual",true,NOW);
  const paid=effectiveMembership(expiry,"paid",true,NOW),free=effectiveMembership(expiry,"free",true,NOW);
  assert.equal(paid.status,"paid");assert.equal(free.status,"free");assert.equal(toggleMembership(paid),"free");assert.equal(toggleMembership(free),"paid");
  assert.equal(paid.expiresAt,base.expiresAt);assert.equal(free.expiresAt,base.expiresAt);assert.equal(free.remainingMs,base.remainingMs);assert.deepEqual(effectiveMembership(expiry,"actual",true,NOW),base);
 }
});
test("normal users, revoked staff and banned staff cannot benefit from saved overrides",()=>{
 for(const account of [null,{role:"user"},{role:"admin",status:"banned"},{role:"owner",status:"archived"}]){
  const staff=activeMembershipStaff(account);assert.equal(staff,false);assert.equal(effectiveMembership(null,"paid",staff,NOW).status,"free");assert.equal(effectiveMembership(END,"free",staff,NOW).status,"paid");
 }
 assert.equal(activeMembershipStaff({role:"owner"}),true);assert.equal(activeMembershipStaff({role:"admin",status:"active"}),true);
});
test("preview and live override storage are isolated; emulator can test live rules",()=>{
 assert.equal(membershipOverrideCollection("live"),"staffMembershipOverrides");assert.equal(membershipOverrideCollection("test"),"staffTestMembershipOverrides");assert.equal(membershipOverrideCollection("test",true),"staffMembershipOverrides");
});
test("expired actual membership stays expired under an override",()=>{
 const m=effectiveMembership(NOW-1,"paid",true,NOW);assert.equal(m.status,"paid");assert.equal(m.actualStatus,"free");assert.equal(m.remainingMs,0);assert.equal(effectiveMembership(NOW-1,"actual",true,NOW).status,"free");
});
