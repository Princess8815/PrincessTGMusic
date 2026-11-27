import {auth} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {digitalRequest,liveDigital,money,packBenefit} from "./digital-packs-api.js";
const $=id=>document.getElementById(id),status=t=>$("digital-status").textContent=t;
const pendingKey=uid=>"ptg-digital-checkout-v1:"+uid;
let packs=[],busy=false,pending=null;
function remember(p){pending=p;try{if(p)localStorage.setItem(pendingKey(auth.currentUser.uid),JSON.stringify(p));else if(auth.currentUser)localStorage.removeItem(pendingKey(auth.currentUser.uid));}catch{}}
function restore(uid){try{return JSON.parse(localStorage.getItem(pendingKey(uid))||"null");}catch{return null;}}
function cleanReturn(){const u=new URL(location.href);for(const k of ["digitalReturn","digitalCancel","session_id"])u.searchParams.delete(k);history.replaceState(null,"",u);}
function info(p){$("digital-info-title").textContent=p.name;$("digital-info-description").textContent=p.description;$("digital-info-benefit").textContent=packBenefit(p)+" · "+money(p.priceCents)+" + applicable tax";$("digital-info").showModal();}
function render(){
 for(const kind of ["membership","coins"]){const target=$("digital-"+kind);target.replaceChildren();const list=packs.filter(p=>p.kind===kind);
  if(!list.length){const note=document.createElement("p");note.className="dp-muted";note.textContent="No packs available yet.";target.append(note);}
  for(const p of list){const card=document.createElement("article");card.className="dp-card";const icon=document.createElement("span");icon.className="dp-pack-icon";icon.textContent=p.kind==="membership"?"✦":"★";
   const heading=document.createElement("h3");heading.textContent=p.name;const benefit=document.createElement("p");benefit.textContent=packBenefit(p);
   const price=document.createElement("strong");price.className="dp-price";price.textContent=money(p.priceCents);
   const actions=document.createElement("div");actions.className="dp-actions";const buy=document.createElement("button"),details=document.createElement("button");buy.type=details.type="button";buy.textContent="Buy";details.textContent="Info";details.className="dp-secondary";details.setAttribute("aria-label","Info about "+p.name);buy.disabled=busy||!!pending;buy.onclick=()=>purchase(p);details.onclick=()=>info(p);actions.append(buy,details);card.append(icon,heading,benefit,price,actions);target.append(card);}
 }
 $("digital-recovery").hidden=!pending;$("digital-check").disabled=busy;$("digital-resume").disabled=busy||!pending?.packId;$("digital-dismiss").disabled=busy;
}
async function run(fn){if(busy)return;busy=true;render();try{await fn();}catch(e){status(e.message);}finally{busy=false;render();}}
function purchase(p){if(!auth.currentUser?.emailVerified){status("Sign in with a verified account to purchase a pack.");document.getElementById("auth-open")?.click();return;}
 if(!liveDigital()){status("Digital checkout is available on the live site only.");return;}
 if(!confirm("Buy "+p.name+" for "+money(p.priceCents)+" plus applicable tax? This is a one-time purchase."))return;
 remember({id:crypto.randomUUID(),packId:p.id});resume();}
function resume(){return run(async()=>{const ref=pending,uid=auth.currentUser?.uid;if(!ref||!uid)return;status("Preparing secure Stripe checkout…");const result=await digitalRequest("start",{id:ref.id,packId:ref.packId});if(auth.currentUser?.uid!==uid||pending?.id!==ref.id)return;
 if(result.url){location.assign(result.url);return;}
 if(result.status==="expired"){remember(null);cleanReturn();status("Checkout expired. You can start another purchase.");return;}
 await checkInternal();});}
async function checkInternal(){const ref=pending,uid=auth.currentUser?.uid;if(!ref||!uid)return;status("Checking payment…");const result=await digitalRequest("status",{id:ref.id,sessionId:ref.sessionId});if(auth.currentUser?.uid!==uid||pending?.id!==ref.id)return;
 if(result.status==="fulfilled"){remember(null);cleanReturn();status("Payment confirmed! Your membership or Star Coins have been added to your account. Reference: "+ref.id);}
 else if(result.status==="refund_review"){const id=pending.id;remember(null);cleanReturn();status("Purchase requires support review. Reference: "+id);}
 else if(result.status==="expired"){remember(null);cleanReturn();status("Checkout expired. No reward was issued.");}
 else status("Payment has not been confirmed. Resume checkout or check again.");
}
$("digital-check").onclick=()=>run(checkInternal);$("digital-resume").onclick=resume;
$("digital-dismiss").onclick=()=>run(async()=>{if(!pending)return;if(!confirm("Stop tracking this checkout on this device? A payment that succeeds will still be credited to its original account. Do not start another purchase if you may already have paid."))return;remember(null);cleanReturn();status("Checkout tracking cleared. Contact support with your Stripe receipt if needed.");});
onAuthStateChanged(auth,user=>{
 pending=user?restore(user.uid):null;
 const q=new URLSearchParams(location.search),returned=q.get("digitalReturn"),canceled=q.get("digitalCancel");
 if(user?.emailVerified&&returned){remember({...(pending?.id===returned?pending:{}),id:returned,sessionId:q.get("session_id")});void run(checkInternal);}
 else if(user?.emailVerified&&canceled){if(!pending)remember({id:canceled});status("Checkout canceled in Stripe. Check payment status or resume your purchase.");}
 else if(!user&&(returned||canceled))status("Sign in to the account that started this purchase to check its status.");
 render();
});
async function load(){try{if(!liveDigital()){status("Digital packs are available on the live store. Preview mode never charges real payments.");return;}const data=await digitalRequest("catalog",{},false);packs=data.packs;status("One-time purchases. No automatic renewals or shipping.");render();}catch(e){status(e.message);}}
$("digital-refresh").onclick=load;render();void load();
