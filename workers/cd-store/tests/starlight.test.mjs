
import test from "node:test";
import assert from "node:assert/strict";
import {purchaseCheck,mergeTypes,validImage} from "../../../script/starlight-model.mjs";
import {purchaseWithStorage,starlightOrigin} from "../starlight.mjs";
const image="data:image/webp;base64,AAAA";
const item={name:"Aqua",price:25,typeId:"axolotls",image,active:true};
const input={account:{status:"active"},item,wallet:{balance:100},expectedPrice:25,owned:false};
test("exact price, low balance, retired, banned, repeat purchase",()=>{
 assert.deepEqual(purchaseCheck(input),{alreadyOwned:false,charged:25,balance:75});
 assert.throws(()=>purchaseCheck({...input,wallet:{balance:24}}),/Not enough/);
 assert.throws(()=>purchaseCheck({...input,expectedPrice:1}),/price changed/);
 assert.throws(()=>purchaseCheck({...input,item:{...item,active:false}}),/unavailable/);
 for(const typeId of ["trophies","medals","diplomas"])assert.throws(()=>purchaseCheck({...input,item:{...item,typeId}}),/unavailable/);
 assert.throws(()=>purchaseCheck({...input,account:{status:"banned"}}),/active account/);
 assert.deepEqual(purchaseCheck({...input,owned:true,item:null}),{alreadyOwned:true,charged:0});
 assert.equal(validImage("data:image/svg+xml;base64,AAAA"),false);
 assert.equal(mergeTypes([{id:"pins",name:"Pins"}]).at(-1).name,"Pins");
});
test("scoped preview origin",()=>{
 const e={STORE_MODE:"live",STARLIGHT_PREVIEW_HOST:"princesstgcreations.pages.dev"};
 assert.equal(starlightOrigin(e,"http://127.0.0.1:5501"),true);
 assert.equal(starlightOrigin(e,"https://branch.princesstgcreations.pages.dev"),true);
 assert.equal(starlightOrigin(e,"https://branch.princesstgcreations.pages.dev.evil.net"),false);
 assert.equal(starlightOrigin({...e,STORE_MODE:"test"},"http://localhost:5501"),false);
});
test("atomic ownership, wallet preconditions, retry after a racing debit",async()=>{
 const fs=v=>({updateTime:"v1",fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,typeof x==="number"?{integerValue:String(x)}:typeof x==="boolean"?{booleanValue:x}:{stringValue:x}]))});
 let wallet=fs({balance:100}),owned=null,attempts=0,charged=0;
 const read=async path=>path==="users/u"?fs({status:"active"}):path==="starlightItems/item"?fs(item):path.endsWith("/starCoins")?wallet:owned;
 const commit=async writes=>{
  attempts++;const debit=writes.find(w=>w.update?.name.endsWith("/starCoins"));const claim=writes.find(w=>w.update?.name.endsWith("/starlightCollectibles/item"));
  assert.equal(claim.currentDocument.exists,false);assert.equal(writes.filter(w=>w.verify).length,2);
  assert.equal(debit.currentDocument.updateTime,wallet.updateTime);
  if(attempts===1){wallet=fs({balance:80});wallet.updateTime="v2";return false;}
  charged++;wallet={...wallet,fields:debit.update.fields};owned=claim.update;return true;
 };
 const args={read,commit,root:"projects/p/databases/(default)/documents",uid:"u",itemId:"item",expectedPrice:25};
 assert.equal((await purchaseWithStorage(args)).balance,55);
 assert.equal((await purchaseWithStorage(args)).alreadyOwned,true);
 assert.equal(charged,1);assert.equal(attempts,2);
});
