import {publicError,siteError,storeError} from "./site-errors.js";
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
let selectedCategory="",selectedAlbum="",productPage=0;const productPageSize=24;
let paymentReady=false,paymentMayProceed=false,configFailed=false,claimBusy=false;
let receiptKind=null,shippingQuote=null;
function clearShippingQuote(){shippingQuote=null;const panel=$("shipping-rate-panel");if(panel)panel.hidden=true;$("quote-button").textContent=config?.carrierShipping?"Find shipping services":"Calculate shipping and tax";}
function updateControls(){
 const active=!!order;
 $("store-checkout").disabled=busy||active||!catalogReady||!cart.size||[...cart].some(([s,q])=>!products.has(s)||!canAdd(products.get(s),q))||!STORE_WORKER_URL;
 $("quote-button").disabled=busy||active||!config||configFailed||!cart.size;
 $("pay-button").disabled=busy||!active||!paymentReady||!paymentMayProceed;
 $("edit-checkout").disabled=busy||!active;
 $("check-order").disabled=busy||!active;
 $("resume-payment").disabled=busy||!active;
 $("retry-config").disabled=busy;
 $("claim-purchase-reward").disabled=claimBusy||busy;
 $("shop-again").disabled=busy||claimBusy;
 $("restore-tide-claim").hidden=!read(sessionStorage,rewardKey,null);
 $("restore-tide-claim").disabled=busy||claimBusy||active;
 for(const button of document.querySelectorAll(".cart-controls button,.store-icon-add,.store-icon-open,#cd-detail-add"))button.disabled=busy||active||(button.classList.contains("store-icon-add")&&!canAdd(products.get(button.dataset.sku),(cart.get(button.dataset.sku)||0)+1))||(button.id==="cd-detail-add"&&detailSKU&&!canAdd(products.get(detailSKU),(cart.get(detailSKU)||0)+1));
}
async function exclusive(action){
 if(busy)return false;
 busy=true;updateControls();
 try{await action();return true;}finally{busy=false;updateControls();}
}
const saved=read(localStorage,cartKey,[]);
if(Array.isArray(saved))for(const row of saved)if(row&&typeof row.sku==="string"&&Number.isInteger(row.quantity)&&row.quantity>=1&&row.quantity<=10)cart.set(row.sku,row.quantity);
function persist(){write(localStorage,cartKey,[...cart].map(([sku,quantity])=>({sku,quantity})));}
const form=$("shipping-form"),field=name=>form.elements.namedItem(name);
function renderCart(){
 const box=$("cart-items");box.replaceChildren();let subtotal=0,count=0;
 for(const [sku,q] of cart){
  const p=products.get(sku);
  const row=el("div");row.className="store-cart-row";row.append(el("strong",p?.name||sku));
  if(!p){row.append(el("p",catalogReady?publicError(null,"PTG-008"):"Checking availability…"));row.append(btn("Remove",()=>change(sku,-q)));box.append(row);continue;}
  subtotal+=q*p.priceCents;count+=q;
  const amount=el("p",money(p.priceCents)+" each · "+money(q*p.priceCents));amount.className="store-cart-price";row.append(amount);
  const controls=el("div");controls.className="cart-controls";controls.append(btn("−",()=>change(sku,-1)),el("span",String(q)),btn("+",()=>change(sku,1)),btn("Remove",()=>change(sku,-q)));row.append(controls);box.append(row);
 }
 if(!cart.size)box.append(el("p","Your cart is empty."));
 $("cart-count").textContent=String(count);$("cart-subtotal").textContent=money(subtotal);
 updateControls();
 if(!STORE_WORKER_URL)$("store-checkout").title=publicError(null,"PTG-202");
}
const stockInfo=p=>p?.inventory||{mode:"made_to_order",stock:0,minDays:2,maxDays:3};
const stockLabel=p=>{const i=stockInfo(p);return i.mode==="out_of_stock"||i.mode==="in_stock"&&i.stock===0?"Out of stock":(i.mode==="in_stock"?i.stock+" in stock":"Made to order")+" · "+i.minDays+"–"+i.maxDays+" business days before shipping";};
const canAdd=(p,q)=>{const i=stockInfo(p);return i.mode!=="out_of_stock"&&(i.mode!=="in_stock"||q<=i.stock);};
function change(sku,delta){
 if(order||busy||receiptKind){message(publicError(null,"PTG-211"));return;}
 const q=(cart.get(sku)||0)+delta;
 if(delta>0&&!canAdd(products.get(sku),q)){$("store-status").textContent=publicError(null,"PTG-208");return;}
 if(delta>0&&[...cart.keys()].some(key=>(products.get(key)?.profileId||"cd-slim")!==(products.get(sku)?.profileId||"cd-slim"))){$("store-status").textContent=publicError(null,"PTG-209");return;}
 if(q>10||q>0&&cart.size>=8&&!cart.has(sku)||[...cart.values()].reduce((a,b)=>a+b,0)+delta>20){$("store-status").textContent=publicError(null,"PTG-210");return;}
 if(q<=0)cart.delete(sku);else cart.set(sku,q);
 clearShippingQuote();persist();renderCart();
 if(delta>0){const product=products.get(sku);$("store-cart-feedback").textContent=product?"Added "+product.name+" to your cart.":"Cart updated."; }
}
let detailSKU=null;
function updateCDDetails(){
 const p=products.get(detailSKU);if(!p)return;
 $("cd-detail-title").textContent=p.name;
 $("cd-detail-price").textContent=money(p.priceCents);
 $("cd-detail-meta").textContent=p.kind==="merch"?p.category:p.songIds.length+" tracks · "+p.category;
 $("cd-detail-meta").textContent+=" · "+stockLabel(p);
 $("cd-detail-description").textContent=p.description;
 $("cd-detail-description").hidden=!p.description;
 $("cd-detail-track-title").hidden=p.kind==="merch";$("cd-detail-tracks").hidden=p.kind==="merch";
 $("cd-detail-tracks").replaceChildren(...p.songIds.map(id=>el("li",titles.get(id)||id)));
}
function openCDDetails(p){
 if(busy||order||receiptKind)return;
 detailSKU=p.sku;updateCDDetails();
 const dialog=$("cd-detail-dialog");if(!dialog.open)dialog.showModal();
}
$("cd-detail-dialog").addEventListener("close",()=>{detailSKU=null;});
$("cd-detail-add").onclick=()=>{if(detailSKU)change(detailSKU,1);};
function makeProduct(p){
 const card=el("article");card.className="store-card";
 const open=btn("",()=>openCDDetails(p));open.className="store-icon-open";
 open.setAttribute("aria-label","View details for "+p.name);open.title=p.name;
 const fallback=el("div",p.kind==="merch"?"Product":"CD");fallback.className="store-cover";fallback.setAttribute("aria-hidden","true");
 if(/^https:\/\//i.test(p.coverUrl)){
  const img=el("img");img.src=p.coverUrl;img.alt="";img.loading="lazy";img.onerror=()=>img.replaceWith(fallback);open.append(img);
 }else open.append(fallback);
 const name=el("span",p.name);name.className="store-icon-title";open.append(name);card.append(open);
 const info=el("div");info.className="store-icon-info";
 const price=el("span",money(p.priceCents));price.className="store-price";
 const add=btn("+",()=>change(p.sku,1));add.className="store-icon-add";add.setAttribute("aria-label","Add "+p.name+" to cart");add.title="Add to cart";
 info.append(price,add);card.append(info,el("small",stockLabel(p)));add.dataset.sku=p.sku;return card;
}
function refreshAlbumOptions(){
 const choices=new Map(filterCDs([...products.values()],selectedCategory).map(p=>[p.albumId,p.albumName]));
 const select=$("store-album-select");
 if(selectedAlbum&&!choices.has(selectedAlbum))selectedAlbum="";
 select.replaceChildren(new Option("All products",""),...[...choices].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>new Option(name,id)));
 select.value=selectedAlbum;
}
function chooseCategory(key){
 selectedCategory=key;productPage=0;
 $("store-category-select").value=key;
 for(const button of $("store-category-tabs").querySelectorAll("button"))button.setAttribute("aria-pressed",String(button.dataset.category===key));
 refreshAlbumOptions();renderProducts();
}
function mountCatalogFilters(){
 const categories=[["","All products"],...categoryOptions([...products.values()])];
 if(!categories.some(([key])=>key===selectedCategory))selectedCategory="";
 const tabs=$("store-category-tabs"),dropdown=$("store-category-select");
 tabs.replaceChildren(...categories.map(([key,name])=>{const button=btn(name,()=>chooseCategory(key));button.dataset.category=key;button.setAttribute("aria-pressed",String(key===selectedCategory));return button;}));
 dropdown.replaceChildren(...categories.map(([key,name])=>new Option(name,key)));
 dropdown.value=selectedCategory;
 refreshAlbumOptions();
}
$("store-category-select").onchange=e=>chooseCategory(e.target.value);
$("store-album-select").onchange=e=>{selectedAlbum=e.target.value;productPage=0;renderProducts();};
function renderProducts(){
 const root=$("store-products"),featuredRoot=$("store-featured-products");
 root.replaceChildren();featuredRoot.replaceChildren();
 const visible=filterCDs([...products.values()],selectedCategory,selectedAlbum).sort((a,b)=>a.albumName.localeCompare(b.albumName)||a.volume-b.volume);
 const ordered=[...visible.filter(p=>p.featured),...visible.filter(p=>!p.featured)],pages=Math.max(1,Math.ceil(ordered.length/productPageSize));productPage=Math.max(0,Math.min(productPage,pages-1));const slice=ordered.slice(productPage*productPageSize,(productPage+1)*productPageSize),featured=slice.filter(p=>p.featured),regular=slice.filter(p=>!p.featured);const pager=$("physical-pages");pager.hidden=pages<=1;pager.querySelector("[data-page-prev]").disabled=productPage===0;pager.querySelector("[data-page-next]").disabled=productPage>=pages-1;pager.querySelector("[data-page-label]").textContent="Page "+(productPage+1)+" of "+pages;
 $("store-featured-section").hidden=!featured.length;
 $("store-regular-section").hidden=!!featured.length&&!regular.length;
 $("store-regular-title").hidden=!featured.length||!regular.length;
 $("store-filter-count").textContent=visible.length+" "+(visible.length===1?"product":"products");
 for(const p of featured)featuredRoot.append(makeProduct(p));
 for(const p of regular)root.append(makeProduct(p));
 if(!visible.length){const empty=el("p",products.size?"No products match this selection.":"No products are listed for sale yet.");empty.className="store-grid-empty";root.append(empty);}
 updateControls();
}
$("physical-pages").querySelector("[data-page-prev]").onclick=()=>{productPage--;renderProducts();};$("physical-pages").querySelector("[data-page-next]").onclick=()=>{productPage++;renderProducts();};
async function loadCatalog(){
 try{
  const [{db},{collection,getDocs}]=await Promise.all([import("./firebase.js"),import("https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js")]);
  const snap=await getDocs(collection(db,"albums"));
  products=new Map(snap.docs.flatMap(s=>storeProducts(s.id,s.data())).map(p=>[p.sku,p]));
  let merchandiseUnavailable=false;
  if(STORE_WORKER_URL)try{const catalog=await api("/catalog");for(const p of catalog.products||[])products.set(p.sku,p);for(const i of catalog.inventory||[]){const p=products.get(i.sku);if(p)p.inventory=i;}}catch(e){merchandiseUnavailable=true;console.warn("Merchandise catalog unavailable",e.message);}
  catalogReady=true;mountCatalogFilters();renderProducts();renderCart();$("store-status").textContent=!STORE_WORKER_URL?publicError(null,"PTG-202"):merchandiseUnavailable?publicError(null,"PTG-201"):"";
  void import("./song-data.js").then(({loadAllSongs})=>loadAllSongs("../audioPlayer/audio/song-details.json")).then(songs=>{titles=new Map(songs.map(s=>[s.pageId,s.title]));if(detailSKU)updateCDDetails();}).catch(()=>{});
 }catch(e){$("store-status").textContent=publicError(e,"PTG-201");}
}
async function api(path,data){
 if(!STORE_WORKER_URL)throw siteError("PTG-202");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
  const res=await fetch(STORE_WORKER_URL.replace(/\/$/,"")+path,{method:data?"POST":"GET",headers:data?{"Content-Type":"application/json"}:{},body:data?JSON.stringify(data):undefined,signal:controller.signal});
  const result=await res.json();if(!res.ok)throw Object.assign(Error(result.error||"Checkout unavailable."),{status:res.status});return result;
 }catch(e){throw controller.signal.aborted?siteError("PTG-002",e):storeError(e,path);}
 finally{clearTimeout(timer);}
}
function options(select,values,placeholder){select.replaceChildren(new Option(placeholder,""));for(const [value,label] of values)select.add(new Option(label,value));}
const us="AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const ca="AB BC MB NB NL NS NT NU ON PE QC SK YT".split(" ");
function regionName(code){try{return new Intl.DisplayNames(["en"],{type:"region"}).of(code)||code;}catch{return code;}}
function countryChanged(){
 if(!config)return;
 const country=field("country").value,z=config.zones.filter(x=>x.country===country);
 const states=new Set(z.filter(x=>x.state!=="*").map(x=>x.state));
 if(z.some(x=>x.state==="*")){if(country==="US")us.forEach(x=>states.add(x));else if(country==="CA")ca.forEach(x=>states.add(x));else states.add("__other");}
 options(field("stateChoice"),[...states].sort().map(x=>[x,x==="__other"?"Other / not applicable":x]),"Select state / province");stateChanged();
 field("postal_code").required=["US","CA"].includes(country);
 if(field("phone"))field("phone").required=!!config.carrierShipping&&country!==""&&country!=="US";
}
function stateChanged(){
 if(!config)return;
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
  card.append(art,el("span","Welcome to the shop!"));root.replaceChildren(card);
  await reef.discoverAxolotl("shelly");
 }catch(e){$("store-reef-friends").replaceChildren(el("p",publicError(e,"PTG-212")));console.warn("Store visit discovery unavailable",e);}
}
async function revealTide(){
 try{
  const reef=await import("./reef-collection.js");
  if($("receipt-panel").hidden||$("receipt-tide").hidden)return;
  $("receipt-tide-art").innerHTML=reef.axolotlPortrait("tide");
 }catch(e){console.warn("Receipt mascot unavailable",e);}
}
function showReceipt(kind,text){
 receiptKind=kind;
 $("cd-detail-dialog").close?.();
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
 if(claimBusy||busy)return;
 const ref=read(sessionStorage,rewardKey,null);
 if(!ref||order)return;
 claimBusy=true;updateControls();
 const status=$("reward-status");
 try{
  const idToken=await buyerToken();
  if(!idToken){status.textContent="Sign in to meet Tide.";const button=$("auth-open");if(button&&!button.hidden)button.click();return;}
  const r=await api("/claim-reward",{...ref,idToken});
  if(read(sessionStorage,rewardKey,null)?.id!==ref.id)return;
  if(r.reward==="disabled"){status.textContent="";remove(sessionStorage,rewardKey);}
  else if(r.reward==="claimed"){
   status.textContent="";
   remove(sessionStorage,rewardKey);
  }else throw siteError("PTG-213");
  $("claim-purchase-reward").hidden=true;
 }catch(e){status.textContent=publicError(e,"PTG-213");}
 finally{claimBusy=false;updateControls();}
}
async function openCheckout(){
 if(order||receiptKind||busy||!cart.size)return;
 await exclusive(async()=>{
  $("checkout-panel").hidden=false;$("checkout-panel").scrollIntoView({block:"start"});
  // Repeated clicks must not overwrite selected shipping fields.
  if(config&&!configFailed)return;
  config=null;configFailed=false;$("retry-config").hidden=true;message("Loading available destinations…");
  try{
   config=await api("/config");$("checkout-mode").textContent=config.mode==="test"?"TEST MODE · No real payment or shipment.":"Secure checkout · USD";
   clearShippingQuote();options(field("country"),[...new Set(config.zones.map(x=>x.country))].sort().map(x=>[x,regionName(x)]),"Select nation");countryChanged();message("");
  }catch(e){config=null;configFailed=true;message(publicError(e,"PTG-203"));$("retry-config").hidden=false;}
 });
}
field("country").onchange=countryChanged;field("stateChoice").onchange=stateChanged;field("cityChoice").onchange=cityChanged;
$("store-checkout").onclick=()=>void openCheckout();
$("retry-config").onclick=()=>void openCheckout();
async function loadStripe(){
 for(let i=0;i<100&&typeof window.Stripe!=="function";i++)await new Promise(r=>setTimeout(r,100));
 if(typeof window.Stripe!=="function")throw siteError("PTG-205");
}
function saveOrder(reference){if(!write(sessionStorage,orderKey,reference))throw siteError("PTG-006");}
function destroyPayment(){
 const old=paymentElement;paymentElement=null;elements=null;stripe=null;paymentReady=false;paymentMayProceed=false;
 try{old?.destroy();}catch(e){console.warn("Previous payment form cleanup",e);}
}
async function mountPayment(q,reference){
 await loadStripe();
 if(order!==reference)throw siteError("PTG-009");
 destroyPayment();stripe=window.Stripe(q.publishableKey);
 elements=stripe.elements({clientSecret:q.clientSecret,appearance:{theme:"night"}});
 const element=elements.create("payment");paymentElement=element;
 paymentMayProceed=true;
 $("payment-panel").hidden=false;$("shipping-form").hidden=true;$("check-order").hidden=false;$("resume-payment").hidden=true;
 if($("shipping-rate-panel"))$("shipping-rate-panel").hidden=true;
 if($("quote-service"))$("quote-service").textContent=q.shippingService?q.shippingService.carrier+" · "+q.shippingService.service+(q.processing?" · "+q.processing.minDays+"–"+q.processing.maxDays+" business days processing":"")+(q.shippingService.days==null?"":" + estimated "+q.shippingService.days+" transit days"):"";
 const list=$("order-lines");list.replaceChildren(...q.lines.map(l=>el("p",l.quantity+" × "+l.name+" · "+money(l.quantity*l.priceCents))));
 for(const k of ["subtotal","shipping","tax","total"])$("quote-"+k).textContent=money(q[k]);
 $("pay-button").textContent="Pay "+money(q.total);
 element.on("ready",()=>{if(paymentElement===element&&order===reference){paymentReady=true;updateControls();message("Review the final amount, then enter your payment details.");}});
 element.on("loaderror",()=>{if(paymentElement===element&&order===reference){paymentReady=false;$("resume-payment").hidden=false;updateControls();message(publicError(null,"PTG-205"));}});
 element.mount("#payment-element");
 if(!paymentReady)message("Loading secure payment form…");
 setTimeout(()=>{if(paymentElement===element&&order===reference&&!paymentReady){$("resume-payment").hidden=false;updateControls();message(publicError(null,"PTG-205"));}},15000);
}
function showRecovery(text,resume=true){
 $("checkout-panel").hidden=false;$("shipping-form").hidden=true;$("payment-panel").hidden=false;
 $("check-order").hidden=false;$("resume-payment").hidden=!resume;$("edit-checkout").hidden=false;
 message(text);
}
form.oninput=e=>{if(e.target?.id!=="shipping-rate-select"&&!order&&shippingQuote)clearShippingQuote();};
form.onsubmit=async e=>{
 e.preventDefault();if(busy||!config||order||!cart.size||receiptKind)return;
 await exclusive(async()=>{
  try{
   const values=Object.fromEntries(new FormData(form));
   const address={name:values.name,email:values.email,country:values.country,state:values.stateChoice==="__other"?values.stateOther||"":values.stateChoice,city:values.cityChoice==="__other"?values.cityOther:values.cityChoice,line1:values.line1,line2:values.line2,postal_code:values.postal_code,phone:values.phone||""};
   const lines=[...cart].map(([sku,quantity])=>{const p=products.get(sku);if(!p)throw siteError("PTG-008");return p.kind==="merch"?{productId:p.id,quantity}:{albumId:p.albumId,volume:p.volume,quantity};});
   const fingerprint=JSON.stringify({address,lines});let selection={};
   if(config.carrierShipping){
    if(!shippingQuote||shippingQuote.fingerprint!==fingerprint||shippingQuote.expires<=Date.now()){
     clearShippingQuote();message("Requesting carrier shipping rates…");
     const quote=await api("/shipping-quotes",{address,cart:lines});shippingQuote={...quote,fingerprint};
     options($("shipping-rate-select"),quote.options.map(r=>[r.id,r.carrier+" · "+r.service+" · "+money(r.totalCents)+(r.days===null?"":" · estimated "+r.days+" transit days")]),"Choose a shipping service");
     $("shipping-rate-panel").hidden=false;$("shipping-rate-note").textContent=(quote.international?"Recipient-paid import duties and fees may apply. ":"")+"Production / handling: "+(quote.processing?quote.processing.minDays+"–"+quote.processing.maxDays+" business days":"see product listing")+". Add carrier transit time shown above; weekends and holidays may extend delivery. Shipping includes packaging and service fees. Rates expire after 15 minutes.";
     $("quote-button").textContent="Review total and payment";message("Select a shipping service to calculate tax and total.");return;
    }
    const rateId=$("shipping-rate-select").value;
    if(!shippingQuote.options.some(r=>r.id===rateId)){message(publicError(null,"PTG-203"));return;}
    selection={quoteId:shippingQuote.id,rateId};
   }
   const reference={id:crypto.randomUUID(),token:crypto.randomUUID()};
   saveOrder(reference);order=reference;renderCart();message("Calculating your order…");
   const q=await api("/checkout",{...reference,address,cart:lines,...selection,idToken:await buyerToken()});await mountPayment(q,reference);
  }catch(err){if(order){destroyPayment();showRecovery(publicError(err,"PTG-202"));}else message(publicError(err,"PTG-202"));}
 });
};
$("payment-form").onsubmit=async e=>{
 e.preventDefault();if(busy||!order||!stripe||!elements||!paymentReady||!paymentMayProceed)return;
 await exclusive(async()=>{
  paymentMayProceed=false;updateControls();
  try{
   const returnUrl=new URL(location.href);returnUrl.search="";returnUrl.hash="";returnUrl.searchParams.set("paymentReturn","1");
   const result=await stripe.confirmPayment({elements,confirmParams:{return_url:returnUrl.href},redirect:"if_required"});
   if(result.error){
    const detail=publicError(result.error,"PTG-206");;
    // Even an error can follow a network interruption after submission.
    // Verify with the Worker before allowing another confirmation.
    await checkOrder(detail);return;
   }
   await checkOrder();
  }catch(err){await checkOrder(publicError(err,"PTG-206"));}
 });
 if(receiptKind==="paid"&&!$("claim-purchase-reward").hidden&&await buyerToken())void claimReward();
};
async function readOrderStatus(reference){
 for(let attempt=0;;attempt++){
  try{return await api("/status",reference);}
  catch(e){if(e.status!==503||attempt>=2)throw e;await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));}
 }
}
async function checkOrder(prefix=""){
 if(!order)return;
 const reference=order;
 try{
  const r=await readOrderStatus(reference);
  if(order!==reference)return;
  if(r.status==="paid"){
   const available=r.reward==="available";
   $("claim-purchase-reward").hidden=!available;
   $("reward-status").textContent=available?"Sign in to meet Tide.":"";
   if(available&&!write(sessionStorage,rewardKey,reference))$("reward-status").textContent=publicError(null,"PTG-006");
   resetCheckout();cart.clear();persist();renderCart();
   showReceipt("paid","Payment confirmed. Order reference: "+reference.id+". Your order will be processed using your shipping details.");
  }else if(r.status==="refunded"||r.status==="partially_refunded"){
   resetCheckout();cart.clear();persist();renderCart();
   const pending=read(sessionStorage,rewardKey,null);if(pending?.id===reference.id)remove(sessionStorage,rewardKey);
   $("claim-purchase-reward").hidden=true;$("reward-status").textContent="";
   showReceipt("refund",(r.status==="refunded"?"This order was fully refunded.":"This order was partially refunded.")+" Order reference: "+reference.id+". Contact support for details.");
  }else if(r.status==="canceled"){resetCheckout();message("Checkout canceled. Your cart is still here.");}
  else{
   const retryable=["requires_payment_method","requires_confirmation","requires_action","pending"].includes(r.status);
   paymentMayProceed=retryable&&r.status!=="pending"&&paymentReady&&!!paymentElement;
   showRecovery(prefix||publicError(null,retryable?"PTG-206":"PTG-204"),retryable&&!paymentMayProceed);
  }
 }catch(e){paymentMayProceed=false;showRecovery(publicError(e,"PTG-204"),e.status!==503);}
}
function resetCheckout(){
 remove(sessionStorage,orderKey);order=null;destroyPayment();clearShippingQuote();
 $("payment-panel").hidden=true;$("shipping-form").hidden=false;$("check-order").hidden=true;$("resume-payment").hidden=true;
 $("pay-button").textContent="Pay";$("order-lines").replaceChildren();for(const key of ["subtotal","shipping","tax","total"])$("quote-"+key).textContent="";
 message("");renderCart();
}
$("check-order").onclick=async()=>{
 await exclusive(()=>checkOrder());
 if(receiptKind==="paid"&&!$("claim-purchase-reward").hidden&&await buyerToken())void claimReward();
};
$("resume-payment").onclick=()=>exclusive(async()=>{
 if(!order)return;const reference=order;
 try{message("Recovering the existing payment…");const q=await api("/checkout",reference);await mountPayment(q,reference);}
 catch(e){destroyPayment();await checkOrder(publicError(e,"PTG-204"));}
});
$("edit-checkout").onclick=()=>exclusive(async()=>{
 if(!order)return;
 try{await api("/cancel",order);resetCheckout();message("Edit your shipping information or cart.");}
 catch(e){await checkOrder(publicError(e,"PTG-204"));}
});
$("shop-again").onclick=()=>{
 if(busy||claimBusy)return;
 receiptKind=null;$("receipt-panel").hidden=true;$("receipt-tide").hidden=true;$("storefront").hidden=false;$("checkout-panel").hidden=true;window.scrollTo(0,0);$("store-checkout").focus();updateControls();
};
$("claim-purchase-reward").onclick=()=>void claimReward();
$("restore-tide-claim").onclick=()=>void exclusive(restoreRewardReceipt);
async function restoreRewardReceipt(){
 const saved=read(sessionStorage,rewardKey,null);if(!saved||order)return;
 try{
  const result=await readOrderStatus(saved);if(order||read(sessionStorage,rewardKey,null)?.id!==saved.id)return;
  if(result.status==="paid"&&result.reward==="available"){
   $("claim-purchase-reward").hidden=false;$("reward-status").textContent="Sign in to meet Tide.";
   showReceipt("paid","Payment confirmed. Order reference: "+saved.id+".");
  }else if(["refunded","partially_refunded","canceled"].includes(result.status)||result.reward==="disabled")remove(sessionStorage,rewardKey);
 }catch(e){$("store-status").textContent=publicError(e,"PTG-213");console.warn("Pending Tide claim could not be restored",e);}
}
const previous=read(sessionStorage,orderKey,null);
if(previous?.id&&previous?.token){order=previous;showRecovery("Checking your previous checkout…",false);void exclusive(checkOrder);}
else if(read(sessionStorage,rewardKey,null))void exclusive(restoreRewardReceipt);
renderCart();void loadCatalog();void meetShelly();
