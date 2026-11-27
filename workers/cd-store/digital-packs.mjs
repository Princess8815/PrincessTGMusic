import {accessToken,verifyFirebaseIdentity} from "./rewards.js";
import {validatePack,validateCatalog,memberStatus,extendMembership,receiptMatches} from "../../script/digital-packs-core.mjs";
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sessionOK=id=>typeof id==="string"&&/^cs_live_[A-Za-z0-9_]+$/.test(id);
const text=stringValue=>({stringValue}),num=n=>({integerValue:String(n)}),ts=n=>({timestampValue:new Date(n).toISOString()});
const val=(doc,k)=>doc?.fields?.[k]?.stringValue;
const unpack=doc=>doc?JSON.parse(val(doc,"payload")):null;
const pre=d=>d?{updateTime:d.updateTime}:{exists:false};
const jsonWrite=(root,path,data,old,extra={})=>({update:{name:root+"/"+path,fields:{payload:text(JSON.stringify(data)),...extra}},currentDocument:pre(old)});
const active=d=>d?.updateTime&&(val(d,"status")||"active")==="active"&&val(d,"role")!=="banned";
const catalogPath="digitalPackConfig/catalog";
const orderPath=id=>"digitalOrders/"+id;
const verifiedLive=env=>env.STORE_MODE==="live"&&env.LIVE_READY==="yes"&&env.REWARD_FIREBASE_PROJECT===env.FIREBASE_PROJECT&&!!env.FIREBASE_PROJECT&&env.STRIPE_SECRET_KEY?.startsWith("sk_live_");
async function storage(env){
 if(!verifiedLive(env))fail("Digital purchases are available only in the live store.",503);
 const token=await accessToken(env,env.FIREBASE_PROJECT),root="projects/"+env.FIREBASE_PROJECT+"/databases/(default)/documents",url="https://firestore.googleapis.com/v1/"+root,headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 const read=async path=>{const r=await fetch(url+"/"+path.split("/").map(encodeURIComponent).join("/"),{headers});if(r.status===404)return null;if(!r.ok)fail("Digital store storage unavailable.",503);return r.json();};
 const commit=async writes=>{const r=await fetch(url+":commit",{method:"POST",headers,body:JSON.stringify({writes})});if(r.ok)return true;const e=await r.json().catch(()=>({}));if([409,412].includes(r.status)||["ABORTED","FAILED_PRECONDITION","ALREADY_EXISTS"].includes(e.error?.status))return false;fail("Digital store save not confirmed.",503);};
 return {root,read,commit};
}
const catalog=async read=>validateCatalog(unpack(await read(catalogPath))||[]);
export async function digitalAdminAction({read,commit,root,uid,input}){
 const account=await read("users/"+uid);
 if(!active(account)||val(account,"role")!=="owner")fail("Owner access required.",403);
 if(input.action==="list")return {packs:await catalog(read)};
 if(input.action==="order"){
  if(!UUID.test(input.id||""))fail("Invalid purchase reference.");
  const order=unpack(await read(orderPath(input.id)));if(!order)fail("Purchase not found.",404);
  return {order:{id:order.id,uid:order.uid,pack:order.pack,created:order.created,status:order.status,sessionId:order.sessionId||null,refundReview:!!order.refundReview,fulfilledAt:order.fulfilledAt||null}};
 }
 if(input.action!=="save")fail("Unknown pack action.");
 const pack=validatePack(input.pack);
 for(let attempt=0;attempt<4;attempt++){
  const old=await read(catalogPath),packs=validateCatalog(unpack(old)||[]),index=packs.findIndex(p=>p.id===pack.id);
  if(index<0)packs.push(pack);else packs[index]=pack;
  validateCatalog(packs);
  if(await commit([{verify:root+"/users/"+uid,currentDocument:pre(account)},jsonWrite(root,catalogPath,packs,old)]))return {packs};
 }
 fail("Catalog changed. Reload and retry.",409);
}
export async function digitalStart({read,commit,root,uid,input,stripe,origin,clock=Date.now}){
 if(!UUID.test(input.id||""))fail("Invalid checkout reference.");
 const user="users/"+uid,account=await read(user);if(!active(account))fail("Active verified account required.",403);
 const path=orderPath(input.id);let doc=await read(path),order=unpack(doc);
 if(!order){
  const config=await read(catalogPath),pack=validateCatalog(unpack(config)||[]).find(p=>p.id===input.packId&&p.active);
  if(!pack)fail("Pack no longer available.",404);
  order={id:input.id,uid,pack,created:clock(),status:"pending",sessionId:null};
  if(!await commit([{verify:root+"/"+user,currentDocument:pre(account)},{verify:root+"/"+catalogPath,currentDocument:pre(config)},jsonWrite(root,path,order,null)]))fail("Checkout changed. Retry the same reference.",409);
  doc=await read(path);order=unpack(doc);
 }
 if(order.uid!==uid||order.pack.id!==input.packId)fail("Checkout belongs to another purchase.",403);
 if(order.status!=="pending")return {id:order.id,status:order.status};
 let session;
 if(order.sessionId)session=await stripe("checkout/sessions/"+order.sessionId);
 else{
  if(clock()-order.created>15*60*1000)fail("Checkout reference expired. Start a new purchase.",409);
  // Prices and quantities come only from the persisted pack snapshot.
  const base="line_items[0][price_data]",params={mode:"payment","payment_method_types[0]":"card","automatic_tax[enabled]":"true",billing_address_collection:"required",client_reference_id:order.id,
   success_url:origin+"/pages/store.html?digitalReturn="+order.id+"&session_id={CHECKOUT_SESSION_ID}",cancel_url:origin+"/pages/store.html?digitalCancel="+order.id,
   "metadata[digital_order_id]":order.id,"payment_intent_data[metadata][digital_order_id]":order.id,
   "line_items[0][quantity]":"1",[base+"[currency]"]:"usd",[base+"[unit_amount]"]:String(order.pack.priceCents),[base+"[tax_behavior]"]:"exclusive",
   [base+"[product_data][name]"]:order.pack.name,[base+"[product_data][description]"]:order.pack.description,[base+"[product_data][tax_code]"]:order.pack.taxCode,
   expires_at:String(Math.floor(order.created/1000)+3600)};
  session=await stripe("checkout/sessions",params,"digital-"+order.id);
  if(!sessionOK(session.id)||session.livemode!==true||session.client_reference_id!==order.id)fail("Stripe checkout could not be verified.",502);
  const next={...order,sessionId:session.id};
  if(!await commit([jsonWrite(root,path,next,doc)])){
   const fresh=unpack(await read(path));if(fresh?.sessionId!==session.id)fail("Checkout save not confirmed. Retry the same reference.",503);
  }
 }
 if(session.status==="complete")return {id:order.id,status:"processing",sessionId:session.id};
 if(session.status!=="open"||typeof session.url!=="string"||!session.url.startsWith("https://checkout.stripe.com/"))return {id:order.id,status:"expired"};
 return {id:order.id,status:"pending",url:session.url,sessionId:session.id};
}
export async function fulfillDigital({read,commit,root,id,session,intent,refunded=false,clock=Date.now}){
 if(!UUID.test(id||""))fail("Invalid digital order reference.");
 const path=orderPath(id);
 for(let attempt=0;attempt<5;attempt++){
  const doc=await read(path),order=unpack(doc);if(!order)fail("Digital order unavailable.",503);
  // Only a Stripe-created, paid session bound to this order can fulfill it.
  // Recover a session binding if webhook races the checkout creation response.
  if(!order.sessionId&&sessionOK(session?.id)&&session.metadata?.digital_order_id===id&&session.client_reference_id===id)order.sessionId=session.id;
  if(!receiptMatches(order,session,intent))fail("Digital payment details do not match.",409);
  if(refunded){
   if(order.refundReview)return {status:"refund_review"};
   if(await commit([jsonWrite(root,path,{...order,refundReview:true,status:"refund_review"},doc)]))return {status:"refund_review"};
   continue;
  }
  if(order.status==="fulfilled"||order.refundReview)return {status:order.status};
  const user="users/"+order.uid,member="memberships/"+order.uid,wallet=user+"/wallets/starCoins";
  const [account,memberDoc,walletDoc]=await Promise.all([read(user),read(member),read(wallet)]);
  if(!account||val(account,"status")==="archived"){
   if(await commit([jsonWrite(root,path,{...order,refundReview:true,status:"refund_review"},doc)]))return {status:"refund_review"};continue;
  }
  const now=clock(),pack=validatePack(order.pack),writes=[{verify:root+"/"+user,currentDocument:pre(account)}];
  if(pack.kind==="membership"){
   const expiry=Date.parse(memberDoc?.fields?.expiresAt?.timestampValue||"");
   const end=extendMembership(expiry,pack.days,now);
   writes.push({update:{name:root+"/"+member,fields:{expiresAt:ts(end),updatedAt:ts(now)}},currentDocument:pre(memberDoc)});
  }else{
   const balance=Number(walletDoc?.fields?.balance?.integerValue||0);
   if(!Number.isSafeInteger(balance)||balance<0||!Number.isSafeInteger(balance+pack.coins))fail("Wallet unavailable.",503);
   writes.push({update:{name:root+"/"+wallet,fields:{currency:text("starCoins"),balance:num(balance+pack.coins)}},updateMask:{fieldPaths:["currency","balance"]},currentDocument:pre(walletDoc)});
  }
  writes.push(jsonWrite(root,path,{...order,status:"fulfilled",fulfilledAt:now},doc));
  if(await commit(writes))return {status:"fulfilled"};
 }
 fail("Purchase fulfillment conflicted. Retry.",503);
}
async function verifySession(session,stripe){
 if(!sessionOK(session?.id)||typeof session.payment_intent!=="string"||!/^pi_[A-Za-z0-9]+$/.test(session.payment_intent))fail("Payment is not complete.",409);
 const intent=await stripe("payment_intents/"+session.payment_intent);
 const charge=typeof intent.latest_charge==="string"&&/^ch_[A-Za-z0-9]+$/.test(intent.latest_charge)?await stripe("charges/"+intent.latest_charge):null;
 if(!charge||charge.payment_intent!==intent.id||charge.paid!==true||charge.amount!==session.amount_total)fail("Payment verification unavailable.",503);
 return {intent,refunded:charge.refunded===true||charge.amount_refunded>0||charge.disputed===true};
}
export async function digitalEndpoint(env,input,stripe,origin){
 const s=await storage(env),action=input?.action;
 if(action==="catalog")return {packs:(await catalog(s.read)).filter(p=>p.active).map(({taxCode,...p})=>p)};
 const uid=await verifyFirebaseIdentity(env.FIREBASE_PROJECT,input?.idToken,true);
 if(["list","save","order"].includes(action))return digitalAdminAction({...s,uid,input});
 if(action==="start")return digitalStart({...s,uid,input,stripe,origin});
 if(action==="status"){
  if(!UUID.test(input.id||""))fail("Invalid purchase reference.");
  const order=unpack(await s.read(orderPath(input.id)));if(!order||order.uid!==uid)fail("Purchase not found.",404);
  if(order.status==="refund_review")return {status:order.status};
  const sid=order.sessionId||input.sessionId;
  if(!sessionOK(sid))return {status:order.status};
  const session=await stripe("checkout/sessions/"+sid);
  if(session.metadata?.digital_order_id!==order.id||session.client_reference_id!==order.id)fail("Purchase does not match.",403);
  if(session.status==="expired")return {status:"expired"};
  if(session.status!=="complete"||session.payment_status!=="paid")return {status:"pending"};
  return fulfillDigital({...s,id:order.id,session,...await verifySession(session,stripe)});
 }
 fail("Unknown digital store action.");
}
export async function digitalWebhook(env,stripe,sessionId){
 if(!verifiedLive(env)||!sessionOK(sessionId))return;
 const session=await stripe("checkout/sessions/"+sessionId),id=session.metadata?.digital_order_id;
 if(!UUID.test(id||""))return;
 if(session.status!=="complete"||session.payment_status!=="paid")return;
 const s=await storage(env);return fulfillDigital({...s,id,session,...await verifySession(session,stripe)});
}
export async function digitalIntentWebhook(env,stripe,intent){
 if(!verifiedLive(env)||!UUID.test(intent?.metadata?.digital_order_id||""))return;
 const s=await storage(env),order=unpack(await s.read(orderPath(intent.metadata.digital_order_id)));
 if(!order)fail("Digital order unavailable.",503);
 if(order.sessionId){const session=await stripe("checkout/sessions/"+order.sessionId);if(session.status!=="complete"||session.payment_status!=="paid")fail("Digital checkout completion pending.",503);return fulfillDigital({...s,id:order.id,session,...await verifySession(session,stripe)});}
 // A checkout session webhook or customer return handles the rare binding race.
 fail("Digital checkout binding pending.",503);
}
