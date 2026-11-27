import test from "node:test";
import assert from "node:assert/strict";
import {activeMembershipStaff,membershipOverrideCollection,effectiveMembership,toggleMembership} from "../../../script/staff-membership-core.mjs";
const NOW=100000,END=200000;
test("active owners and admins automatically receive complimentary Paid membership without a purchase",()=>{
 for(const role of ["admin","owner"]){
  const staff=activeMembershipStaff({role,status:"active"});
  for(const override of [undefined,null,"actual","paid"]){
   const m=effectiveMembership(null,override,staff,NOW);assert.equal(m.status,"paid");assert.equal(m.complimentary,true);assert.equal(m.expiresAt,null);assert.equal(m.actualStatus,"free");
  }
 }
});
test("free view and restoring complimentary membership preserve purchased time",()=>{
 for(const expiry of [null,END]){
  const base=effectiveMembership(expiry,"actual",true,NOW),free=effectiveMembership(expiry,"free",true,NOW);
  assert.equal(free.status,"free");assert.equal(free.complimentary,false);assert.equal(toggleMembership(base),"free");assert.equal(toggleMembership(free),"actual");
  assert.equal(free.expiresAt,base.expiresAt);assert.equal(free.remainingMs,base.remainingMs);assert.deepEqual(effectiveMembership(expiry,toggleMembership(free),true,NOW),base);
 }
});
test("regular users and inactive or demoted staff use purchased membership only",()=>{
 for(const account of [null,{role:"user"},{role:"admin",status:"banned"},{role:"owner",status:"archived"}]){
  const staff=activeMembershipStaff(account);assert.equal(staff,false);
  for(const mode of [undefined,"actual","paid","free"]){assert.equal(effectiveMembership(null,mode,staff,NOW).status,"free");assert.equal(effectiveMembership(END,mode,staff,NOW).status,"paid");assert.equal(effectiveMembership(END,mode,staff,NOW).complimentary,false);}
 }
});
test("preview and live overrides are isolated; emulator tests live rules",()=>{
 assert.equal(membershipOverrideCollection("live"),"staffMembershipOverrides");assert.equal(membershipOverrideCollection("test"),"staffTestMembershipOverrides");assert.equal(membershipOverrideCollection("test",true),"staffMembershipOverrides");
});
test("expired purchases do not expire complimentary membership",()=>{
 const m=effectiveMembership(NOW-1,"actual",true,NOW);assert.equal(m.status,"paid");assert.equal(m.actualStatus,"free");assert.equal(m.remainingMs,0);assert.equal(effectiveMembership(NOW-1,"actual",false,NOW).status,"free");
});
