import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {publicError,siteError,storeError} from "../../../script/site-errors.js";
async function runRecoveryTests(source,assert){
 const storage=()=>{const m=new Map();return {fail:false,getItem:k=>m.get(k)??null,setItem(k,v){if(this.fail)throw Error("blocked storage");m.set(k,v)},removeItem:k=>m.delete(k)}};
 const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
 const nodes=new Map(),fields=new Map(),calls=[],queue=new Map(),friends=[];
 function node(tag){return {tagName:typeof tag==="string"?tag.toUpperCase():"",hidden:false,disabled:false,value:"",textContent:"",children:[],dataset:{},append(...x){this.children.push(...x)},replaceChildren(...x){this.children=x},add(x){this.children.push(x)},setAttribute(){},addEventListener(){},querySelectorAll(){return []},focus(){},scrollIntoView(){},close(){},showModal(){},open:false}}
 function get(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)}
 get("shipping-form").elements={namedItem(name){if(!fields.has(name))fields.set(name,node());return fields.get(name)}};
 for(const id of ["receipt-panel","checkout-panel","payment-panel","receipt-tide","resume-payment","claim-purchase-reward"])get(id).hidden=true;
 const local=storage(),session=storage();
 const shipping={mode:"test",zones:[{country:"US",state:"WI",city:"*"}]};
 const quote={id:"test",publishableKey:"pk_test_fake",clientSecret:"fake",lines:[{name:"CD",quantity:1,priceCents:500}],subtotal:500,shipping:500,tax:55,total:1055};
 function plan(path,value,status=200){const q=queue.get(path)||[];q.push({value,status});queue.set(path,q)}
 async function fetchMock(url,opt){
  const path=url.replace("https://worker.test","");calls.push({path,body:opt.body?JSON.parse(opt.body):null});
  const entry=queue.get(path)?.shift();if(!entry)throw Error("Unexpected request "+path);
  const value=await entry.value;if(value instanceof Error)throw value;
  return {ok:entry.status<400,status:entry.status,json:async()=>value};
 }
 let currentElement=null,confirmations=0,confirmResult={};
 const win={addEventListener(){},scrollTo(){},Stripe(){return {
  elements(){return {create(){const handlers={};const element={destroyed:false,on(k,fn){handlers[k]=fn},emit(k){handlers[k]?.()},mount(){},destroy(){this.destroyed=true}};currentElement=element;return element}}},async confirmPayment(){confirmations++;return await confirmResult}
 }}};
 let id=0;
 const timeout=(fn,ms)=>{if(ms<1000)Promise.resolve().then(fn);return 1};
 const modules=async name=>{
  if(name==="./firebase.js")return {auth:{authStateReady:async()=>{},currentUser:null}};
  if(name==="./reef-collection.js")return {axolotlPortrait:id=>"<svg>"+id+"</svg>",discoverAxolotl:async id=>{friends.push(id);return "saved"},isAxolotlConfirmed:()=>true,announcePurchaseDiscovery(){}};
  throw Error("Unexpected module "+name);
 };
 const clean=source.replace(/^import .*$/gm,"").replace(/\bimport\(/g,"loadModule(").replace(/const previous=read\(sessionStorage,orderKey,null\);[\s\S]*$/,"");
 const factory=new Function("document","window","location","localStorage","sessionStorage","fetch","crypto","FormData","Option","setTimeout","clearTimeout","loadModule","STORE_WORKER_URL","money","AbortController","URL","publicError","siteError","storeError",clean+
 'return {openCheckout,meetShelly,checkOrder,exclusive,restoreRewardReceipt,seed(){products.set("cd:1",{sku:"cd:1",albumId:"cd",volume:1,name:"CD",priceCents:500});cart.set("cd:1",1);catalogReady=true;renderCart()},recover(ref){order=ref;showRecovery("Recover",false);updateControls()},get(){return {order,busy,receiptKind,paymentReady,paymentMayProceed,cart:cart.size}},change};');
 const app=factory({getElementById:get,createElement:node,querySelectorAll:()=>[]},win,{href:"https://store.test/pages/store.html"},local,session,fetchMock,{randomUUID:()=>String(++id)},class{*[Symbol.iterator](){yield* Object.entries({name:"Test",email:"test@example.test",country:"US",stateChoice:"WI",cityChoice:"__other",cityOther:"Test",line1:"100 Test",line2:"",postal_code:"54494"})}},class{constructor(label,value){this.label=label;this.value=value}},timeout,()=>{},modules,"https://worker.test",n=>"$"+(n/100).toFixed(2),class{signal={aborted:false};abort(){this.signal.aborted=true}},class{constructor(href){this.href=href;this.searchParams={set(){}}}},publicError,siteError,storeError);
 const event={preventDefault(){}},count=path=>calls.filter(c=>c.path===path).length;
 app.seed();const cfg=deferred();plan("/config",cfg.promise);
 const opening=app.openCheckout(),opening2=app.openCheckout();
 assert.equal(get("quote-button").disabled,true);
 await get("shipping-form").onsubmit(event);
 assert.equal(count("/config"),1);assert.equal(count("/checkout"),0);
 cfg.resolve(shipping);await opening;await opening2;
 assert.equal(get("quote-button").disabled,false);
 fields.get("country").value="US";
 await app.openCheckout();assert.equal(count("/config"),1);assert.equal(fields.get("country").value,"US");
 const q=deferred();plan("/checkout",q.promise);
 const creating=get("shipping-form").onsubmit(event);
 await get("shipping-form").onsubmit(event);await get("edit-checkout").onclick();await get("check-order").onclick();
 assert.equal(get("edit-checkout").disabled,true);assert.equal(count("/cancel"),0);assert.equal(count("/status"),0);
 q.resolve(quote);await creating;assert.equal(count("/checkout"),1);
 assert.equal(get("pay-button").disabled,true);
 currentElement.emit("ready");assert.equal(get("pay-button").disabled,false);
 const first=currentElement,declined=deferred();confirmResult=declined.promise;
 plan("/status",{status:"requires_payment_method"});
 const paying=get("payment-form").onsubmit(event);
 await get("payment-form").onsubmit(event);await get("edit-checkout").onclick();await get("check-order").onclick();
 assert.equal(confirmations,1);assert.equal(count("/cancel"),0);assert.equal(count("/status"),0);
 declined.resolve({error:{message:"Declined"}});await paying;
 assert.match(get("checkout-status").textContent,/PTG-206/);assert.ok(!get("checkout-status").textContent.includes("Declined"));
 assert.equal(count("/status"),1);assert.equal(get("pay-button").disabled,false);
 assert.equal(app.get().cart,1);
 confirmResult={};plan("/status",Error("Network lost"));
 await get("payment-form").onsubmit(event);
 assert.equal(get("pay-button").disabled,true);assert.equal(get("check-order").hidden,false);
 plan("/status",{error:"Refund reconciliation busy"},503);plan("/status",{status:"paid",reward:"disabled"});
 await get("check-order").onclick();
 assert.equal(get("storefront").hidden,true);assert.equal(get("receipt-panel").hidden,false);assert.equal(get("receipt-tide").hidden,false);
 assert.equal(get("claim-purchase-reward").hidden,true);assert.equal(first.destroyed,true);assert.equal(app.get().cart,0);
 assert.equal(get("reward-status").textContent,"");
 get("shop-again").onclick();assert.equal(get("storefront").hidden,false);assert.equal(get("receipt-panel").hidden,true);
 app.seed();await app.openCheckout();plan("/checkout",quote);
 await get("shipping-form").onsubmit(event);const second=currentElement;
 assert.equal(get("pay-button").disabled,true);first.emit("ready");assert.equal(get("pay-button").disabled,true);
 second.emit("loaderror");assert.equal(get("resume-payment").hidden,false);
 plan("/status",{status:"requires_payment_method"});await get("check-order").onclick();
 assert.equal(get("resume-payment").hidden,false);assert.equal(get("pay-button").disabled,true);
 const ref=app.get().order;plan("/checkout",quote);await get("resume-payment").onclick();
 assert.deepEqual(calls.filter(c=>c.path==="/checkout").at(-1).body,ref);
 currentElement.emit("ready");assert.equal(get("pay-button").disabled,false);
 plan("/cancel",{canceled:true});await get("edit-checkout").onclick();
 assert.equal(app.get().cart,1);assert.equal(app.get().order,null);assert.equal(get("shipping-form").hidden,false);
 plan("/checkout",Error("Offline"));await get("shipping-form").onsubmit(event);
 assert.equal(get("resume-payment").hidden,false);assert.equal(get("pay-button").disabled,true);assert.equal(!!app.get().order,true);
 assert.match(get("checkout-status").textContent,/PTG-\d{3}/);assert.ok(!get("checkout-status").textContent.includes("Offline"));
 plan("/cancel",{canceled:true});await get("edit-checkout").onclick();
 assert.equal(app.get().order,null);assert.equal(app.get().cart,1);
 session.fail=true;const before=count("/checkout");await get("shipping-form").onsubmit(event);
 assert.equal(app.get().order,null);assert.equal(count("/checkout"),before);session.fail=false;
 app.recover({id:"saved-order",token:"saved-token"});plan("/status",{status:"requires_payment_method"});await get("check-order").onclick();
 assert.equal(get("resume-payment").hidden,false);assert.equal(get("pay-button").disabled,true);
 plan("/checkout",quote);await get("resume-payment").onclick();assert.equal(calls.filter(c=>c.path==="/checkout").at(-1).body.id,"saved-order");
 plan("/status",{status:"refunded"});await get("check-order").onclick();
 assert.equal(get("receipt-tide").hidden,true);assert.equal(get("receipt-title").textContent,"Order refund");
 get("shop-again").onclick();await app.meetShelly();assert.deepEqual(friends,["shelly"]);assert.equal(get("store-reef-friends").children.length,1);
 const mascot=get("store-reef-friends").children[0];
 assert.equal(mascot.children.length,2);assert.ok(mascot.children.every(child=>child.tagName!=="BUTTON"));
 assert.equal(mascot.children[1].textContent,"Welcome to the shop!");
}
await runRecoveryTests(await readFile(new URL("../../../script/store.js",import.meta.url),"utf8"),assert);
console.log("Checkout recovery simulations passed");
