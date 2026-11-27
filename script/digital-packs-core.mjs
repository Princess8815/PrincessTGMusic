export const DAY_MS=86400000;
export const MAX_PACKS=80;
export const PACK_ID=/^[a-z0-9][a-z0-9-]{0,59}$/;
const ok=(v,m)=>{if(!v)throw Object.assign(Error(m),{status:400});};
const int=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b;
export function validatePack(raw){
 ok(raw&&PACK_ID.test(raw.id||""),"Use a lowercase pack ID (letters, digits, hyphens).");
 ok(["membership","coins"].includes(raw.kind),"Choose a pack type.");
 ok(typeof raw.name==="string"&&raw.name.trim().length>=1&&raw.name.trim().length<=80,"Enter a pack name (1–80 characters).");
 ok(typeof raw.description==="string"&&raw.description.trim().length>=1&&raw.description.trim().length<=1000,"Enter a description (1–1000 characters).");
 ok(int(raw.priceCents,50,1000000),"Price must be $0.50 to $10,000.");
 ok(typeof raw.active==="boolean","Invalid active setting.");
 ok(typeof raw.taxCode==="string"&&/^txcd_\d{8}$/.test(raw.taxCode),"Select a valid Stripe tax code.");
 const units=raw.kind==="membership"?raw.days:raw.coins;
 ok(int(units,1,raw.kind==="membership"?3650:100000000),"Invalid pack quantity.");
 return {id:raw.id,kind:raw.kind,name:raw.name.trim(),description:raw.description.trim(),priceCents:raw.priceCents,active:raw.active,taxCode:raw.taxCode,...(raw.kind==="membership"?{days:units}:{coins:units})};
}
export function validateCatalog(raw){
 ok(Array.isArray(raw)&&raw.length<=MAX_PACKS,"Too many packs.");
 const packs=raw.map(validatePack);ok(new Set(packs.map(p=>p.id)).size===packs.length,"Duplicate pack ID.");return packs;
}
export function memberStatus(expiresAt,now=Date.now()){
 const end=typeof expiresAt==="number"?expiresAt:Date.parse(expiresAt||"");
 return Number.isFinite(end)&&end>now?{status:"paid",expiresAt:end,remainingMs:end-now}:{status:"free",expiresAt:Number.isFinite(end)?end:null,remainingMs:0};
}
export function extendMembership(expiresAt,days,now=Date.now()){
 ok(int(days,1,3650)&&Number.isSafeInteger(now),"Invalid membership duration.");
 const base=memberStatus(expiresAt,now).status==="paid"?Number(expiresAt):now;
 const end=base+days*DAY_MS;ok(Number.isSafeInteger(end)&&end<253402300799000,"Membership duration limit reached.");
 return end;
}
export function receiptMatches(order,session,intent){
 return !!order&&session?.id===order.sessionId&&session.mode==="payment"&&session.livemode===true&&session.status==="complete"&&session.payment_status==="paid"&&session.currency==="usd"&&session.client_reference_id===order.id&&session.metadata?.digital_order_id===order.id&&session.amount_subtotal===order.pack.priceCents&&Number.isSafeInteger(session.amount_total)&&session.amount_total>=order.pack.priceCents&&session.automatic_tax?.status==="complete"&&intent?.id===session.payment_intent&&intent.livemode===true&&intent.status==="succeeded"&&intent.currency==="usd"&&intent.amount_received===session.amount_total&&intent.metadata?.digital_order_id===order.id;
}
