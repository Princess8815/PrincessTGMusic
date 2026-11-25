import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {ERROR_LIST,errorCode,publicError,siteError,storeError,withErrorCode} from "../script/site-errors.js";

const codes=new Set(ERROR_LIST.map(item=>item.code));
assert.equal(codes.size,ERROR_LIST.length,"Each public error has a unique reference");
for(const item of ERROR_LIST){
 assert.match(item.code,/^PTG-\d{3}$/);
 assert.ok(item.help.length>0);
 assert.equal(errorCode(siteError(item.code)),item.code);
 assert.ok(publicError(null,item.code).includes(item.code));
}
const privateDetails="Firebase permission-denied at users/private; internal-token; TypeError: stack";
for(const error of [Error(privateDetails),{message:privateDetails,code:"unknown"},privateDetails,{code:"__proto__"},{code:"constructor"}]){
 const result=publicError(error,"PTG-301");
 assert.equal(result,"Documents unavailable. (PTG-301)");
 assert.ok(!result.includes(privateDetails));
}
assert.equal(errorCode({code:"auth/invalid-credential"}),"PTG-102");
assert.equal(errorCode({code:"auth/too-many-requests"}),"PTG-004");
assert.equal(errorCode({code:"functions/permission-denied"}),"PTG-003");
assert.equal(errorCode({status:401}),"PTG-005");
assert.equal(errorCode({name:"QuotaExceededError"}),"PTG-006");
assert.equal(errorCode({code:"card_declined"}),"PTG-207");
assert.equal(withErrorCode(publicError(null,"PTG-104")),publicError(null,"PTG-104"));
assert.match(withErrorCode("Choose a recipient."),/Choose a recipient\. \(PTG-007\)/);
assert.equal(errorCode(storeError(Error("Insufficient stock for sku/private"),"/checkout")),"PTG-208");
assert.equal(errorCode(storeError(Error("Invalid shipping address: private data"),"/shipping-quotes")),"PTG-203");
assert.equal(errorCode(storeError(Error("Failed to fetch"),"/checkout")),"PTG-002");
const retry=storeError(Object.assign(Error(privateDetails),{status:503}),"/status");
assert.equal(retry.status,503,"Recovery still sees the retryable HTTP status");
assert.equal(errorCode(retry),"PTG-204");
assert.equal(errorCode(storeError(Error(privateDetails),"/claim-reward")),"PTG-213");
assert.ok(!publicError(retry).includes("Firebase"));
assert.equal(errorCode(null,"missing"),"PTG-001");
// Verify the final displayed state for both missing-song routes.
const songPage=await readFile(new URL("../audioPlayer/script/song-pages.js",import.meta.url),"utf8");
const initialize=songPage.match(/async function initializeSongPage\(\) \{[\s\S]+?\n\}/)[0]
 .replaceAll("import.meta.url",JSON.stringify(new URL("../audioPlayer/script/song-pages.js",import.meta.url).href));
for(const search of ["","?id=missing-song"]){
 const displayed=new Map();
 await new Function("window","setText","publicError","loadSong","SONG_JSON",initialize+";return initializeSongPage();")(
  {location:{search}},(id,value)=>displayed.set(id,value),publicError,async()=>null,"");
 assert.equal(displayed.get("songStatus"),publicError(null,"PTG-008"));
}
console.log("Public error messages and service mapping passed");
