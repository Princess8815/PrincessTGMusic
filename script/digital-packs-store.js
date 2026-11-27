import {auth} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {digitalRequest,digitalMode,digitalAvailable,money,packBenefit} from "./digital-packs-api.js";
const $=id=>document.getElementById(id),status=t=>$("digital-status").textContent=t;
const pendingKey=uid=>digitalMode()==="live"?"ptg-digital-checkout-v1:"+uid:"ptg-digital-checkout-test-v1:"+uid;
const kind=document.querySelector("[data-digital-kind]").dataset.digitalKind,perPage=12;let packs=[],busy=false,pending=null,page=0;
const sandbox=()=>digitalMode()==="test";
async function testBalance(){const el=$("digital-test-balance"),uid=auth.currentUser?.uid;el.hidden=!sandbox()||!auth.currentUser?.emailVerified||!digitalAvailable();if(el.hidden)return;try{const d=await digitalRequest("testBalance");if(auth.currentUser?.uid!==uid)return;el.textContent="TEST ONLY · "+(d.expiresAt&&Date.parse(d.expiresAt)>Date.now()?"Paid until "+new Date(d.expiresAt).toLocaleString():"Free")+" · "+d.balance.toLocaleString()+" test Star Coins";}catch(e){el.textContent="Sandbox balance unavailable: "+e.message;}}
function remember(p){pending=p;try{if(p)localStorage.setItem(pendingKey(auth.currentUser.uid),JSON.stringify(p));else if(auth.currentUser)localStorage.removeItem(pendingKey(auth.currentUser.uid));}catch{}}
function restore(uid){try{return JSON.parse(localStorage.getItem(pendingKey(uid))||"null");}catch{return null;}}
function cleanReturn(){const u=new URL(location.href);for(const k of ["digitalReturn","digitalCancel","session_id"])u.searchParams.delete(k);history.replaceState(null,"",u);}
function info(p){$("digital-info-title").textContent=p.name;$("digital-info-description").textContent=p.description;$("digital-info-benefit").textContent=packBenefit(p)+" · "+money(p.priceCents)+" + applicable tax";$("digital-info").showModal();}
function render(){
 {const target=$("digital-"+kind);target.replaceChildren();const list=packs.filter(p=>p.kind===kind).sort((a,b)=>(a.days??a.coins)-(b.days??b.coins)||a.name.localeCompare(b.name));const totalPages=Math.max(1,Math.ceil(list.length/perPage));page=Math.max(0,Math.min(page,totalPages-1));const nav=$("digital-pages");nav.hidden=totalPages<=1;nav.querySelector("[data-page-prev]").disabled=page===0;nav.querySelector("[data-page-next]").disabled=page>=totalPages-1;nav.querySelector("[data-page-label]").textContent="Page "+(page+1)+" of "+totalPages+" · "+list.length+" packs";
  if(!list.length){const note=document.createElement("p");note.className="dp-muted";note.textContent="No packs available yet.";target.append(note);}
  for(const p of list.slice(page*perPage,(page+1)*perPage)){const card=document.createElement("article");card.className="dp-card";const icon=document.createElement("span");icon.className="dp-pack-icon";icon.textContent=p.kind==="membership"?"✦":"★";
   const heading=document.createElement("h3");heading.textContent=p.name;heading.title=p.name;const benefit=document.createElement("p");benefit.textContent=packBenefit(p);
   const price=document.createElement("strong");price.className="dp-price";price.textContent=money(p.priceCents);
   const actions=document.createElement("div");actions.className="dp-actions";const buy=document.createElement("button"),details=document.createElement("button");buy.type=details.type="button";buy.textContent="Buy";details.textContent="Info";details.className="dp-secondary";details.setAttribute("aria-label","Info about "+p.name);buy.disabled=busy||!!pending;buy.onclick=()=>purchase(p);details.onclick=()=>info(p);actions.append(buy,details);card.append(icon,heading,benefit,price,actions);target.append(card);}
 }
 $("digital-recovery").hidden=!pending;$("digital-check").disabled=busy;$("digital-resume").disabled=busy||!pending?.packId;$("digital-dismiss").disabled=busy;
}
async function run(fn){if(busy)return;busy=true;render();try{await fn();}catch(e){status(e.message);}finally{busy=false;render();}}
function purchase(p){if(!auth.currentUser?.emailVerified){status("Sign in with a verified account to purchase a pack.");document.getElementById("auth-open")?.click();return;}
 if(!digitalAvailable()){status("Switch from the Firebase emulator to Live Firebase authentication to test Stripe sandbox checkout.");return;}
 if(!confirm((sandbox()?"TEST MODE (no real charge): ":"")+"Buy "+p.name+" for "+money(p.priceCents)+" plus applicable tax? This is a one-time purchase."))return;
 remember({id:crypto.randomUUID(),packId:p.id});resume();}
function resume(){return run(async()=>{const ref=pending,uid=auth.currentUser?.uid;if(!ref||!uid)return;status("Preparing secure Stripe checkout…");const result=await digitalRequest("start",{id:ref.id,packId:ref.packId});if(auth.currentUser?.uid!==uid||pending?.id!==ref.id)return;
 if(result.url){location.assign(result.url);return;}
 if(result.status==="expired"){remember(null);cleanReturn();status("Checkout expired. You can start another purchase.");return;}
 await checkInternal();});}
async function checkInternal(){const ref=pending,uid=auth.currentUser?.uid;if(!ref||!uid)return;status("Checking payment…");const result=await digitalRequest("status",{id:ref.id,sessionId:ref.sessionId});if(auth.currentUser?.uid!==uid||pending?.id!==ref.id)return;
 if(result.status==="fulfilled"){remember(null);cleanReturn();status((sandbox()?"Test payment confirmed! Only your sandbox membership or test Star Coins were updated.":"Payment confirmed! Your membership or Star Coins have been added to your account.")+" Reference: "+ref.id);void testBalance();}
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
 render();void testBalance();
});
async function load(){try{const data=await digitalRequest("catalog",{},false);packs=data.packs;page=0;status(sandbox()?"SANDBOX · Stripe test payments only. Test credits are separate from your real account.":"One-time purchases. No automatic renewals or shipping.");render();}catch(e){status(e.message);}}
$("digital-pages").querySelector("[data-page-prev]").onclick=()=>{page--;render();};$("digital-pages").querySelector("[data-page-next]").onclick=()=>{page++;render();};$("digital-refresh").onclick=load;render();void load();
