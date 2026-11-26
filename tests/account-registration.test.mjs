import test from "node:test";
import assert from "node:assert/strict";
import {ageOnDate,ageStatus,registrationError} from "../script/account-registration.mjs";
const now=new Date("2026-11-26T12:00:00Z");
test("under-18 flag expires on the birthday",()=>{
 assert.equal(ageStatus("2008-11-27",now),"Under 18");
 assert.equal(ageStatus("2008-11-26",now),"18+");
 assert.equal(ageStatus("2008-11-27",new Date("2026-11-27T00:00:00Z")),"18+");
 assert.equal(ageStatus(null,now),"Age unknown");
});
test("validate date, minimum age and explicit acceptance",()=>{
 for(const x of ["2010-02-30","2027-01-01","","1899-12-31"])assert.equal(ageOnDate(x,now),null);
 assert.ok(registrationError("2013-11-27",true,now));
 assert.ok(registrationError("2013-11-26",false,now));
 assert.equal(registrationError("2013-11-26",true,now),"");
 assert.equal(ageStatus("2008-02-29",new Date("2026-02-28T23:59:59Z")),"Under 18");
 assert.equal(ageStatus("2008-02-29",new Date("2026-03-01T00:00:00Z")),"18+");
});
