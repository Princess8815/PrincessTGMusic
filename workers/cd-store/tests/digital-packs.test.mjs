import test from "node:test";
import assert from "node:assert/strict";
import {DAY_MS,validatePack,validateCatalog,memberStatus,extendMembership,receiptMatches} from "../../../script/digital-packs-core.mjs";
import {digitalAdminAction,digitalStart,fulfillDigital} from "../digital-packs.mjs";
const id="00000000-0000-4000-8000-000000000001",id2="00000000-0000-4000-8000-000000000002",NOW=Date.UTC(2026,10,26);
const membership={id:"membership-30",kind:"membership",name:"Thirty days",description:"Prepaid membership",priceCents:500,active:true,taxCode:"txcd_10000000",days:30};
const coins={id:"coins-100",kind:"coins",name:"100 Star Coins",description:"100 virtual coins",priceCents:200,active:true,taxCode:"txcd_10000000",coins:100};
const uid="member",root="docs",user="users/"+uid,member="memberships/"+uid,wallet=user+"/wallets/starCoins";
function fixture(){
 let seq=0;const docs=new Map(),writes=[];
 for(const [name,role] of [["owner","owner"],["admin","admin"],[uid,"user"]])docs.set("users/"+name,{updateTime:"0",fields:{role:{stringValue:role},status:{stringValue:"active"}}});
 const read=async key=>docs.get(key)||null;
 const commit=async batch=>{
  for(const w of batch){const key=(w.verify||w.update?.name).slice(root.length+1),old=docs.get(key),pre=w.currentDocument;if(pre?.exists===false&&old||pre?.updateTime!==undefined&&old?.updateTime!==pre.updateTime)return false;}
  writes.push(batch);seq++;
  for(const w of batch)if(w.update){const key=w.update.name.slice(root.length+1),old=docs.get(key);docs.set(key,{fields:w.updateMask?{...old?.fields,...w.update.fields}:w.update.fields,updateTime:String(seq)});}
  return true;
 };
 const admin=(name,input)=>digitalAdminAction({root,read,commit,uid:name,input});
 return {docs,writes,read,commit,admin};
}
function payment(orderId,pack,sessionId="cs_live_test123"){
 const session={id:sessionId,mode:"payment",livemode:true,status:"complete",payment_status:"paid",currency:"usd",client_reference_id:orderId,metadata:{digital_order_id:orderId},amount_subtotal:pack.priceCents,amount_total:pack.priceCents+20,automatic_tax:{status:"complete"},payment_intent:"pi_abc"};
 const intent={id:"pi_abc",livemode:true,status:"succeeded",currency:"usd",amount_received:session.amount_total,metadata:{digital_order_id:orderId}};
 return {session,intent};
}
async function begin(f,pack,orderId=id,who=uid){
 await f.admin("owner",{action:"save",pack});
 const calls=[];
 const stripe=async(path,params,key)=>{calls.push({path,params,key});return {id:"cs_live_"+orderId.replace(/-/g,""),status:"open",livemode:true,client_reference_id:orderId,url:"https://checkout.stripe.com/c/pay/example"};};
 const result=await digitalStart({root,read:f.read,commit:f.commit,uid:who,input:{id:orderId,packId:pack.id,priceCents:1,days:9999,coins:999999},stripe,origin:"https://princesstgcreations.pages.dev",clock:()=>NOW});
 return {result,calls,payment:payment(orderId,pack,result.sessionId)};
}
const fulfill=(f,orderId,p,now=NOW,refunded=false)=>fulfillDigital({root,read:f.read,commit:f.commit,id:orderId,...p,clock:()=>now,refunded});
test("Free expires exactly at boundary, paid days stack, expired memberships restart",()=>{
 assert.equal(memberStatus(null,NOW).status,"free");assert.equal(memberStatus(NOW,NOW).status,"free");
 assert.equal(memberStatus(NOW+1,NOW).status,"paid");
 assert.equal(extendMembership(NOW-1,30,NOW),NOW+30*DAY_MS);
 assert.equal(extendMembership(NOW+30*DAY_MS,7,NOW),NOW+37*DAY_MS);
 assert.equal(extendMembership(new Date(NOW+DAY_MS).toISOString(),1,NOW),NOW+2*DAY_MS);
});
test("Owner alone edits packs; validation rejects unsafe inputs",async()=>{
 const f=fixture();await assert.rejects(()=>f.admin("admin",{action:"save",pack:coins}),/Owner/);await assert.rejects(()=>f.admin(uid,{action:"list"}),/Owner/);
 await f.admin("owner",{action:"save",pack:coins});assert.equal((await f.admin("owner",{action:"list"})).packs[0].coins,100);
 assert.throws(()=>validatePack({...coins,priceCents:1}));assert.throws(()=>validatePack({...coins,coins:-1}));assert.throws(()=>validateCatalog([coins,coins]));assert.throws(()=>validatePack({...coins,taxCode:"invalid"}));
});
test("Checkout snapshots authoritative price and idempotent session reference",async()=>{
 const f=fixture(),p=await begin(f,membership);
 assert.equal(p.calls[0].params["line_items[0][price_data][unit_amount]"],"500");assert.equal(p.calls[0].key,"digital-"+id);
 assert.equal(p.calls[0].params["automatic_tax[enabled]"],"true");assert.equal(p.calls[0].params.mode,"payment");
 await f.admin("owner",{action:"save",pack:{...membership,priceCents:900,days:60}});
 const order=JSON.parse(f.docs.get("digitalOrders/"+id).fields.payload.stringValue);assert.equal(order.pack.days,30);assert.equal(order.pack.priceCents,500);
 await assert.rejects(()=>digitalStart({root,read:f.read,commit:f.commit,uid:"admin",input:{id,packId:membership.id},stripe:async()=>{throw Error("should not call");},origin:"https://princesstgcreations.pages.dev",clock:()=>NOW}),/another purchase/);
});
test("Receipt validation rejects unpaid, incorrect amount, test and unmatched payments",()=>{
 const p=payment(id,membership),o={id,pack:membership,sessionId:p.session.id};
 assert.equal(receiptMatches(o,p.session,p.intent),true);
 assert.equal(receiptMatches(o,{...p.session,livemode:false},p.intent),false);
 assert.equal(receiptMatches(o,{...p.session,payment_status:"unpaid"},p.intent),false);
 assert.equal(receiptMatches(o,{...p.session,amount_subtotal:1},p.intent),false);
 assert.equal(receiptMatches(o,p.session,{...p.intent,amount_received:1}),false);
});
test("Membership fulfillment is atomic, replay safe and stacks concurrent purchases",async()=>{
 const f=fixture(),p=await begin(f,membership,id),q=await begin(f,{...membership,days:7},id2);
 await Promise.all([fulfill(f,id,p.payment),fulfill(f,id2,q.payment)]);
 assert.equal(Date.parse(f.docs.get(member).fields.expiresAt.timestampValue),NOW+37*DAY_MS);
 await fulfill(f,id,p.payment);assert.equal(Date.parse(f.docs.get(member).fields.expiresAt.timestampValue),NOW+37*DAY_MS);
});
test("Coin packs credit existing wallet once; refunded payments do not grant credits",async()=>{
 const f=fixture();f.docs.set(wallet,{updateTime:"0",fields:{currency:{stringValue:"starCoins"},balance:{integerValue:"45"}}});
 const p=await begin(f,coins,id);await fulfill(f,id,p.payment);await fulfill(f,id,p.payment);assert.equal(f.docs.get(wallet).fields.balance.integerValue,"145");
 const q=await begin(f,coins,id2);assert.equal((await fulfill(f,id2,q.payment,NOW,true)).status,"refund_review");assert.equal(f.docs.get(wallet).fields.balance.integerValue,"145");
 await fulfill(f,id2,q.payment);assert.equal(f.docs.get(wallet).fields.balance.integerValue,"145");
});
test("Archived account requires support review instead of delivering a pack",async()=>{
 const f=fixture(),p=await begin(f,membership);
 f.docs.set(user,{updateTime:"99",fields:{status:{stringValue:"archived"},role:{stringValue:"user"}}});
 assert.equal((await fulfill(f,id,p.payment)).status,"refund_review");assert.equal(f.docs.has(member),false);
});

test("sandbox purchases cannot change production membership or wallet",async()=>{
 const f=fixture();await f.admin("owner",{action:"save",pack:membership});
 const args={root,read:f.read,commit:f.commit,uid,input:{id,packId:membership.id},mode:"test",origin:"http://localhost:5501",clock:()=>NOW,stripe:async()=>({id:"cs_test_abc123",status:"open",livemode:false,client_reference_id:id,url:"https://checkout.stripe.com/c/pay/test"})};
 const result=await digitalStart(args);
 const p=payment(id,membership,result.sessionId);p.session.livemode=false;p.intent.livemode=false;
 const done=await fulfillDigital({root,read:f.read,commit:f.commit,id,...p,mode:"test",clock:()=>NOW});assert.equal(done.status,"fulfilled");
 assert.equal(f.docs.has(member),false);assert.equal(f.docs.has(wallet),false);assert.equal(Date.parse(f.docs.get("digitalTestMemberships/"+uid).fields.expiresAt.timestampValue),NOW+30*DAY_MS);
 await digitalAdminAction({root,read:f.read,commit:f.commit,uid:"owner",input:{action:"save",pack:{...membership,priceCents:200,days:365}},mode:"test"});
 assert.equal((await f.admin("owner",{action:"list"})).packs[0].days,30);
 assert.equal((await digitalAdminAction({root,read:f.read,commit:f.commit,uid:"owner",input:{action:"list"},mode:"test"})).packs[0].days,365);
 await assert.rejects(()=>fulfillDigital({root,read:f.read,commit:f.commit,id,...p,mode:"live",clock:()=>NOW}),/unavailable/);
});
test("sandbox coin fulfillment remains isolated from real coins",async()=>{
 const f=fixture();await f.admin("owner",{action:"save",pack:coins});
 const r=await digitalStart({root,read:f.read,commit:f.commit,uid,input:{id,packId:coins.id},mode:"test",origin:"http://localhost:5501",clock:()=>NOW,stripe:async()=>({id:"cs_test_xyz123",status:"open",livemode:false,client_reference_id:id,url:"https://checkout.stripe.com/c/pay/test"})});
 const p=payment(id,coins,r.sessionId);p.session.livemode=false;p.intent.livemode=false;
 f.docs.set(wallet,{updateTime:"0",fields:{balance:{integerValue:"50"}}});
 await fulfillDigital({root,read:f.read,commit:f.commit,id,...p,mode:"test",clock:()=>NOW});
 await fulfillDigital({root,read:f.read,commit:f.commit,id,...p,mode:"test",clock:()=>NOW});
 assert.equal(f.docs.get(wallet).fields.balance.integerValue,"50");assert.equal(f.docs.get("digitalTestWallets/"+uid).fields.balance.integerValue,"100");
});

test("all existing live packs persist and appear in sandbox even after isolated edits",async()=>{
 const f=fixture();
 const annual={...membership,id:"annual-365",days:365,name:"365 days"};
 await f.admin("owner",{action:"save",pack:membership});
 await digitalAdminAction({root,read:f.read,commit:f.commit,uid:"owner",input:{action:"save",pack:{...membership,days:60}},mode:"test"});
 await f.admin("owner",{action:"save",pack:annual});
 await f.admin("owner",{action:"save",pack:coins});
 const list=await digitalAdminAction({root,read:f.read,commit:f.commit,uid:"owner",input:{action:"list"},mode:"test"});
 assert.equal(list.packs.length,3);assert.equal(list.packs.find(p=>p.id===annual.id).days,365);
 assert.equal(list.packs.find(p=>p.id===membership.id).days,60);
 const real=await f.admin("owner",{action:"list"});assert.equal(real.packs.length,3);assert.equal(real.packs.find(p=>p.id===membership.id).days,30);
 const started=await digitalStart({root,read:f.read,commit:f.commit,uid,input:{id,packId:annual.id},mode:"test",origin:"http://localhost:5501",clock:()=>NOW,stripe:async()=>({id:"cs_test_annual",status:"open",livemode:false,client_reference_id:id,url:"https://checkout.stripe.com/c/pay/test"})});
 assert.equal(started.status,"pending");
});
