import {publicError} from "./site-errors.js";
import {auth} from "./firebase.js";
import {verifyStaff} from "./staff-auth.js";
import {STORE_WORKER_URL} from "./store-config.js";
const result=document.getElementById("shipping-admin-result"),load=document.getElementById("shipping-admin-load"),form=document.getElementById("shipping-admin-form");
let busy=false;
async function request(orderId){
 if(busy||!result)return;busy=true;load.disabled=true;result.textContent="Checking administrator access…";
 try{
  if(!await verifyStaff()||!auth.currentUser)throw Error("Administrator access required.");
  const res=await fetch(STORE_WORKER_URL.replace(/\/$/,"")+"/shipping-admin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:await auth.currentUser.getIdToken(),orderId})});
  const data=await res.json();if(!res.ok)throw Object.assign(Error(data.error||"Shipping unavailable."),{status:res.status});const lines=[data.mode==="live"?"Live store":"Test store"];
  if(data.order){
   lines.push("Order: "+data.order.id,"Total: $"+(data.order.total/100).toFixed(2));
   const service=data.order.shipping;
   lines.push(service?"Shipping: "+service.carrier+" · "+service.service:"No shipping service recorded.");
  }else{
   lines.push(data.enabled?"Shipping enabled":"Shipping unavailable","Destinations: "+(data.countries.join(", ")||"None"),data.packagingVerified?"Packaging measurements verified":data.estimatedPackagingAccepted?"Using estimated packaging":"Packaging measurements needed");
   if(data.latestTestShipment?.available)lines.push("Latest test shipment: "+data.latestTestShipment.rateCount+" shipping options");
  }
  result.textContent=lines.join("\n");
 }catch(e){result.textContent=publicError(e,"PTG-901");}finally{busy=false;load.disabled=false;}
}
if(load&&form){load.onclick=()=>void request();form.onsubmit=e=>{e.preventDefault();void request(document.getElementById("shipping-admin-order").value.trim());};}
