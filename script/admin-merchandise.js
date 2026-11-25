import {publicError} from "./site-errors.js";
import {auth} from "./firebase.js";
import {verifyStaff} from "./staff-auth.js";
import {STORE_WORKER_URL} from "./store-config.js";
const $=id=>document.getElementById(id);
const profile=$("merch-profile-form"),product=$("merch-product-form"),load=$("merch-load"),status=$("merch-status");
const pPick=$("merch-profile-picker"),mPick=$("merch-product-picker");
let data={profiles:[],products:[]},busy=false,ready=false;
const pf=["length","width","baseHeight","discHeight","baseWeight","discWeight","maxUnits"];
const fees=["packagingCents","insuranceCents","trackingCents"];
const field=(form,k)=>form.elements.namedItem(k);
function controls(){
 if(!load)return;load.disabled=busy;
 for(const form of [profile,product])for(const el of form.elements)el.disabled=busy||!ready;
}
function fill(form,record,centFields){
 form.reset();
 for(const [key,v] of Object.entries(record||{})){
  const el=field(form,key);if(!el)continue;
  if(el.type==="checkbox")el.checked=v===true;
  else el.value=v===null?"":centFields.includes(key)?(v/100).toFixed(2):String(v);
 }
 field(form,"id").readOnly=!!record;
}
function chooseProfile(){const id=pPick.value;fill(profile,data.profiles.find(p=>p.id===id),fees);pPick.value=id;}
function chooseProduct(){const id=mPick.value;fill(product,data.products.find(p=>p.id===id),["priceCents"]);mPick.value=id;}
function options(select,items,placeholder,selected){
 select.replaceChildren(new Option(placeholder,""),...items.map(x=>new Option(x.name+" ("+x.id+")",x.id)));
 select.value=items.some(x=>x.id===selected)?selected:"";
}
function render(selectedProfile="",selectedProduct=""){
 options(pPick,data.profiles,"Create new profile",selectedProfile);
 options(mPick,data.products,"Create new product",selectedProduct);
 options(field(product,"profileId"),data.profiles,"Choose a profile","");
 chooseProfile();chooseProduct();
 $("merch-mode").textContent=data.mode==="live"?"PRODUCTION catalog: enabled listings can be sold.":"SANDBOX catalog: test listings only.";
}
async function request(action,extra={},selectedProfile=pPick.value,selectedProduct=mPick.value){
 if(busy)return;busy=true;controls();status.textContent="Checking staff access…";
 try{
  if(!await verifyStaff()||!auth.currentUser)throw Error("Administrator access required.");
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try{
   const res=await fetch(STORE_WORKER_URL.replace(/\/$/,"")+"/catalog-admin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...extra,idToken:await auth.currentUser.getIdToken()}),signal:controller.signal});
   const result=await res.json();if(!res.ok)throw Object.assign(Error(result.error||"Catalog unavailable."),{status:res.status});
   data=result;ready=true;render(selectedProfile,selectedProduct);status.textContent=action==="list"?"Catalog loaded.":"Saved successfully.";
  }finally{clearTimeout(timer);}
 }catch(e){status.textContent=publicError(e,"PTG-901");}finally{busy=false;controls();}
}
if(load&&profile&&product){
 controls();load.onclick=()=>void request("list");pPick.onchange=chooseProfile;mPick.onchange=chooseProduct;
 profile.onsubmit=e=>{
  e.preventDefault();if(!ready||busy)return;
  const p={id:field(profile,"id").value.trim(),name:field(profile,"name").value.trim(),verified:field(profile,"verified").checked};
  for(const k of pf)p[k]=Number(field(profile,k).value);
  for(const k of fees)p[k]=Math.round(Number(field(profile,k).value)*100);
  void request("save-profile",{profile:p},p.id,mPick.value);
 };
 product.onsubmit=e=>{
  e.preventDefault();if(!ready||busy)return;
  const p={};for(const k of ["id","name","category","description","coverUrl","profileId","taxCode","originCountry","tariffNumber","customsDescription"])p[k]=field(product,k).value.trim();
  p.priceCents=Math.round(Number(field(product,"priceCents").value)*100);
  p.unitWeight=field(product,"unitWeight").value===""?null:Number(field(product,"unitWeight").value);
  p.enabled=field(product,"enabled").checked;p.featured=field(product,"featured").checked;
  void request("save-product",{product:p},pPick.value,p.id);
 };
}
