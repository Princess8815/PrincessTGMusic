import {watchOwnerRole} from "./staff-auth.js";
import {digitalRequest,liveDigital,money,packBenefit} from "./digital-packs-api.js";
const $=id=>document.getElementById(id);let packs=[],owner=false,busy=false,editing=null;
const msg=t=>$("dp-admin-status").textContent=t;
function setKind(){const member=$("dp-kind").value==="membership";$("dp-units-label").textContent=member?"Membership duration (days)":"Star Coins";$("dp-units").max=member?3650:100000000;}
function fill(p){editing=p?.id||null;$("dp-id").value=p?.id||"";$("dp-id").readOnly=!!editing;$("dp-kind").value=p?.kind||"membership";$("dp-name").value=p?.name||"";$("dp-description").value=p?.description||"";$("dp-price").value=p?(p.priceCents/100).toFixed(2):"";$("dp-units").value=p?(p.days??p.coins):"";$("dp-tax").value=p?.taxCode||"";$("dp-active").checked=p?.active??false;setKind();}
function render(){const list=$("dp-admin-list");list.replaceChildren();for(const p of packs){const b=document.createElement("button");b.type="button";b.className="dp-admin-row";b.textContent=p.name+" · "+packBenefit(p)+" · "+money(p.priceCents)+(p.active?" · Active":" · Hidden");b.onclick=()=>fill(p);list.append(b);}if(!packs.length)list.textContent="No packs created. Add your first pack below.";}
async function run(fn){if(!owner||busy)return;busy=true;$("dp-save").disabled=true;try{await fn();}catch(e){msg(e.message);}finally{busy=false;$("dp-save").disabled=!owner;}}
async function load(){await run(async()=>{const d=await digitalRequest("list");packs=d.packs;render();msg("Digital packs loaded.");});}
$("dp-kind").onchange=setKind;$("dp-new").onclick=()=>fill(null);$("dp-refresh").onclick=load;
$("dp-form").onsubmit=event=>{event.preventDefault();void run(async()=>{
 const raw=$("dp-price").value.trim();if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw Error("Enter a price in USD with at most two decimal places.");
 const [whole,fraction=""]=raw.split("."),priceCents=Number(whole)*100+Number(fraction.padEnd(2,"0"));
 const kind=$("dp-kind").value,units=Number($("dp-units").value),pack={id:$("dp-id").value.trim(),kind,name:$("dp-name").value,description:$("dp-description").value,priceCents,taxCode:$("dp-tax").value.trim(),active:$("dp-active").checked,...(kind==="membership"?{days:units}:{coins:units})};
 if(!confirm("Save this pack"+(pack.active?" and make it available for real purchases":" as hidden")+"?"))return;
 const data=await digitalRequest("save",{pack});packs=data.packs;render();fill(packs.find(p=>p.id===pack.id));msg("Pack saved. Future checkouts use the new details.");
 });};
$("dp-order-check").onclick=()=>run(async()=>{const data=await digitalRequest("order",{id:$("dp-order-id").value.trim()});const o=data.order;$("dp-order-result").textContent="Order "+o.id+"\nAccount: "+o.uid+"\nPack: "+o.pack.name+" · "+packBenefit(o.pack)+" · "+money(o.pack.priceCents)+"\nStatus: "+o.status+(o.refundReview?" (manual review needed)":"")+"\nStripe session: "+(o.sessionId||"not started");});
fill(null);watchOwnerRole(ok=>{owner=ok===true;$("admin-main-tab-digital").hidden=!owner;$("dp-owner-content").hidden=!owner;$("dp-save").disabled=!owner;if(!owner){packs=[];render();fill(null);$("dp-order-result").textContent="";if(document.getElementById("admin-main-tab-digital").getAttribute("aria-selected")==="true")document.getElementById("admin-main-tab-mail").click();}else if(liveDigital())void load();else msg("Use the live site to manage real digital packs.");});
