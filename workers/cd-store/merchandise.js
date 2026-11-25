// Per-environment catalog and shipping profiles. Only authenticated staff may mutate records.
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const validId=v=>typeof v==="string"&&/^[a-z0-9][a-z0-9-]{0,59}$/.test(v);
const str=(v,max,required=true)=>{if(typeof v!=="string"||v.length>max||(required&&!v.trim()))fail("Invalid or missing catalog field.");return v.trim();};
const number=(v,min,max)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max&&Math.abs(v*100-Math.round(v*100))<0.000001;
export const CD_PROFILE="cd-slim";
export function profileRecord(input){
 if(!input||!validId(input.id))fail("Use a lowercase profile ID with letters, digits and hyphens.");
 const p={id:input.id,name:str(input.name,100),verified:input.verified===true,maxUnits:input.maxUnits};
 if(!integer(p.maxUnits,1,20))fail("Maximum package quantity must be 1–20.");
 for(const k of ["length","width","baseHeight","discHeight","baseWeight","discWeight"]){
  if(!number(input[k],0.01,100))fail("Enter positive package measurements, up to two decimal places.");
  p[k]=input[k];
 }
 for(const k of ["packagingCents","insuranceCents","trackingCents"]){
  if(!integer(input[k],0,5000))fail("Invalid per-package fee.");p[k]=input[k];
 }
 return p;
}
export function productRecord(input){
 if(!input||!validId(input.id)||!validId(input.profileId))fail("Invalid product or profile ID.");
 const p={id:input.id,name:str(input.name,140),category:str(input.category,60),description:str(input.description||"",2000,false),coverUrl:str(input.coverUrl||"",1500,false),priceCents:input.priceCents,profileId:input.profileId,taxCode:str(input.taxCode,30),enabled:input.enabled===true,featured:input.featured===true,originCountry:str(input.originCountry||"",2,false).toUpperCase(),tariffNumber:str(input.tariffNumber||"",10,false),customsDescription:str(input.customsDescription||"",100,false),unitWeight:input.unitWeight??null};
 if(!integer(p.priceCents,50,100000)||!/^txcd_\d+$/.test(p.taxCode))fail("Price must be $0.50–$1,000 and Stripe tax code must be valid format.");
 if(p.coverUrl&&!/^https:\/\//i.test(p.coverUrl))fail("Image URL must use HTTPS.");
 if(p.originCountry||p.tariffNumber||p.customsDescription||p.unitWeight!==null){
  if(!/^[A-Z]{2}$/.test(p.originCountry)||!/^\d{6,10}$/.test(p.tariffNumber)||!p.customsDescription||!number(p.unitWeight,0.01,100))fail("Complete all customs fields, or leave all blank for domestic-only products.");
 }
 return p;
}
export function publicProduct(p){
 return {id:p.id,sku:"merch:"+p.id,kind:"merch",name:p.name,albumId:"merch:"+p.id,albumName:p.name,volume:1,category:p.category,description:p.description,coverUrl:p.coverUrl,priceCents:p.priceCents,featured:p.featured,songIds:[],profileId:p.profileId};
}
export async function readProfile(env,id){
 const row=await env.ORDERS.prepare("SELECT payload FROM shipping_profiles WHERE id=?").bind(id).first();
 return row?profileRecord(JSON.parse(row.payload)):null;
}
export async function readProduct(env,id){
 const row=await env.ORDERS.prepare("SELECT payload FROM merchandise_products WHERE id=?").bind(id).first();
 return row?productRecord(JSON.parse(row.payload)):null;
}
export async function defaultProfile(env){
 const saved=await readProfile(env,CD_PROFILE);
 if(saved)return saved;
 let pack;try{pack=JSON.parse(env.SHIPPO_PACKAGE_JSON||"");}catch{fail("Default CD shipping profile unavailable.",503);}
 return profileRecord({...pack,id:CD_PROFILE,name:"Slim jewel case",maxUnits:20,verified:env.SHIPPO_PACKAGING_VERIFIED==="yes"});
}
export async function catalog(env,admin=false){
 const [products,profiles]=await Promise.all([
  env.ORDERS.prepare("SELECT payload FROM merchandise_products ORDER BY id LIMIT 500").all(),
  env.ORDERS.prepare("SELECT payload FROM shipping_profiles ORDER BY id LIMIT 200").all()
 ]);
 const list=(products.results||[]).map(r=>productRecord(JSON.parse(r.payload)));
 const packs=(profiles.results||[]).map(r=>profileRecord(JSON.parse(r.payload)));
 if(!packs.some(p=>p.id===CD_PROFILE))packs.unshift(await defaultProfile(env));
 if(admin)return {mode:env.STORE_MODE,products:list,profiles:packs};
 const available=new Map(packs.map(p=>[p.id,p]));
 return {mode:env.STORE_MODE,products:env.SHIPPO_ENABLED==="yes"?list.filter(p=>p.enabled&&available.has(p.profileId)&&(env.STORE_MODE!=="live"||available.get(p.profileId).verified)).map(publicProduct):[]};
}
export async function saveCatalog(env,b){
 if(b.action==="save-profile"){
  const p=profileRecord(b.profile);
  await env.ORDERS.prepare("INSERT INTO shipping_profiles(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").bind(p.id,JSON.stringify(p)).run();
 }else if(b.action==="save-product"){
  const p=productRecord(b.product);
  const profile=p.profileId===CD_PROFILE?await defaultProfile(env):await readProfile(env,p.profileId);
  if(!profile)fail("Create the selected shipping profile first.");
  if(env.STORE_MODE==="live"&&p.enabled&&!profile.verified)fail("Verify the package profile before publishing a live product.");
  await env.ORDERS.prepare("INSERT INTO merchandise_products(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").bind(p.id,JSON.stringify(p)).run();
 }else if(b.action!=="list")fail("Unknown catalog action.");
 return catalog(env,true);
}
export async function packFor(env,lines,count){
 const ids=[...new Set(lines.map(l=>l.profileId||CD_PROFILE))];
 if(ids.length!==1)fail("These products need different packaging. Please place a separate order for each shipping profile.",409);
 const p=ids[0]===CD_PROFILE?await defaultProfile(env):await readProfile(env,ids[0]);
 if(!p)fail("Shipping profile no longer available.",409);
 if(count>p.maxUnits)fail("This package supports at most "+p.maxUnits+" items. Split the order.",409);
 if(env.STORE_MODE==="live"&&!p.verified){
  // Explicit merchant opt-in for domestic CDs only, never unverified merchandise.
  if(env.SHIPPO_ALLOW_ESTIMATED_CD_PACKAGING!=="yes"||env.SHIPPO_COUNTRIES!=="US"||p.id!==CD_PROFILE||!lines.every(l=>l.kind==="cd"))fail("This product's packaging has not been verified.",503);
 }
 return p;
}
