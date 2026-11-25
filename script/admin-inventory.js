import {auth,db} from "./firebase.js";
import {collection,getDocs} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {verifyStaff} from "./staff-auth.js";
import {STORE_WORKER_URL} from "./store-config.js";
import {storeProducts,money} from "./store-catalog.js";
const $=id=>document.getElementById(id),form=$("inventory-form"),load=$("inventory-load"),status=$("inventory-status"),orders=$("fulfillment-orders");
const field=k=>form.elements.namedItem(k),el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
let data=null,albums=[],busy=false,sku="";
const current=()=>data?.inventory.find(i=>i.sku===field("sku").value)||{mode:"made_to_order",stock:0,minDays:2,maxDays:3,revision:0};
function fill(){sku=field("sku").value;const i=current();for(const k of ["mode","stock","minDays","maxDays"])field(k).value=i[k];field("stock").disabled=busy||i.mode!=="in_stock";}
function controls(){load.disabled=busy;for(const e of form.elements)e.disabled=busy||!data;field("stock").disabled=busy||!data||field("mode").value!=="in_stock";for(const e of orders.querySelectorAll("button,input,select"))e.disabled=busy;}
const label=s=>s.replaceAll("_"," ");
function render(){
 const choices=new Map([...albums,...data.products.map(p=>({sku:"merch:"+p.id,name:p.name}))].map(p=>[p.sku,p.name]));
 for(const i of data.inventory)if(!choices.has(i.sku))choices.set(i.sku,i.sku+" (unlisted)");
 field("sku").replaceChildren(new Option("Select a product",""),...[...choices].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>new Option(name,id)));
 field("sku").value=choices.has(sku)?sku:"";fill();orders.replaceChildren();
 if(!data.orders.length)orders.append(el("p","No paid orders yet."));
 for(const o of data.orders){
  const box=el("article");box.style.marginBlock="1rem";box.append(el("strong",label(o.stage)+" · "+label(o.paymentStatus)+" · "+money(o.total)),el("p",o.id+" · "+new Date(o.created).toLocaleString()),el("p",o.lines.map(l=>l.quantity+" × "+l.name).join(", ")),el("p",o.shipping?o.shipping.carrier+" "+o.shipping.service:"Shipping service not recorded"));
  if(o.tracking)box.append(el("p","Tracking: "+o.tracking));
  if(o.processing)box.append(el("p","Processing: "+o.processing.minDays+"–"+o.processing.maxDays+" business days"));
  const next={paid:["in_production","packaged"],in_production:["packaged"],packaged:["shipped"],shipped:["delivered"]}[o.stage]||[];
  if(o.paymentStatus!=="refunded"&&next.length){
   const select=el("select");select.setAttribute("aria-label","Next fulfillment status");select.replaceChildren(...next.map(v=>new Option(label(v),v)));
   const track=el("input");track.placeholder="USPS tracking number";track.maxLength=100;track.setAttribute("aria-label","USPS tracking number");
   const button=el("button","Update order");button.type="button";button.onclick=()=>void request("stage",{orderId:o.id,stage:select.value,tracking:track.value});
   box.append(select);if(next.includes("shipped"))box.append(track);box.append(button);
  }
  orders.append(box);
 }
}
async function request(action,extra={}){
 if(busy)return;busy=true;controls();status.textContent="Checking staff access…";
 try{
  if(!await verifyStaff()||!auth.currentUser)throw Error("Administrator access required.");
  if(action==="list"){const snap=await getDocs(collection(db,"albums"));albums=snap.docs.flatMap(d=>storeProducts(d.id,d.data()));}
  const res=await fetch(STORE_WORKER_URL.replace(/\/$/,"")+"/inventory-admin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...extra,idToken:await auth.currentUser.getIdToken()})});
  const result=await res.json();if(!res.ok)throw Error(result.error||"Inventory unavailable.");
  data=result;render();status.textContent=(data.mode==="live"?"LIVE":"SANDBOX")+" · "+(action==="list"?"Loaded.":"Saved.");
 }catch(e){status.textContent=e.message;}finally{busy=false;controls();}
}
if(form&&load){controls();load.onclick=()=>void request("list");field("sku").onchange=fill;field("mode").onchange=()=>{field("stock").disabled=field("mode").value!=="in_stock";if(field("mode").value!=="in_stock")field("stock").value=0;};form.onsubmit=e=>{e.preventDefault();if(!data||!field("sku").value)return;void request("save",{inventory:{sku:field("sku").value,mode:field("mode").value,stock:Number(field("stock").value),minDays:Number(field("minDays").value),maxDays:Number(field("maxDays").value),revision:current().revision}});};}
