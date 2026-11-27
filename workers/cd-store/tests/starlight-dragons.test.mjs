import test from "node:test";
import assert from "node:assert/strict";
import {DRAGON_CATALOG,validateDragonImport,isElementalDragon} from "../../../script/starlight-dragons.mjs";
import {purchaseCheck} from "../../../script/starlight-model.mjs";
const image="data:image/webp;base64,UklGRg==";
const fixture=()=>({version:1,type:{id:"dragons",name:"Dragons"},items:DRAGON_CATALOG.map(([id,name,price])=>({id,name,price,typeId:"dragons",active:true,image}))});
test("all six dragon IDs, prices and import fields are stable",()=>{
 const rows=validateDragonImport(fixture());assert.equal(rows.length,6);assert.equal(Math.min(...rows.map(x=>x.price)),1000000);assert.equal(new Set(rows.map(x=>x.id)).size,6);assert.ok(rows.every(isElementalDragon));
});
test("rejects tampered prices, missing images and duplicate IDs",()=>{
 for(const change of [x=>x.items[0].price=1,x=>x.items[0].image="https://invalid.test/dragon",x=>x.items[1].id=x.items[0].id]){const data=fixture();change(data);assert.throws(()=>validateDragonImport(data));}
});
test("existing purchase validation charges correct amount and does not rebuy",()=>{
 for(const item of validateDragonImport(fixture())){
  const args={account:{status:"active"},item,wallet:{balance:item.price},owned:false,expectedPrice:item.price};
  assert.equal(purchaseCheck(args).balance,0);assert.equal(purchaseCheck({...args,owned:true}).charged,0);
  assert.throws(()=>purchaseCheck({...args,wallet:{balance:item.price-1}}));assert.throws(()=>purchaseCheck({...args,expectedPrice:1}));
 }
});
