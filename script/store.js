import {STORE_WORKER_URL} from "./store-config.js";
import {storeProducts,money} from "./store-catalog.js";
const $=id=>document.getElementById(id),el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const btn=(text,action)=>{const e=el("button",text);e.type="button";e.onclick=action;return e;};
const message=text=>{$("checkout-status").textContent=text;};
const cartKey="ptg-cd-cart-v1",orderKey="ptg-cd-checkout-v1";
const read=(storage,key,fallback)=>{try{return JSON.parse(storage.getItem(key)||"null")??fallback;}catch{return fallback;}};
const write=(storage,key,value)=>{try{storage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
const remove=(storage,key)=>{try{storage.removeItem(key);}catch{}};
let products=new Map(),titles=new Map(),cart=new Map(),config=null,stripe=null,elements=null,paymentElement=null,order=null,busy=false,catalogReady=false;
const saved=read(localStorage,cartKey,[]);
if(Array.isArray(saved))for(const row of saved)if(row&&typeof row.sku==="string"&&Number.isInteger(row.quantity)&&row.quantity>=1&&row.quantity<=10)cart.set(row.sku,row.quantity);
function persist(){write(localStorage,cartKey,[...cart].map(([sku,quantity])=>({sku,quantity})));}
const form=$("shipping-form"),field=name=>form.elements.namedItem(name);
function renderCart(){
 const box=$("cart-items");box.replaceChildren();let subtotal=0,count=0;
 for(const [sku,q] of cart){
  const p=products.get(sku);
  const row=el("div");row.className="store-cart-row";row.append(el("strong",p?.name||sku));
  if(!p){row.append(el("p",catalogReady?"Unavailable CD; remove before checkout.":"Checking availability…"));row.append(btn("Remove",()=>change(sku,-q)));box.append(row);continue;}
  subtotal+=q*p.priceCents;count+=q;
  row.append(el("p",money(p.priceCents)+" each · "+money(q*p.priceCents)));
  const controls=el("div");controls.className="cart-controls";controls.append(btn("−",()=>change(sku,-1)),el("span",String(q)),btn("+",()=>change(sku,1)),btn("Remove",()=>change(sku,-q)));row.append(controls);box.append(row);
 }
 if(!cart.size)box.append(el("p","Your cart is empty."));
 $("cart-count").textContent=String(count);$("cart-subtotal").textContent=money(subtotal);
 $("store-checkout").disabled=!!order||!catalogReady||!cart.size||[...cart.keys()].some(s=>!products.has(s))||!STORE_WORKER_URL;
 if(!STORE_WORKER_URL)$("store-checkout").title="Checkout service has not been configured.";
}
function change(sku,delta){
 if(order||busy){message("Cancel or finish the current payment before editing your cart.");return;}
 const q=(cart.get(sku)||0)+delta;
 if(q>10||q>0&&cart.size>=8&&!cart.has(sku)||[...cart.values()].reduce((a,b)=>a+b,0)+delta>20){$("store-status").textContent="Up to 10 copies per CD, 8 different CDs and 20 CDs per order.";return;}
 if(q<=0)cart.delete(sku);else cart.set(sku,q);
 persist();renderCart();
}
function renderProducts(){
 const root=$("store-products");root.replaceChildren();
 for(const p of [...products.values()].sort((a,b)=>a.albumName.localeCompare(b.albumName)||a.volume-b.volume)){
  const card=el("article");card.className="store-card";
  const fallback=el("div","CD");fallback.className="store-cover";
  if(/^https:\/\//i.test(p.coverUrl)){const img=el("img");img.src=p.coverUrl;img.alt=p.albumName+" cover";img.loading="lazy";img.onerror=()=>img.replaceWith(fallback);card.append(img);}else card.append(fallback);
  card.append(el("h3",p.name),el("p",money(p.priceCents)),el("p",p.songIds.length+" tracks · Physical CD"));
  const details=el("details"),summary=el("summary","Track list"),list=el("ol");for(const id of p.songIds)list.append(el("li",titles.get(id)||id));details.append(summary,list);card.append(details,btn("Add to cart",()=>change(p.sku,1)));root.append(card);
 }
 if(!products.size)root.append(el("p","No CDs are listed for sale yet."));
}
async function loadCatalog(){
 try{
  const [{db},{collection,getDocs}]=await Promise.all([import("./firebase.js"),import("https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js")]);
  const snap=await getDocs(collection(db,"albums"));
  products=new Map(snap.docs.flatMap(s=>storeProducts(s.id,s.data())).map(p=>[p.sku,p]));
  catalogReady=true;renderProducts();renderCart();$("store-status").textContent=products.size+" CD listings"+(!STORE_WORKER_URL?" · Checkout is not configured yet.":".");
  void import("./song-data.js").then(({loadAllSongs})=>loadAllSongs("../audioPlayer/audio/song-details.json")).then(songs=>{titles=new Map(songs.map(s=>[s.pageId,s.title]));renderProducts();}).catch(()=>{});
 }catch(e){$("store-status").textContent="Could not load the CD catalog: "+e.message;}
}
async function api(path,data){
 if(!STORE_WORKER_URL)throw Error("Checkout service has not been configured.");
 const res=await fetch(STORE_WORKER_URL.replace(/\/$/,"")+path,{method:data?"POST":"GET",headers:data?{"Content-Type":"application/json"}:{},body:data?JSON.stringify(data):undefined});
 const result=await res.json();if(!res.ok)throw Error(result.error||"Checkout unavailable.");return result;
}
function options(select,values,placeholder){select.replaceChildren(new Option(placeholder,""));for(const [value,label] of values)select.add(new Option(label,value));}
const us="AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const ca="AB BC MB NB NL NS NT NU ON PE QC SK YT".split(" ");
function regionName(code){try{return new Intl.DisplayNames(["en"],{type:"region"}).of(code)||code;}catch{return code;}}
function countryChanged(){
 const country=field("country").value,z=config.zones.filter(x=>x.country===country);
 const states=new Set(z.filter(x=>x.state!=="*").map(x=>x.state));
 if(z.some(x=>x.state==="*")){if(country==="US")us.forEach(x=>states.add(x));else if(country==="CA")ca.forEach(x=>states.add(x));else states.add("__other");}
 options(field("stateChoice"),[...states].sort().map(x=>[x,x==="__other"?"Other / not applicable":x]),"Select state / province");stateChanged();
 field("postal_code").required=["US","CA"].includes(country);
}
function stateChanged(){
 const country=field("country").value,state=field("stateChoice").value;
 $("state-other").hidden=state!=="__other";
 const z=config.zones.filter(x=>x.country===country&&(x.state==="*"||x.state===state));
 const cities=new Set(z.filter(x=>x.city!=="*").map(x=>x.city));if(z.some(x=>x.city==="*"))cities.add("__other");
 options(field("cityChoice"),[...cities].sort().map(x=>[x,x==="__other"?"Other city (enter name)":x]),"Select city");cityChanged();
}
function cityChanged(){const other=field("cityChoice").value==="__other";$("city-other").hidden=!other;field("cityOther").required=other;}
async function meetFriends(payment=false){
 try{const reef=await import("./reef-collection.js");
 const root=$(payment?"payment-reef-friend":"store-reef-friends");root.replaceChildren();
 for(const [id,name,description] of (payment?[["tide","Tide","I'll keep watch while Stripe handles your payment."]]:[["shelly","Shelly","I pack your CDs with a little reef magic."]])){
  const card=el("div");card.className="store-friend";const art=el("div");art.innerHTML=reef.axolotlPortrait(id);const words=el("div");words.append(el("strong",name),el("span",description));card.append(art,words);root.append(card);reef.discoverAxolotl(id);
 }
 }catch(e){console.warn("Checkout mascots unavailable",e);}
}
async function openCheckout(){
 if(order)return;
 $("checkout-panel").hidden=false;$("checkout-panel").scrollIntoView({block:"start"});message("Loading available destinations…");void meetFriends();
 try{config=await api("/config");$("checkout-mode").textContent=config.mode==="test"?"TEST MODE · No real payment or shipment.":"Secure checkout · USD";
 options(field("country"),[...new Set(config.zones.map(x=>x.country))].sort().map(x=>[x,regionName(x)]),"Select nation");countryChanged();message("");}
 catch(e){message(e.message);$("quote-button").disabled=true;}
}
field("country").onchange=countryChanged;field("stateChoice").onchange=stateChanged;field("cityChoice").onchange=cityChanged;
$("store-checkout").onclick=()=>void openCheckout();
async function loadStripe(){
 for(let i=0;i<100&&typeof window.Stripe!=="function";i++)await new Promise(r=>setTimeout(r,100));
 if(typeof window.Stripe!=="function")throw Error("Stripe did not load. Check your connection and retry.");
}
function saveOrder(){if(!write(sessionStorage,orderKey,order))throw Error("Checkout requires browser session storage. Enable it before paying.");}
async function mountPayment(q){
 await loadStripe();
 paymentElement?.destroy();stripe=window.Stripe(q.publishableKey);
 elements=stripe.elements({clientSecret:q.clientSecret,appearance:{theme:"night"}});
 paymentElement=elements.create("payment");paymentElement.mount("#payment-element");
 void meetFriends(true);
 $("payment-panel").hidden=false;$("shipping-form").hidden=true;$("check-order").hidden=false;
 const list=$("order-lines");list.replaceChildren(...q.lines.map(l=>el("p",l.quantity+" × "+l.name+" · "+money(l.quantity*l.priceCents))));
 for(const k of ["subtotal","shipping","tax","total"])$("quote-"+k).textContent=money(q[k]);
 $("pay-button").textContent="Pay "+money(q.total);$("pay-button").disabled=false;message("Review the final amount, then enter your payment details.");
}
form.onsubmit=async e=>{
 e.preventDefault();if(busy||!config)return;busy=true;$("quote-button").disabled=true;
 try{
  if(!order){
   const values=Object.fromEntries(new FormData(form));
   const address={name:values.name,email:values.email,country:values.country,state:values.stateChoice==="__other"?values.stateOther||"":values.stateChoice,city:values.cityChoice==="__other"?values.cityOther:values.cityChoice,line1:values.line1,line2:values.line2,postal_code:values.postal_code};
   const lines=[...cart].map(([sku,quantity])=>{const p=products.get(sku);if(!p)throw Error("Remove unavailable CDs.");return {albumId:p.albumId,volume:p.volume,quantity};});
   order={id:crypto.randomUUID(),token:crypto.randomUUID()};saveOrder();renderCart();
   const q=await api("/checkout",{...order,address,cart:lines});await mountPayment(q);
  }else throw Error("Check or cancel the existing checkout before starting another.");
 }catch(err){message(err.message);$("check-order").hidden=!order;$("edit-checkout").hidden=false;if(order){$("payment-panel").hidden=false;$("pay-button").disabled=true;}}
 finally{busy=false;$("quote-button").disabled=false;}
};
$("payment-form").onsubmit=async e=>{
 e.preventDefault();if(busy||!order||!stripe||!elements)return;busy=true;$("pay-button").disabled=true;$("edit-checkout").disabled=true;
 try{
  const returnUrl=new URL(location.href);returnUrl.search="";returnUrl.hash="";returnUrl.searchParams.set("paymentReturn","1");
  const result=await stripe.confirmPayment({elements,confirmParams:{return_url:returnUrl.href},redirect:"if_required"});
  if(result.error)throw Error(result.error.message);
  await checkOrder();
 }catch(err){message(err.message);$("pay-button").disabled=false;}
 finally{busy=false;$("edit-checkout").disabled=false;}
};
async function checkOrder(){
 if(!order)return;try{
  const r=await api("/status",order);
  if(r.status==="paid"){
   $("receipt-panel").hidden=false;$("receipt-message").textContent="Payment confirmed. Order reference: "+order.id+". Your order will be processed using your shipping details.";
   cart.clear();persist();remove(sessionStorage,orderKey);order=null;$("checkout-panel").hidden=true;renderCart();$("receipt-panel").scrollIntoView();
  }else if(r.status==="canceled"){resetCheckout();message("Checkout canceled. Your cart is still here.");}
  else{message("Payment status: "+r.status.replaceAll("_"," ")+". Do not pay again if your bank shows a pending charge.");$("check-order").hidden=false;}
 }catch(e){message(e.message);$("check-order").hidden=false;}
}
function resetCheckout(){remove(sessionStorage,orderKey);order=null;paymentElement?.destroy();paymentElement=null;elements=null;stripe=null;$("payment-panel").hidden=true;$("shipping-form").hidden=false;$("check-order").hidden=true;renderCart();}
$("check-order").onclick=()=>void checkOrder();
$("edit-checkout").onclick=async()=>{
 if(busy||!order)return;busy=true;
 try{await api("/cancel",order);resetCheckout();message("Edit your shipping information or cart.");}
 catch(e){message(e.message+" Check order status before trying again.");}
 finally{busy=false;}
};
$("shop-again").onclick=()=>{$("receipt-panel").hidden=true;window.scrollTo(0,0);};
const previous=read(sessionStorage,orderKey,null);
if(previous?.id&&previous?.token){order=previous;$("checkout-panel").hidden=false;$("shipping-form").hidden=true;$("payment-panel").hidden=false;$("check-order").hidden=false;message("Checking your previous checkout…");void checkOrder();}
renderCart();void loadCatalog();
