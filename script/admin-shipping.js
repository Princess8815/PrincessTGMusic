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
  const data=await res.json();if(!res.ok)throw Error(data.error||"Shipping unavailable.");result.textContent=JSON.stringify(data,null,2);
 }catch(e){result.textContent=e.message;}finally{busy=false;load.disabled=false;}
}
if(load&&form){load.onclick=()=>void request();form.onsubmit=e=>{e.preventDefault();void request(document.getElementById("shipping-admin-order").value.trim());};}
