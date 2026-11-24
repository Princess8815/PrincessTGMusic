// Stripe is authoritative. Only settled refunds change refunded cents.
// Partial refunds need merchant allocation of merchandise, shipping and tax.
export const refundEvents=new Set(["refund.created","refund.updated","refund.failed","charge.refunded"]);
const idOf=value=>typeof value==="string"?value:value?.id;
const validId=(v,prefix)=>typeof v==="string"&&v.startsWith(prefix)&&/^[a-zA-Z0-9_]+$/.test(v);
const safeCents=n=>Number.isSafeInteger(n)&&n>=0;
export function refundSummary(refunds,intent,total){
 let refunded=0,pending=0;
 const seen=new Set();
 for(const item of refunds){
  if(!validId(item.id,"re_")||seen.has(item.id)||idOf(item.payment_intent)!==intent||item.currency!=="usd"||!safeCents(item.amount)||!item.amount)throw Error("Invalid Stripe refund record");
  seen.add(item.id);
  if(item.status==="succeeded")refunded+=item.amount;
  else if(["pending","requires_action"].includes(item.status))pending+=item.amount;
  else if(!["failed","canceled"].includes(item.status))throw Error("Unrecognized Stripe refund status");
 }
 if(!safeCents(total)||total===0||!safeCents(refunded+pending)||refunded+pending>total)throw Error("Refund exceeds recorded payment");
 return {refunded,pending,status:refunded===total?"refunded":pending?"refund_pending":refunded?"partially_refunded":"paid"};
}
export function taxAction(previous,summary,total){
 if(previous.tax_reversal)return previous.tax_state;
 if(previous.tax_state==="manual_review"||summary.refunded>0&&summary.refunded<total)return "manual_review";
 if(summary.refunded===total)return "full_pending";
 return "none";
}
async function listRefunds(stripe,env,intent){
 const items=[];let cursor;
 do{
  const q=new URLSearchParams({payment_intent:intent,limit:"100"});
  if(cursor)q.set("starting_after",cursor);
  const page=await stripe(env,"refunds?"+q.toString());
  if(!Array.isArray(page.data))throw Error("Invalid refund list");
  items.push(...page.data);
  if(!page.has_more)return items;
  const next=page.data.at(-1)?.id;
  if(!next||next===cursor||items.length>=1000)throw Error("Refund list requires manual review");
  cursor=next;
 }while(true);
}
async function byIntent(env,intent){
 return env.ORDERS.prepare("SELECT * FROM orders WHERE intent=?").bind(intent).first();
}
export async function intentFromRefundEvent(env,stripe,event){
 const object=event.data?.object;
 let intent=idOf(object?.payment_intent);
 if(!intent&&validId(idOf(object?.charge),"ch_")){
  const charge=await stripe(env,"charges/"+idOf(object.charge));intent=idOf(charge.payment_intent);
 }
 return validId(intent,"pi_")?intent:null;
}
export async function syncRefunds(env,stripe,intent){
 if(!validId(intent,"pi_"))throw Error("Invalid payment reference");
 const order=await byIntent(env,intent);
 if(!order)return null; // Ignore other Stripe products on the same account.
 const now=Date.now(),lease=now+120000;
 await env.ORDERS.prepare("INSERT OR IGNORE INTO order_refunds(order_id) VALUES(?)").bind(order.id).run();
 const acquired=await env.ORDERS.prepare("UPDATE order_refunds SET lock_until=? WHERE order_id=? AND lock_until<?").bind(lease,order.id,now).run();
 if(!acquired.meta.changes)throw Object.assign(Error("Refund reconciliation busy; retry."),{status:503});
 try{
  const current=await byIntent(env,intent);
  const pi=await stripe(env,"payment_intents/"+intent);
  if(pi.id!==intent||pi.status!=="succeeded"||pi.metadata?.store_order_id!==current.id||pi.currency!=="usd"||pi.amount_received!==current.total||pi.livemode!==(env.STORE_MODE==="live")||!["pending","paid","refund_pending","partially_refunded","refunded"].includes(current.status))throw Error("Refund payment does not match order");
  const previous=await env.ORDERS.prepare("SELECT * FROM order_refunds WHERE order_id=?").bind(current.id).first();
  const summary=refundSummary(await listRefunds(stripe,env,intent),intent,current.total);
  const state=taxAction(previous,summary,current.total);
  // Record financial state before tax calls; failure cannot turn a refund back into a sale.
  await env.ORDERS.batch([
   env.ORDERS.prepare("UPDATE order_refunds SET refunded_cents=?,pending_cents=?,tax_state=?,updated_at=? WHERE order_id=? AND lock_until=?").bind(summary.refunded,summary.pending,state,Date.now(),current.id,lease),
   env.ORDERS.prepare("UPDATE orders SET status=? WHERE id=? AND EXISTS(SELECT 1 FROM order_refunds WHERE order_id=? AND lock_until=?)").bind(summary.status,current.id,current.id,lease)
  ]);
  if(state==="full_pending"){
   const fresh=await byIntent(env,intent);
   // Wait for any in-flight initial tax recording to finish before reversing.
   if(fresh.notice_lock>Date.now()-120000)throw Object.assign(Error("Order fulfillment is still completing; retry."),{status:503});
   let original=fresh.tax_transaction;
   if(!original){
    // A refund can arrive before the original tax record. Use exactly the
    // same unique reference and idempotency key as normal fulfillment.
    const tx=await stripe(env,"tax/transactions/create_from_calculation",{calculation:fresh.calculation,reference:"cd-"+fresh.id},"cd-tax-"+fresh.id);
    original=tx.id;
    if(!validId(original,"tax_"))throw Error("Invalid original tax record");
    await env.ORDERS.prepare("UPDATE orders SET tax_transaction=? WHERE id=?").bind(original,fresh.id).run();
   }
   const reference="cd-refund-full-"+fresh.id;
   const reversal=await stripe(env,"tax/transactions/create_reversal",{mode:"full",original_transaction:original,reference},"cd-tax-refund-full-"+fresh.id);
   if(!validId(reversal.id,"tax_")||reversal.type!=="reversal"||reversal.reversal?.original_transaction!==original||reversal.reference!==reference||reversal.livemode!==(env.STORE_MODE==="live"))throw Error("Tax reversal response did not match order");
   await env.ORDERS.prepare("UPDATE order_refunds SET tax_state='reversed',tax_reversal=?,updated_at=? WHERE order_id=? AND lock_until=?").bind(reversal.id,Date.now(),fresh.id,lease).run();
  }
  return summary;
 }finally{
  await env.ORDERS.prepare("UPDATE order_refunds SET lock_until=0 WHERE order_id=? AND lock_until=?").bind(order.id,lease).run();
 }
}
export async function retryRefunds(env,stripe){
 const rows=await env.ORDERS.prepare("SELECT o.intent FROM order_refunds r JOIN orders o ON o.id=r.order_id WHERE r.tax_state='full_pending' AND r.lock_until<? ORDER BY r.updated_at LIMIT 5").bind(Date.now()).all();
 for(const row of rows.results||[]){
  try{await syncRefunds(env,stripe,row.intent);}
  catch(e){console.warn("Refund tax reconciliation needs attention",row.intent,e.message);}
 }
}
