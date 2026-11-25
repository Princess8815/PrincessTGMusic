const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const validSku=s=>typeof s==="string"&&/^(?:merch:[a-z0-9][a-z0-9-]{0,59}|[a-z0-9-]{1,140}:(?:[1-9]|1[0-9]|20))$/.test(s);
const int=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
export const defaultInventory=sku=>({sku,mode:"made_to_order",stock:0,minDays:2,maxDays:3,revision:0});
const record=r=>({sku:r.sku,mode:r.mode,stock:r.stock,minDays:r.min_days,maxDays:r.max_days,revision:r.revision});
export function validateInventory(p){
 if(!p||!validSku(p.sku)||!["made_to_order","in_stock","out_of_stock"].includes(p.mode)||!int(p.stock,0,1000000)||!int(p.minDays,0,60)||!int(p.maxDays,p.minDays,60)||!int(p.revision,0,Number.MAX_SAFE_INTEGER))fail("Invalid inventory settings.");
 return {...p,stock:p.mode==="in_stock"?p.stock:0};
}
export async function inventoryList(env){
 const {results}=await env.ORDERS.prepare("SELECT * FROM inventory ORDER BY sku").all();return (results||[]).map(record);
}
export async function inventoryLines(env,lines){
 const rows=await Promise.all(lines.map(async l=>{
  const r=await env.ORDERS.prepare("SELECT * FROM inventory WHERE sku=?").bind(l.sku).first();
  const p=r?record(r):defaultInventory(l.sku);
  if(p.mode==="out_of_stock"||p.mode==="in_stock"&&p.stock<l.quantity)fail(l.name+" is out of stock or has insufficient stock. Edit your cart.",409);
  return {...l,fulfillment:{mode:p.mode,minDays:p.minDays,maxDays:p.maxDays}};
 }));
 return rows;
}
export function processingFor(lines){
 // The order ships together after the slowest line is ready. All days are business days.
 return {minDays:Math.max(0,...lines.map(l=>l.fulfillment?.minDays??2)),maxDays:Math.max(0,...lines.map(l=>l.fulfillment?.maxDays??3))};
}
export async function saveInventory(env,input){
 const p=validateInventory(input);let r;
 try{
 if(p.revision===0)r=await env.ORDERS.prepare("INSERT INTO inventory(sku,mode,stock,min_days,max_days,revision) VALUES(?,?,?,?,?,1) ON CONFLICT(sku) DO NOTHING").bind(p.sku,p.mode,p.stock,p.minDays,p.maxDays).run();
 else r=await env.ORDERS.prepare("UPDATE inventory SET mode=?,stock=?,min_days=?,max_days=?,revision=revision+1 WHERE sku=? AND revision=?").bind(p.mode,p.stock,p.minDays,p.maxDays,p.sku,p.revision).run();
 }catch(e){if(String(e.message).includes("reserved orders"))fail("Complete or cancel reserved orders before changing stock mode.",409);throw e;}
 if(!r.meta.changes)fail("Stock changed since you loaded it. Reload before saving.",409);
}
const next={paid:["in_production","packaged"],in_production:["packaged"],packaged:["shipped"],shipped:["delivered"],delivered:[]};
export async function orderStage(env,b){
 const id=b.orderId,stage=b.stage,tracking=typeof b.tracking==="string"?b.tracking.trim():"";
 if(typeof id!=="string"||! /^[0-9a-f-]{36}$/i.test(id)||!Object.hasOwn(next,stage)||stage==="paid"||tracking.length>100)fail("Invalid fulfillment update.");
 const row=await env.ORDERS.prepare("SELECT o.status,f.stage,f.tracking FROM orders o LEFT JOIN order_fulfillment f ON f.order_id=o.id WHERE o.id=?").bind(id).first();
 if(!row||!["paid","partially_refunded"].includes(row.status))fail("Only paid orders may be fulfilled.",409);
 const current=row.stage||"paid";
 if(!next[current]?.includes(stage))fail("Invalid order status transition. Reload orders.",409);
 if(stage==="shipped"&&!tracking)fail("Enter the USPS tracking number.");
 const saved=tracking||row.tracking||"";
 const r=await env.ORDERS.prepare("INSERT INTO order_fulfillment(order_id,stage,tracking,updated) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND status IN ('paid','partially_refunded')) ON CONFLICT(order_id) DO UPDATE SET stage=excluded.stage,tracking=excluded.tracking,updated=excluded.updated WHERE order_fulfillment.stage=?").bind(id,stage,saved,Date.now(),id,current).run();
 if(!r.meta.changes)fail("Order changed; reload before updating.",409);
}
export async function fulfillmentOrders(env){
 const {results}=await env.ORDERS.prepare("SELECT o.id,o.status,o.created,o.payload,o.total,f.stage,f.tracking FROM orders o LEFT JOIN order_fulfillment f ON f.order_id=o.id WHERE o.status IN ('paid','partially_refunded','refunded') ORDER BY CASE WHEN o.status='refunded' OR f.stage='delivered' THEN 1 ELSE 0 END,o.created DESC LIMIT 100").all();
 return (results||[]).map(r=>{const p=JSON.parse(r.payload);return {id:r.id,paymentStatus:r.status,stage:r.stage||"paid",created:r.created,total:r.total,tracking:r.tracking||"",lines:(p.lines||[]).map(l=>({sku:l.sku,name:l.name,quantity:l.quantity,fulfillment:l.fulfillment||null})),processing:p.processing||null,shipping:p.shippingService?{carrier:p.shippingService.carrier,service:p.shippingService.service}:null};});
}
