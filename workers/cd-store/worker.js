// Authoritative CD checkout. No Firebase Admin credentials, no Blaze functions.
import {storeProducts} from "../../script/store-catalog.js";
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
 if(!/^[A-Z]{2}$/.test(a.country)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)||(["US","CA"].includes(a.country)&&!a.state))fail("Enter a valid email and complete destination.");
 return a;
}
function flatten(v){if(!v)return null;if("stringValue"in v)return v.stringValue;if("booleanValue"in v)return v.booleanValue;if("integerValue"in v)return Number(v.integerValue);if("doubleValue"in v)return v.doubleValue;if("arrayValue"in v)return (v.arrayValue.values||[]).map(flatten);if("mapValue"in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,flatten(x)]));return null;}
async function productLines(env,cart){
 if(!Array.isArray(cart)||!cart.length||cart.length>8)fail("Choose between 1 and 8 different CDs per order.");
 const combined=new Map();
 for(const row of cart){
  if(!row||typeof row.albumId!=="string"||!/^[a-z0-9-]{1,140}$/.test(row.albumId)||!integer(row.volume,1,20)||!integer(row.quantity,1,10))fail("Invalid CD cart.");
  const sku=row.albumId+":"+row.volume;if(combined.has(sku))fail("Duplicate cart line.");
  combined.set(sku,row);
 }
 const albums=new Map();
 await Promise.all([...new Set(cart.map(x=>x.albumId))].map(async id=>{
  const url="https://firestore.googleapis.com/v1/projects/"+encodeURIComponent(env.FIREBASE_PROJECT)+"/databases/(default)/documents/albums/"+encodeURIComponent(id);
  const r=await fetch(url,{headers:{Accept:"application/json"},cf:{cacheTtl:0}});
  if(r.status===404)fail("An album is no longer available.",409);if(!r.ok)fail("Album catalog unavailable.",503);
  const data=await r.json();albums.set(id,Object.fromEntries(Object.entries(data.fields||{}).map(([k,v])=>[k,flatten(v)])));
 }));
 let count=0;
 const lines=cart.map(row=>{
  const p=storeProducts(row.albumId,albums.get(row.albumId)).find(p=>p.volume===row.volume);
  if(!p)fail("A CD is no longer available.",409);
  count+=row.quantity;
  return {sku:p.sku,name:p.name,quantity:row.quantity,priceCents:p.priceCents,songIds:p.songIds};
 });
 if(count>20)fail("Maximum 20 CDs per order.");
 return {lines,count};
}
function configured(env){
 const mode=env.STORE_MODE;
 if(!["test","live"].includes(mode)||!env.STRIPE_SECRET_KEY?.startsWith("sk_"+mode+"_")||!env.STRIPE_PUBLISHABLE_KEY?.startsWith("pk_"+mode+"_")||!env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")||!/^txcd_\d+$/.test(env.CD_TAX_CODE||"")||!/^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(env.FORMSPREE_URL||"")||!zones(env).length||!env.ORDERS)fail("Checkout is not configured yet.",503);
 if(mode==="live"&&(env.LIVE_READY!=="yes"||(env.ALLOWED_ORIGINS||"").includes("github.io")))fail("Live checkout has not been enabled.",503);
}
async function stripe(env,path,params,key){
 const headers={Authorization:"Bearer "+env.STRIPE_SECRET_KEY,"Stripe-Version":"2026-11-18.endive"};
 if(params)headers["Content-Type"]="application/x-www-form-urlencoded";
 if(key)headers["Idempotency-Key"]=key;
 const res=await fetch("https://api.stripe.com/v1/"+path,{method:params?"POST":"GET",headers,body:params?new URLSearchParams(params):undefined});
 const data=await res.json();
 if(!res.ok){console.warn("Stripe request failed",path.split("/")[0],data.error?.code||res.status);fail("Payment or tax service unavailable. Please retry or contact the store.",502);}
 return data;
}
function addressFields(a){const {name,email,...address}=a;return address;}
async function calculate(env,lines,a,ship){
 const params={currency:"usd","customer_details[address_source]":"shipping","shipping_cost[amount]":String(ship),"shipping_cost[tax_behavior]":"exclusive"};
 for(const [k,v] of Object.entries(addressFields(a)))if(v)params["customer_details[address]["+k+"]"]=v;
 lines.forEach((l,i)=>{const base="line_items["+i+"]";params[base+"[amount]"]=String(l.priceCents*l.quantity);params[base+"[quantity]"]=String(l.quantity);params[base+"[reference]"]=l.sku;params[base+"[tax_code]"]=env.CD_TAX_CODE;params[base+"[tax_behavior]"]="exclusive";});
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
async function startOrder(env,body){
 configured(env);
 if(!uuid(body.id)||!uuid(body.token))fail("Invalid checkout reference.");
 let row=await getOrder(env,body.id);
 if(row){row=await ownedOrder(env,body.id,body.token);}
 else{
  const a=addressOf(body.address),{lines,count}=await productLines(env,body.cart);
  const totals=await calculate(env,lines,a,shipping(zones(env),a,count));
  const payload=JSON.stringify({address:a,lines,subtotal:totals.subtotal,shipping:totals.shipping,tax:totals.tax,total:totals.total});
  await env.ORDERS.prepare("INSERT OR IGNORE INTO orders(id,token_hash,created,payload,total,calculation) VALUES(?,?,?,?,?,?)").bind(body.id,await hash(body.token),Date.now(),payload,totals.total,totals.calculation).run();
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
  await env.ORDERS.prepare("UPDATE orders SET intent=? WHERE id=? AND (intent IS NULL OR intent=?)").bind(intent.id,row.id,intent.id).run();
 }
 if(!["requires_payment_method","requires_confirmation","requires_action"].includes(intent.status))fail("This payment is already processing or complete. Check order status.",409);
 return {id:row.id,clientSecret:intent.client_secret,publishableKey:env.STRIPE_PUBLISHABLE_KEY,mode:env.STORE_MODE,lines:p.lines,subtotal:p.subtotal,shipping:p.shipping,tax:p.tax,total:p.total};
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
async function markPaid(env,intent){
 const id=intent.metadata?.store_order_id;
 if(!uuid(id))return;
 const row=await getOrder(env,id);
 if(!row||row.intent!==intent.id||intent.status!=="succeeded"||intent.currency!=="usd"||intent.amount_received!==row.total||intent.livemode!==(env.STORE_MODE==="live"))fail("Paid intent does not match order.",409);
 await env.ORDERS.prepare("UPDATE orders SET status='paid' WHERE id=? AND status='pending'").bind(id).run();
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
  const p=JSON.parse(row.payload);
  const res=await fetch(env.FORMSPREE_URL,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({subject:(env.STORE_MODE==="test"?"TEST — ":"")+"Paid CD order "+id,order_id:id,stripe_payment_intent:row.intent,name:p.address.name,email:p.address.email,country:p.address.country,state:p.address.state,city:p.address.city,address_line_1:p.address.line1,address_line_2:p.address.line2,postal_code:p.address.postal_code,items:p.lines.map(l=>l.quantity+" × "+l.name+" ("+l.sku+")").join("\n"),subtotal_usd:(p.subtotal/100).toFixed(2),shipping_usd:(p.shipping/100).toFixed(2),tax_usd:(p.tax/100).toFixed(2),paid_usd:(p.total/100).toFixed(2)})});
  if(!res.ok)throw Error("Order email rejected: "+res.status);
  await env.ORDERS.prepare("UPDATE orders SET notice_sent=1,notice_lock=0 WHERE id=?").bind(id).run();
 }catch(e){console.warn("Order fulfillment needs retry",id,e.message);await env.ORDERS.prepare("UPDATE orders SET notice_lock=0 WHERE id=? AND notice_lock=?").bind(id,lock).run();}
}
async function webhook(req,env,ctx){
 const event=await verifyWebhook(req,env);
 if(event.livemode!==(env.STORE_MODE==="live"))fail("Wrong Stripe environment.");
 if(event.type==="payment_intent.succeeded"){
  const intent=await stripe(env,"payment_intents/"+event.data.object.id);
  await markPaid(env,intent);
  if(uuid(intent.metadata?.store_order_id))ctx.waitUntil(fulfill(env,intent.metadata.store_order_id));
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
 if(!row.intent)fail("Checkout is still initializing. Retry shortly.",409);
 const intent=await stripe(env,"payment_intents/"+row.intent);
 if(intent.status==="succeeded"){await markPaid(env,intent);fail("This order has already been paid.",409);}
 if(intent.status!=="canceled")await stripe(env,"payment_intents/"+row.intent+"/cancel",{},"cd-cancel-"+row.id);
 await env.ORDERS.prepare("UPDATE orders SET status='canceled' WHERE id=? AND status='pending'").bind(row.id).run();return {canceled:true};
}
async function status(env,b,ctx){
 const row=await ownedOrder(env,b.id,b.token);
 if(row.status==="pending"&&row.intent){
  const pi=await stripe(env,"payment_intents/"+row.intent);
  if(pi.status==="succeeded"){await markPaid(env,pi);ctx.waitUntil(fulfill(env,row.id));return {status:"paid"};}
  return {status:pi.status==="canceled"?"canceled":pi.status};
 }
 return {status:row.status};
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
   if(url.pathname==="/config"&&req.method==="GET"){configured(env);return json({mode:env.STORE_MODE,zones:zones(env).map(({country,state,city})=>({country,state,city}))});}
   if(req.method!=="POST")fail("Not found.",404);
   const b=await body(req);
   if(url.pathname==="/checkout")return json(await startOrder(env,b));
   if(url.pathname==="/status")return json(await status(env,b,ctx));
   if(url.pathname==="/cancel")return json(await cancel(env,b));
   fail("Not found.",404);
  }catch(e){if(!e.status)console.error("Store service error",e.message);return json({error:e.status?e.message:"Store service unavailable."},e.status||500);}
 },
 async scheduled(event,env,ctx){
  const rows=await env.ORDERS.prepare("SELECT id FROM orders WHERE status='paid' AND notice_sent=0 AND notice_lock<? LIMIT 5").bind(Date.now()-120000).all();
  for(const row of rows.results||[])await fulfill(env,row.id);
 }
};
export {shipping,addressOf,productLines,calculate,verifyWebhook};
