import test from "node:test";
import assert from "node:assert/strict";
import {isActiveOwner} from "../script/owner-access.js";
test("Only an active owner qualifies for owner tools",()=>{
 assert.equal(isActiveOwner({role:"owner",status:"active"}),true);
 assert.equal(isActiveOwner({role:"owner"}),true);
 for(const account of [null,{}, {role:"user",status:"active"},{role:"admin",status:"active"},{role:"owner",status:"banned"},{role:"owner",status:"archived"},{role:"owner",status:null},{role:"owner",status:""},{role:"Owner",status:"active"}])assert.equal(isActiveOwner(account),false);
});
