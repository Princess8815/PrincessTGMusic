import {STORE_WORKER_URL} from "./store-config.js";
import {storeProducts,money,categoryOptions,filterCDs} from "./store-catalog.js";
const $=id=>document.getElementById(id),el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const btn=(text,action)=>{const e=el("button",text);e.type="button";e.onclick=action;return e;};
const message=text=>{$("checkout-status").textContent=text;};
const cartKey="ptg-cd-cart-v1",orderKey="ptg-cd-checkout-v1",rewardKey="ptg-cd-reward-v1";
const read=(storage,key,fallback)=>{try{return JSON.parse(storage.getItem(key)||"null")??fallback;}catch{return fallback;}};
const write=(storage,key,value)=>{try{storage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
const remove=(storage,key)=>{try{storage.removeItem(key);}catch{}};
let products=new Map(),titles=new Map(),cart=new Map(),config=null,stripe=null,elements=null,paymentElement=null,order=null,busy=false,catalogReady=false;
let selectedCategory="",selectedAlbum="";
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
  const amount=el("p",money(p.priceCents)+" each · "+money(q*p.priceCents));amount.className="store-cart-price";row.append(amount);
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
 if(delta>0){const product=products.get(sku);$("store-cart-feedback").textContent=product?"Added "+product.name+" to your cart.":"Cart updated."; }
}
let detailSKU=null;
function updateCDDetails(){
 const p=products.get(detailSKU);if(!p)return;
 $("cd-detail-title").textContent=p.name;
 $("cd-detail-price").textContent=money(p.priceCents);
 $("cd-detail-meta").textContent=p.songIds.length+" tracks · "+p.category;
 $("cd-detail-description").textContent=p.description;
 $("cd-detail-description").hidden=!p.description;
 $("cd-detail-tracks").replaceChildren(...p.songIds.map(id=>el("li",titles.get(id)||id)));
}
function openCDDetails(p){
 detailSKU=p.sku;updateCDDetails();
 const dialog=$("cd-detail-dialog");if(!dialog.open)dialog.showModal();
}
$("cd-detail-dialog").addEventListener("close",()=>{detailSKU=null;});
$("cd-detail-add").onclick=()=>{if(detailSKU)change(detailSKU,1);};
function makeProduct(p){
 const card=el("article");card.className="store-card";
 const open=btn("",()=>openCDDetails(p));open.className="store-icon-open";
 open.setAttribute("aria-label","View details and tracks for "+p.name);open.title=p.name;
 const fallback=el("div","CD");fallback.className="store-cover";fallback.setAttribute("aria-hidden","true");
 if(/^https:\/\//i.test(p.coverUrl)){
  const img=el("img");img.src=p.coverUrl;img.alt="";img.loading="lazy";img.onerror=()=>img.replaceWith(fallback);open.append(img);
 }else open.append(fallback);
 const name=el("span",p.name);name.className="store-icon-title";open.append(name);card.append(open);
 const info=el("div");info.className="store-icon-info";
 const price=el("span",money(p.priceCents));price.className="store-price";
 const add=btn("+",()=>change(p.sku,1));add.className="store-icon-add";add.setAttribute("aria-label","Add "+p.name+" to cart");add.title="Add to cart";
 info.append(price,add);card.append(info);return card;
}
function refreshAlbumOptions(){
 const choices=new Map(filterCDs([...products.values()],selectedCategory).map(p=>[p.albumId,p.albumName]));
 const select=$("store-album-select");
 if(selectedAlbum&&!choices.has(selectedAlbum))selectedAlbum="";
 select.replaceChildren(new Option("All albums",""),...[...choices].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>new Option(name,id)));
 select.value=selectedAlbum;
}
function chooseCategory(key){
 selectedCategory=key;
 $("store-category-select").value=key;
 for(const button of $("store-category-tabs").querySelectorAll("button"))button.setAttribute("aria-pressed",String(button.dataset.category===key));
 refreshAlbumOptions();renderProducts();
}
function mountCatalogFilters(){
 const categories=[["","All CDs"],...categoryOptions([...products.values()])];
 if(!categories.some(([key])=>key===selectedCategory))selectedCategory="";
 const tabs=$("store-category-tabs"),dropdown=$("store-category-select");
 tabs.replaceChildren(...categories.map(([key,name])=>{const button=btn(name,()=>chooseCategory(key));button.dataset.category=key;button.setAttribute("aria-pressed",String(key===selectedCategory));return button;}));
 dropdown.replaceChildren(...categories.map(([key,name])=>new Option(name,key)));
 dropdown.value=selectedCategory;
 refreshAlbumOptions();
}
$("store-category-select").onchange=e=>chooseCategory(e.target.value);
$("store-album-select").onchange=e=>{selectedAlbum=e.target.value;renderProducts();};
function renderProducts(){
 const root=$("store-products"),featuredRoot=$("store-featured-products");
 root.replaceChildren();featuredRoot.replaceChildren();
 const visible=filterCDs([...products.values()],selectedCategory,selectedAlbum).sort((a,b)=>a.albumName.localeCompare(b.albumName)||a.volume-b.volume);
 const featured=visible.filter(p=>p.featured),regular=visible.filter(p=>!p.featured);
 $("store-featured-section").hidden=!featured.length;
 $("store-regular-section").hidden=!!featured.length&&!regular.length;
 $("store-regular-title").hidden=!featured.length||!regular.length;
 $("store-filter-count").textContent=visible.length+" "+(visible.length===1?"CD":"CDs");
 for(const p of featured)featuredRoot.append(makeProduct(p));
 for(const p of regular)root.append(makeProduct(p));
 if(!visible.length){const empty=el("p",products.size?"No CDs match this selection.":"No CDs are listed for sale yet.");empty.className="store-grid-empty";root.append(empty);}
}
async function loadCatalog(){
 try{
  const [{db},{collection,getDocs}]=await Promise.all([import("./firebase.js"),import("https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js")]);
  const snap=await getDocs(collection(db,"albums"));
  products=new Map(snap.docs.flatMap(s=>storeProducts(s.id,s.data())).map(p=>[p.sku,p]));
  catalogReady=true;mountCatalogFilters();renderProducts();renderCart();$("store-status").textContent=products.size+" CD listings"+(!STORE_WORKER_URL?" · Checkout is not configured yet.":".");
  void import("./song-data.js").then(({loadAllSongs})=>loadAllSongs("../audioPlayer/audio/song-details.json")).then(songs=>{titles=new Map(songs.map(s=>[s.pageId,s.title]));if(detailSKU)updateCDDetails();}).catch(()=>{});
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
async function meetShelly(){
 try{
  const reef=await import("./reef-collection.js");
  const root=$("store-reef-friends"),card=el("div");card.className="store-friend";
  const art=el("div");art.innerHTML=reef.axolotlPortrait("shelly");
  const words=el("div");words.append(el("strong","Shelly"),el("span","Welcome to the CD store! Visiting my shop discovers me for your collection."));
  card.append(art,words);root.replaceChildren(card);
  await reef.claimPendingAxolotls(); // Wait for existing account initialization where possible.
  reef.discoverAxolotl("shelly");
 }catch(e){console.warn("Store visit discovery unavailable",e);}
}
async function revealTide(){
 try{
  const reef=await import("./reef-collection.js");
  if($("receipt-panel").hidden||$("receipt-tide").hidden)return;
  $("receipt-tide-art").innerHTML=reef.axolotlPortrait("tide");
 }catch(e){console.warn("Receipt mascot unavailable",e);}
}
function showReceipt(kind,text){
 $("storefront").hidden=true;
 $("checkout-panel").hidden=true;
 $("receipt-title").textContent=kind==="paid"?"Thank you for your order!":"Order refund";
 $("receipt-message").textContent=text;
 $("receipt-tide").hidden=kind!=="paid";
 $("receipt-tide-art").replaceChildren();
 $("receipt-panel").hidden=false;
 $("receipt-title").focus();
 $("receipt-panel").scrollIntoView({block:"start"});
 if(kind==="paid")void revealTide();
}
async function buyerToken(){
 try{const {auth}=await import("./firebase.js");await auth.authStateReady();return auth.currentUser?await auth.currentUser.getIdToken():null;}catch{return null;}
}
async function claimReward(){
 const ref=read(sessionStorage,rewardKey,null);
 if(!ref)return;
 const status=$("reward-status");
 try{
  const idToken=await buyerToken();
  if(!idToken){status.textContent="Log in to claim Tide, then press Claim Tide.";const button=$("auth-open");if(button&&!button.hidden)button.click();return;}
  const r=await api("/claim-reward",{...ref,idToken});
  if(r.reward==="disabled"){status.textContent="Tide says hello! Sandbox purchases do not unlock production collectibles.";remove(sessionStorage,rewardKey);}
  else{
   status.textContent="Tide is in your collection!";
   remove(sessionStorage,rewardKey);
   const reef=await import("./reef-collection.js");
   for(const id of r.added||[])if(id==="tide")reef.announcePurchaseDiscovery(id);
  }
  $("claim-purchase-reward").hidden=true;
 }catch(e){status.textContent=e.message+" Your paid order remains recorded. Retry after signing in.";}
}
async function openCheckout(){
 if(order)return;
 $("checkout-panel").hidden=false;$("checkout-panel").scrollIntoView({block:"start"});message("Loading available destinations…");$("quote-button").disabled=false;
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
   const q=await api("/checkout",{...order,address,cart:lines,idToken:await buyerToken()});await mountPayment(q);
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
let checkingOrder=false;
async function checkOrder(){
 if(!order||checkingOrder)return;checkingOrder=true;
 const reference=order;
 try{
  const r=await api("/status",reference);
  if(order!==reference)return;
  if(r.status==="paid"){
   const available=r.reward==="available";
   $("claim-purchase-reward").hidden=!available;
   $("reward-status").textContent=available?"Purchase verified! Sign in to claim Tide.":"Test purchase verified. Enjoy meeting Tide! Production collectibles are not awarded in sandbox mode.";
   if(available)write(sessionStorage,rewardKey,reference);
   resetCheckout();cart.clear();persist();renderCart();
   showReceipt("paid","Payment confirmed. Order reference: "+reference.id+". Your order will be processed using your shipping details.");
   if(available&&await buyerToken())void claimReward();
  }else if(r.status==="refunded"||r.status==="partially_refunded"){
   resetCheckout();cart.clear();persist();renderCart();
   const pending=read(sessionStorage,rewardKey,null);if(pending?.id===reference.id)remove(sessionStorage,rewardKey);
   $("claim-purchase-reward").hidden=true;$("reward-status").textContent="";
   showReceipt("refund",(r.status==="refunded"?"This order was fully refunded.":"This order was partially refunded.")+" Order reference: "+reference.id+". Contact support for details.");
  }else if(r.status==="canceled"){resetCheckout();message("Checkout canceled. Your cart is still here.");}
  else{message("Payment status: "+r.status.replaceAll("_"," ")+". Do not pay again if your bank shows a pending charge.");$("check-order").hidden=false;}
 }catch(e){message(e.message);$("check-order").hidden=false;}
 finally{checkingOrder=false;}
}
function resetCheckout(){
 remove(sessionStorage,orderKey);order=null;paymentElement?.destroy();paymentElement=null;elements=null;stripe=null;
 $("payment-panel").hidden=true;$("shipping-form").hidden=false;$("check-order").hidden=true;
 $("pay-button").disabled=true;$("pay-button").textContent="Pay";$("quote-button").disabled=false;$("edit-checkout").disabled=false;
 $("order-lines").replaceChildren();for(const key of ["subtotal","shipping","tax","total"])$("quote-"+key).textContent="";
 message("");renderCart();
}
$("check-order").onclick=()=>void checkOrder();
$("edit-checkout").onclick=async()=>{
 if(busy||!order)return;busy=true;
 try{await api("/cancel",order);resetCheckout();message("Edit your shipping information or cart.");}
 catch(e){message(e.message+" Check order status before trying again.");}
 finally{busy=false;}
};
$("shop-again").onclick=()=>{$("receipt-panel").hidden=true;$("receipt-tide").hidden=true;$("storefront").hidden=false;$("checkout-panel").hidden=true;window.scrollTo(0,0);$("store-checkout").focus();};
$("claim-purchase-reward").onclick=()=>void claimReward();
async function restoreRewardReceipt(){
 const saved=read(sessionStorage,rewardKey,null);if(!saved||order)return;
 try{
  const result=await api("/status",saved);if(order||read(sessionStorage,rewardKey,null)?.id!==saved.id)return;
  if(result.status==="paid"&&result.reward==="available"){
   $("claim-purchase-reward").hidden=false;$("reward-status").textContent="Sign in to claim Tide from your verified purchase.";
   showReceipt("paid","Payment confirmed. Order reference: "+saved.id+".");
  }else if(["refunded","partially_refunded","canceled"].includes(result.status)||result.reward==="disabled")remove(sessionStorage,rewardKey);
 }catch(e){console.warn("Pending Tide claim could not be restored",e);}
}
const previous=read(sessionStorage,orderKey,null);
if(previous?.id&&previous?.token){order=previous;$("checkout-panel").hidden=false;$("shipping-form").hidden=true;$("payment-panel").hidden=false;$("check-order").hidden=false;message("Checking your previous checkout…");void checkOrder();}
renderCart();void loadCatalog();void meetShelly();if(!previous)void restoreRewardReceipt();
