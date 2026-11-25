// Authoritative CD checkout. No Firebase Admin credentials, no Blaze functions.
import {storeProducts} from "../../script/store-catalog.js";
import {rewardProject,rewardAvailable,adminSandboxRewards,verifiedBuyer,verifiedShippingStaff,awardPaidOrder} from "./rewards.js";
import {refundEvents,intentFromRefundEvent,syncRefunds,retryRefunds} from "./refunds.js";
import {shippingEnabled,settings as shippingSettings,getRates,selectedRate,latestTestDiagnostics} from "./shipping.js";
import {CD_PROFILE,readProduct,packFor,catalog,saveCatalog} from "./merchandise.js";
import {inventoryList,inventoryLines,processingFor,saveInventory,orderStage,fulfillmentOrders} from "./inventory.js";
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const str=(v,max,required=true)=>{if(typeof v!=="string"||v.length>max||required&&!v.trim())fail("Please complete the shipping address.");return v.trim();};
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const bytes=s=>new TextEncoder().encode(s);
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");
const hash=async s=>hex(await crypto.subtle.digest("SHA-256",bytes(s)));
function equals(a,b){if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;let c=0;for(let i=0;i<a.length;i++)c|=a.charCodeAt(i)^b.charCodeAt(i);return c===0;}
function zones(env){
 let z;try{z=JSON.parse(env.SHIPPING_ZONES||"[]");}catch{fail("Shipping configuration invalid.",503);}
 if(!Array.isArray(z)||z.length>10000||z.some(x=>!x||!/^([A-Z]{2})$/.test(x.country)||typeof x.state!=="string"||typeof x.city!=="string"||!integer(x.firstCents,0,100000)||!integer(x.extraCents,0,100000)))fail("Shipping configuration invalid.",503);
 return z;
}
function shipping(z,address,count){
 const matching=z.filter(x=>x.country===address.country&&(x.state==="*"||x.state===address.state)&&(x.city==="*"||x.city.toLowerCase()===address.city.toLowerCase())).sort((a,b)=>(b.state!=="*")*2+(b.city!=="*")-((a.state!=="*")*2+(a.city!=="*")));
 if(!matching.length)fail("We do not yet ship to that destination.");
 const rate=matching[0];return rate.firstCents+(count-1)*rate.extraCents;
}
function addressOf(input){
 if(!input||typeof input!=="object")fail("Shipping address required.");
 const a={name:str(input.name,120),email:str(input.email,254),country:str(input.country,2).toUpperCase(),state:str(input.state,100,false),city:str(input.city,100),line1:str(input.line1,200),line2:str(input.line2||"",200,false),postal_code:str(input.postal_code||"",30,input.country==="US"||input.country==="CA")};
 a.phone=str(input.phone||"",40,false);
 if(!/^[A-Z]{2}$/.test(a.country)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)||(["US","CA"].includes(a.country)&&!a.state))fail("Enter a valid email and complete destination.");
 return a;
}
function flatten(v){if(!v)return null;if("stringValue"in v)return v.stringValue;if("booleanValue"in v)return v.booleanValue;if("integerValue"in v)return Number(v.integerValue);if("doubleValue"in v)return v.doubleValue;if("arrayValue"in v)return (v.arrayValue.values||[]).map(flatten);if("mapValue"in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,flatten(x)]));return null;}
async function productLines(env,cart){
 if(!Array.isArray(cart)||!cart.length||cart.length>8)fail("Choose 1–8 different products per order.");
 const combined=new Map();
 for(const row of cart){
  if(!row||!integer(row.quantity,1,10))fail("Invalid cart quantity.");
  let sku;
  if(row.productId!==undefined){
   if(typeof row.productId!=="string"||!/^[a-z0-9][a-z0-9-]{0,59}$/.test(row.productId)||row.albumId!==undefined||row.volume!==undefined)fail("Invalid merchandise cart.");
   if(!shippingEnabled(env))fail("Merchandise requires carrier shipping.",409);
   sku="merch:"+row.productId;
  }else{
   if(typeof row.albumId!=="string"||!/^[a-z0-9-]{1,140}$/.test(row.albumId)||!integer(row.volume,1,20))fail("Invalid CD cart.");
   sku=row.albumId+":"+row.volume;
  }
  if(combined.has(sku))fail("Duplicate cart line.");combined.set(sku,row);
 }
 const albums=new Map();
 await Promise.all([...new Set(cart.filter(r=>r.productId===undefined).map(x=>x.albumId))].map(async id=>{
  const url="https://firestore.googleapis.com/v1/projects/"+encodeURIComponent(env.FIREBASE_PROJECT)+"/databases/(default)/documents/albums/"+encodeURIComponent(id);
  const r=await fetch(url,{headers:{Accept:"application/json"},cf:{cacheTtl:0}});
  if(r.status===404)fail("An album is no longer available.",409);if(!r.ok)fail("Album catalog unavailable.",503);
  const data=await r.json();albums.set(id,Object.fromEntries(Object.entries(data.fields||{}).map(([k,v])=>[k,flatten(v)])));
 }));
 const lines=await Promise.all([...combined].map(async ([sku,row])=>{
  if(row.productId!==undefined){
   const p=await readProduct(env,row.productId);if(!p?.enabled)fail("A product is no longer available.",409);
   return {sku,name:p.name,quantity:row.quantity,priceCents:p.priceCents,songIds:[],kind:"merch",profileId:p.profileId,taxCode:p.taxCode,customs:{description:p.customsDescription,originCountry:p.originCountry,tariffNumber:p.tariffNumber,unitWeight:p.unitWeight}};
  }
  const p=storeProducts(row.albumId,albums.get(row.albumId)).find(p=>p.volume===row.volume);
  if(!p)fail("A CD is no longer available.",409);
  return {sku:p.sku,name:p.name,quantity:row.quantity,priceCents:p.priceCents,songIds:p.songIds,kind:"cd",profileId:CD_PROFILE,taxCode:env.CD_TAX_CODE};
 }));
 const count=lines.reduce((n,l)=>n+l.quantity,0);if(count>20)fail("Maximum 20 items per order.");
 return {lines:await inventoryLines(env,lines),count};
}
function configured(env){
 const mode=env.STORE_MODE;
 if(!["test","live"].includes(mode)||!env.STRIPE_SECRET_KEY?.startsWith("sk_"+mode+"_")||!env.STRIPE_PUBLISHABLE_KEY?.startsWith("pk_"+mode+"_")||!env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")||!/^txcd_\d+$/.test(env.CD_TAX_CODE||"")||!/^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(env.FORMSPREE_URL||"")||!env.ORDERS)fail("Checkout is not configured yet.",503);
 if(shippingEnabled(env))shippingSettings(env);else if(mode==="live"||!zones(env).length)fail("Live carrier shipping must be configured.",503);
 if(mode==="live"&&(env.LIVE_READY!=="yes"||(env.ALLOWED_ORIGINS||"").includes("github.io")||!rewardProject(env)||!env.FIREBASE_REWARD_SERVICE_ACCOUNT))fail("Live checkout has not been enabled.",503);
}
async function stripe(env,path,params,key){
 const headers={Authorization:"Bearer "+env.STRIPE_SECRET_KEY,"Stripe-Version":"2025-03-31.basil"};
 if(params)headers["Content-Type"]="application/x-www-form-urlencoded";
 if(key)headers["Idempotency-Key"]=key;
 const res=await fetch("https://api.stripe.com/v1/"+path,{method:params?"POST":"GET",headers,body:params?new URLSearchParams(params):undefined});
 const data=await res.json();
 if(!res.ok){console.warn("Stripe request failed",path.split("/")[0],data.error?.code||res.status);fail("Payment or tax service unavailable. Please retry or contact the store.",502);}
 return data;
}
function addressFields(a){const {name,email,phone,...address}=a;return address;}
async function calculate(env,lines,a,ship){
 const params={currency:"usd","customer_details[address_source]":"shipping","shipping_cost[amount]":String(ship),"shipping_cost[tax_behavior]":"exclusive"};
 for(const [k,v] of Object.entries(addressFields(a)))if(v)params["customer_details[address]["+k+"]"]=v;
 lines.forEach((l,i)=>{const base="line_items["+i+"]";params[base+"[amount]"]=String(l.priceCents*l.quantity);params[base+"[quantity]"]=String(l.quantity);params[base+"[reference]"]=l.sku;params[base+"[tax_code]"]=l.taxCode||env.CD_TAX_CODE;params[base+"[tax_behavior]"]="exclusive";});
 const calc=await stripe(env,"tax/calculations",params);
 const subtotal=lines.reduce((n,l)=>n+l.priceCents*l.quantity,0);
 if(calc.currency!=="usd"||!integer(calc.tax_amount_exclusive,0,10000000)||calc.amount_total!==subtotal+ship+calc.tax_amount_exclusive)fail("Tax total could not be verified.",502);
 return {subtotal,shipping:ship,tax:calc.tax_amount_exclusive,total:calc.amount_total,calculation:calc.id};
}
async function getOrder(env,id){return env.ORDERS.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();}
async function ownedOrder(env,id,token){
 if(!uuid(id)||!uuid(token))fail("Invalid order reference.");
 const row=await getOrder(env,id);if(!row||!equals(row.token_hash,await hash(token)))fail("Order not found.",404);return row;
}
async function quoteFingerprint(a,lines,pack,env){return hash(JSON.stringify({address:a,lines:[...lines].sort((a,b)=>a.sku.localeCompare(b.sku)),pack,customs:shippingSettings(env).customs}));}
async function shippingQuote(env,b){
 configured(env);if(!shippingEnabled(env))fail("Carrier shipping unavailable.",409);
 const a=addressOf(b.address),{lines,count}=await productLines(env,b.cart),pack=await packFor(env,lines,count),quote=await getRates(env,a,lines,count,fetch,pack),id=crypto.randomUUID(),expires=Date.now()+15*60*1000;
 await env.ORDERS.prepare("INSERT INTO shipping_quotes(id,fingerprint,expires,payload) VALUES(?,?,?,?)").bind(id,await quoteFingerprint(a,lines,pack,env),expires,JSON.stringify(quote)).run();
 return {id,expires,options:quote.options,international:quote.international,processing:processingFor(lines)};
}
async function shippingAdmin(env,b){
 if(!await verifiedShippingStaff(env,b.idToken))fail("Administrator access required.",403);
 if(b.orderId){
  if(!uuid(b.orderId))fail("Invalid order reference.");
  const row=await getOrder(env,b.orderId);if(!row)fail("Order not found.",404);
  const p=JSON.parse(row.payload);
  return {mode:env.STORE_MODE,order:{id:row.id,status:row.status,shipping:row.status==="paid"?p.shippingService||null:null,total:row.total}};
 }
 const c=shippingEnabled(env)?shippingSettings(env):null;return {mode:env.STORE_MODE,enabled:!!c,countries:c?.countries||[],pack:c?.pack||null,internationalConfigured:!!c?.customs,packagingVerified:env.SHIPPO_PACKAGING_VERIFIED==="yes",estimatedPackagingAccepted:c?.estimatedPackaging===true,...(env.STORE_MODE==="test"?{latestTestShipment:await latestTestDiagnostics(env)}:{})};
}
async function startOrder(env,body){
 configured(env);
 if(!uuid(body.id)||!uuid(body.token))fail("Invalid checkout reference.");
 let row=await getOrder(env,body.id);
 if(row){row=await ownedOrder(env,body.id,body.token);}
 else{
  if(!body.address||!body.cart)fail("Checkout was not initialized. Cancel this reference and try again.",404);
  const buyer=await verifiedBuyer(env,body.idToken);
  const a=addressOf(body.address),{lines,count}=await productLines(env,body.cart);
  let shippingService=null,ship;
  if(shippingEnabled(env)){
   if(!uuid(body.quoteId)||typeof body.rateId!=="string")fail("Request and select a shipping service first.");
   const q=await env.ORDERS.prepare("SELECT * FROM shipping_quotes WHERE id=?").bind(body.quoteId).first();
   const pack=await packFor(env,lines,count);
   shippingService=selectedRate(q,body.rateId,await quoteFingerprint(a,lines,pack,env));
   if(!shippingSettings(env).countries.includes(a.country))fail("Destination no longer supported.",409);
   ship=shippingService.totalCents;
  }else ship=shipping(zones(env),a,count);
  const totals=await calculate(env,lines,a,ship);
  const payload=JSON.stringify({address:a,lines,subtotal:totals.subtotal,shipping:totals.shipping,tax:totals.tax,total:totals.total,shippingService,processing:processingFor(lines)});
  try{await env.ORDERS.prepare("INSERT OR IGNORE INTO orders(id,token_hash,created,payload,total,calculation,reward_uid) VALUES(?,?,?,?,?,?,?)").bind(body.id,await hash(body.token),Date.now(),payload,totals.total,totals.calculation,buyer).run();}catch(e){if(String(e.message).includes("Inventory changed"))fail("Inventory changed. Cancel this checkout and refresh your cart.",409);throw e;}
  row=await ownedOrder(env,body.id,body.token);
 }
 if(row.status!=="pending"||Date.now()-row.created>30*60*1000)fail("This checkout is no longer editable. Check order status first.",409);
 const p=JSON.parse(row.payload),a=p.address;
 let intent;
 if(row.intent)intent=await stripe(env,"payment_intents/"+row.intent);
 else{
  const params={amount:String(row.total),currency:"usd","payment_method_types[0]":"card","metadata[store_order_id]":row.id,"shipping[name]":a.name,receipt_email:a.email};
  for(const [k,v] of Object.entries(addressFields(a)))if(v)params["shipping[address]["+k+"]"]=v;
  intent=await stripe(env,"payment_intents",params,"cd-intent-"+row.id);
  await env.ORDERS.prepare("UPDATE orders SET intent=? WHERE id=? AND status='pending' AND (intent IS NULL OR intent=?)").bind(intent.id,row.id,intent.id).run();
  const fresh=await ownedOrder(env,body.id,body.token);
  if(fresh.status!=="pending"||fresh.intent!==intent.id){
   if(fresh.status==="canceled"&&fresh.intent!==intent.id)try{await stripe(env,"payment_intents/"+intent.id+"/cancel",{},"cd-cancel-"+row.id);}catch(e){console.warn("Unexposed payment intent cleanup needed",row.id);}
   fail("Checkout was closed. Check order status.",409);
  }
 }
 if(!["requires_payment_method","requires_confirmation","requires_action"].includes(intent.status))fail("This payment is already processing or complete. Check order status.",409);
 return {id:row.id,clientSecret:intent.client_secret,publishableKey:env.STRIPE_PUBLISHABLE_KEY,mode:env.STORE_MODE,lines:p.lines,subtotal:p.subtotal,shipping:p.shipping,tax:p.tax,total:p.total,shippingService:p.shippingService||null,processing:p.processing||processingFor(p.lines)};
}
async function verifyWebhook(request,env){
 const raw=await request.text(),header=request.headers.get("Stripe-Signature")||"";
 if(raw.length>250000||!env.STRIPE_WEBHOOK_SECRET)fail("Invalid webhook.",400);
 const pairs=header.split(",").map(x=>x.split("=")),t=pairs.find(x=>x[0]==="t")?.[1];
 if(!/^\d+$/.test(t||"")||Math.abs(Date.now()/1000-Number(t))>300)fail("Webhook timestamp invalid.",400);
 const key=await crypto.subtle.importKey("raw",bytes(env.STRIPE_WEBHOOK_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const expected=hex(await crypto.subtle.sign("HMAC",key,bytes(t+"."+raw)));
 if(!pairs.some(([k,v])=>k==="v1"&&equals(v,expected)))fail("Webhook signature invalid.",400);
 try{return JSON.parse(raw);}catch{fail("Webhook JSON invalid.");}
}
async function fulfill(env,id){
 let row=await getOrder(env,id);
 if(!row||row.status!=="paid"||row.notice_sent)return;
 // Claim a short durable lease; retries cannot normally send two emails concurrently.
 const lock=Date.now();
 const claimed=await env.ORDERS.prepare("UPDATE orders SET notice_lock=? WHERE id=? AND status='paid' AND notice_sent=0 AND notice_lock<?").bind(lock,id,lock-120000).run();
 if(!claimed.meta.changes)return;
 try{
  if(!row.tax_transaction){
   const tx=await stripe(env,"tax/transactions/create_from_calculation",{calculation:row.calculation,reference:"cd-"+id},"cd-tax-"+id);
   await env.ORDERS.prepare("UPDATE orders SET tax_transaction=? WHERE id=?").bind(tx.id,id).run();
  }
  // Recheck status before dispatching a paid-order notification.
  row=await getOrder(env,id);
  if(row.status!=="paid"){await env.ORDERS.prepare("UPDATE orders SET notice_lock=0 WHERE id=? AND notice_lock=?").bind(id,lock).run();return;}
  const p=JSON.parse(row.payload);
  const res=await fetch(env.FORMSPREE_URL,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({subject:(env.STORE_MODE==="test"?"TEST — ":"")+"Paid CD order "+id,order_id:id,stripe_payment_intent:row.intent,name:p.address.name,email:p.address.email,phone:p.address.phone||"",shipping_carrier:p.shippingService?.carrier||"Fixed rate",shipping_service:p.shippingService?.service||"",shippo_shipment_id:p.shippingService?.shipmentId||"",shippo_rate_id:p.shippingService?.id||"",package:p.shippingService?JSON.stringify(p.shippingService.parcel):"",country:p.address.country,state:p.address.state,city:p.address.city,address_line_1:p.address.line1,address_line_2:p.address.line2,postal_code:p.address.postal_code,items:p.lines.map(l=>l.quantity+" × "+l.name+" ("+l.sku+")").join("\n"),subtotal_usd:(p.subtotal/100).toFixed(2),shipping_usd:(p.shipping/100).toFixed(2),tax_usd:(p.tax/100).toFixed(2),paid_usd:(p.total/100).toFixed(2)})});
  if(!res.ok)throw Error("Order email rejected: "+res.status);
  await env.ORDERS.prepare("UPDATE orders SET notice_sent=1,notice_lock=0 WHERE id=?").bind(id).run();
 }catch(e){console.warn("Order fulfillment needs retry",id,e.message);await env.ORDERS.prepare("UPDATE orders SET notice_lock=0 WHERE id=? AND notice_lock=?").bind(id,lock).run();}
}
async function tryReward(env,id){
 try{const row=await getOrder(env,id);if(row)await awardPaidOrder(env,row);}
 catch(e){console.warn("Purchase reward needs retry",id,e.message);}
}
async function claimReward(env,b){
 configured(env);
 if(!rewardProject(env))return {reward:"disabled"};
 const uid=await verifiedBuyer(env,b.idToken);
 if(!uid)fail(adminSandboxRewards(env)?"Only an active administrator or owner signed in at checkout can claim Tide from a test payment.":"Sign in to claim your purchase collectibles.",401);
 let row=await ownedOrder(env,b.id,b.token);
 if(row.status!=="paid"||!row.intent)fail("Payment has not been verified.",409);
 const summary=await syncRefunds(env,stripe,row.intent);
 if(summary?.status!=="paid")fail("This order is no longer eligible for a purchase claim.",409);
 row=await getOrder(env,row.id);
 if(row.status!=="paid")fail("Payment has not been verified.",409);
 // Sandbox production rewards never allow guest or post-purchase binding.
 if(adminSandboxRewards(env)&&row.reward_uid!==uid)fail("This test order is not bound to your staff account. Sign in before making a new test purchase.",403);
 if(!adminSandboxRewards(env))await env.ORDERS.prepare("UPDATE orders SET reward_uid=? WHERE id=? AND status='paid' AND reward_uid IS NULL").bind(uid,row.id).run();
 row=await getOrder(env,row.id);
 if(row.reward_uid!==uid)fail("This purchase belongs to a different account.",403);
 const added=await awardPaidOrder(env,row);
 return {reward:"claimed",added};
}
async function webhook(req,env,ctx){
 const event=await verifyWebhook(req,env);
 if(event.livemode!==(env.STORE_MODE==="live"))fail("Wrong Stripe environment.");
 if(event.type==="payment_intent.succeeded"){
  const intent=await stripe(env,"payment_intents/"+event.data.object.id);
  if(uuid(intent.metadata?.store_order_id)){
   const summary=await syncRefunds(env,stripe,intent.id);
   if(summary?.status==="paid")ctx.waitUntil(Promise.all([fulfill(env,intent.metadata.store_order_id),tryReward(env,intent.metadata.store_order_id)]));
  }
 }else if(refundEvents.has(event.type)){
  const intent=await intentFromRefundEvent(env,stripe,event);
  if(intent){
   const summary=await syncRefunds(env,stripe,intent);
   if(summary?.status==="paid"){
    const row=await env.ORDERS.prepare("SELECT id FROM orders WHERE intent=?").bind(intent).first();
    if(row)ctx.waitUntil(Promise.all([fulfill(env,row.id),tryReward(env,row.id)]));
   }
  }
 }
 return {received:true};
}
async function cancel(env,b){
 configured(env);
 if(!uuid(b.id)||!uuid(b.token))fail("Invalid order reference.");
 await env.ORDERS.prepare("INSERT OR IGNORE INTO orders(id,token_hash,created,payload,total,calculation,status) VALUES(?,?,?,?,?,?,?)").bind(b.id,await hash(b.token),Date.now(),"{}",0,"","canceled").run();
 const row=await ownedOrder(env,b.id,b.token);
 if(row.status==="canceled")return {canceled:true};
 if(row.status!=="pending")fail("Order is already paid or closed.",409);
 if(!row.intent){
  const changed=await env.ORDERS.prepare("UPDATE orders SET status='canceled' WHERE id=? AND status='pending' AND intent IS NULL").bind(row.id).run();
  if(changed.meta.changes)return {canceled:true};
  fail("Checkout changed while canceling. Check order status and retry.",409);
 }
 const intent=await stripe(env,"payment_intents/"+row.intent);
 if(intent.status==="succeeded"){await syncRefunds(env,stripe,intent.id);fail("This order has already been paid. Check order status.",409);}
 if(intent.status!=="canceled")await stripe(env,"payment_intents/"+row.intent+"/cancel",{},"cd-cancel-"+row.id);
 await env.ORDERS.prepare("UPDATE orders SET status='canceled' WHERE id=? AND status='pending'").bind(row.id).run();return {canceled:true};
}
async function status(env,b,ctx){
 const row=await ownedOrder(env,b.id,b.token);
 if(row.status==="pending"&&row.intent){
  const pi=await stripe(env,"payment_intents/"+row.intent);
  if(pi.status==="succeeded"){
   const summary=await syncRefunds(env,stripe,pi.id);
   if(summary?.status==="paid"){ctx.waitUntil(Promise.all([fulfill(env,row.id),tryReward(env,row.id)]));return {status:"paid",reward:rewardAvailable(env,row)?"available":"disabled",adminTestReward:adminSandboxRewards(env)&&!!row.reward_uid};}
   return {status:summary?.status||"pending"};
  }
  if(pi.status==="canceled")await env.ORDERS.prepare("UPDATE orders SET status='canceled' WHERE id=? AND status='pending'").bind(row.id).run();
  return {status:pi.status};
 }
 return {status:row.status,reward:row.status==="paid"?(rewardAvailable(env,row)?"available":"disabled"):undefined,adminTestReward:row.status==="paid"&&adminSandboxRewards(env)&&!!row.reward_uid};
}
async function body(req){const raw=await req.text();if(raw.length>20000)fail("Request too large.",413);try{return JSON.parse(raw);}catch{fail("Invalid JSON.");}}
export default {
 async fetch(req,env,ctx){
  const url=new URL(req.url),origin=req.headers.get("Origin")||"",allowed=(env.ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).includes(origin);
  const headers={"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
  if(allowed)Object.assign(headers,{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type"});
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  try{
   if(url.pathname==="/webhook"&&req.method==="POST")return json(await webhook(req,env,ctx));
   if(!allowed)fail("Origin not allowed.",403);
   if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
   if(url.pathname==="/catalog"&&req.method==="GET")return json({...await catalog(env),inventory:await inventoryList(env)});
   if(url.pathname==="/config"&&req.method==="GET"){configured(env);return json({mode:env.STORE_MODE,carrierShipping:shippingEnabled(env),zones:shippingEnabled(env)?shippingSettings(env).countries.map(country=>({country,state:"*",city:"*"})):zones(env).map(({country,state,city})=>({country,state,city}))});}
   if(req.method!=="POST")fail("Not found.",404);
   const b=await body(req);
   if(url.pathname==="/shipping-quotes")return json(await shippingQuote(env,b));
   if(url.pathname==="/shipping-admin")return json(await shippingAdmin(env,b));
   if(url.pathname==="/inventory-admin"){if(!await verifiedShippingStaff(env,b.idToken))fail("Administrator access required.",403);if(b.action==="save")await saveInventory(env,b.inventory);else if(b.action==="stage")await orderStage(env,b);else if(b.action!=="list")fail("Unknown inventory action.");return json({mode:env.STORE_MODE,inventory:await inventoryList(env),orders:await fulfillmentOrders(env),products:(await catalog(env,true)).products});}
   if(url.pathname==="/catalog-admin"){if(!await verifiedShippingStaff(env,b.idToken))fail("Administrator access required.",403);return json(await saveCatalog(env,b));}
   if(url.pathname==="/checkout")return json(await startOrder(env,b));
   if(url.pathname==="/status")return json(await status(env,b,ctx));
   if(url.pathname==="/cancel")return json(await cancel(env,b));
   if(url.pathname==="/claim-reward")return json(await claimReward(env,b));
   fail("Not found.",404);
  }catch(e){if(!e.status)console.error("Store service error",e.message);return json({error:e.status?e.message:"Store service unavailable."},e.status||500);}
 },
 async scheduled(event,env,ctx){
  // Expire abandoned checkouts only after Stripe confirms cancellation; never release stock for processing or successful payments.
  try{const stale=await env.ORDERS.prepare("SELECT id,intent FROM orders WHERE status='pending' AND created<? ORDER BY created LIMIT 10").bind(Date.now()-60*60*1000).all();for(const row of stale.results||[])try{
   if(!row.intent){await env.ORDERS.prepare("UPDATE orders SET status='canceled' WHERE id=? AND status='pending' AND intent IS NULL").bind(row.id).run();continue;}
   let pi=await stripe(env,"payment_intents/"+row.intent);if(pi.status==="succeeded"){await syncRefunds(env,stripe,pi.id);continue;}
   if(["requires_payment_method","requires_confirmation","requires_action"].includes(pi.status))pi=await stripe(env,"payment_intents/"+row.intent+"/cancel",{},"cd-cancel-"+row.id);
   if(pi.status==="canceled")await env.ORDERS.prepare("UPDATE orders SET status='canceled' WHERE id=? AND status='pending' AND intent=?").bind(row.id,row.intent).run();
  }catch(e){console.warn("Expired checkout cleanup will retry",row.id);}}catch(e){console.warn("Inventory cleanup unavailable");}
  if(shippingEnabled(env))try{await env.ORDERS.prepare("DELETE FROM shipping_quotes WHERE expires<=?").bind(Date.now()).run();}catch(e){console.warn("Shipping quote cleanup unavailable",e.message);}
  await retryRefunds(env,stripe);
  const rows=await env.ORDERS.prepare("SELECT id FROM orders WHERE status='paid' AND notice_sent=0 AND notice_lock<? LIMIT 5").bind(Date.now()-120000).all();
  for(const row of rows.results||[])await fulfill(env,row.id);
  if(rewardProject(env)){
   const rewards=await env.ORDERS.prepare("SELECT id FROM orders WHERE status='paid' AND reward_done=0 AND reward_uid IS NOT NULL LIMIT 5").all();
   for(const row of rewards.results||[])await tryReward(env,row.id);
  }
 }
};
export {shipping,addressOf,productLines,calculate,verifyWebhook};
