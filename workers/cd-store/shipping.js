// Quote-only Shippo integration; no label purchases.
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const int=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
const parse=(v,label)=>{try{return JSON.parse(v||"");}catch{fail(label+" not configured.",503);}};
const text=(v,max)=>typeof v==="string"&&v.trim()&&v.length<=max;
export const shippingEnabled=env=>env.SHIPPO_ENABLED==="yes";
export function settings(env){
 if(!shippingEnabled(env)||!["test","live"].includes(env.STORE_MODE)||!env.SHIPPO_API_KEY?.startsWith("shippo_"+env.STORE_MODE+"_"))fail("Carrier shipping not configured for this environment.",503);
 const countries=[...new Set((env.SHIPPO_COUNTRIES||"").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean))];
 if(!countries.length||countries.some(x=>!/^[A-Z]{2}$/.test(x)))fail("Shipping destinations not configured.",503);
 const origin=parse(env.SHIPPO_ORIGIN_JSON,"Shipping origin"),pack=parse(env.SHIPPO_PACKAGE_JSON,"Packaging");
 if(!origin||origin.country!=="US"||!["name","street1","city","state","zip","phone","email"].every(k=>text(origin[k],254)))fail("Complete private US shipping origin.",503);
 if(!pack||!["length","width","baseHeight","discHeight","baseWeight","discWeight"].every(k=>typeof pack[k]==="number"&&Number.isFinite(pack[k])&&pack[k]>0&&pack[k]<=100)||!["packagingCents","insuranceCents","trackingCents"].every(k=>int(pack[k],0,5000)))fail("Invalid packaging settings.",503);
 if(env.STORE_MODE==="live"&&env.SHIPPO_PACKAGING_VERIFIED!=="yes")fail("Verify actual packaging before live shipping.",503);
 let customs=null;
 if(countries.some(x=>x!=="US")){
  customs=parse(env.SHIPPO_CUSTOMS_JSON,"International customs");
  if(!customs||!/^[A-Z]{2}$/.test(customs.originCountry||"")||!/^\d{6,10}$/.test(customs.tariffNumber||"")||!text(customs.signer,120)||customs.approved!==true||!["DDU","DAP"].includes(customs.incoterm))fail("International customs require merchant approval.",503);
 }
 return {countries,origin,pack,customs};
}
export function parcelFor(p,count){
 if(!int(count,1,20))fail("Invalid package quantity.");
 const round=n=>String(Math.ceil(n*100-1e-8)/100);
 return {length:round(p.length),width:round(p.width),height:round(p.baseHeight+p.discHeight*count),distance_unit:"in",weight:round(p.baseWeight+p.discWeight*count),mass_unit:"oz"};
}
// US launch: only services eligible for free routine USPS pickup.
const pickupServices=new Set(["usps_ground_advantage","usps_priority"]);
const pickupRate=r=>r?.provider?.toUpperCase()==="USPS"&&pickupServices.has(r.servicelevel?.token);
export function shippingOptions(result,p,mode){
 if(!result||result.status!=="SUCCESS"||typeof result.object_id!=="string"||!Array.isArray(result.rates)||result.test!==(mode==="test"))fail("Carrier rates unavailable or wrong environment.",502);
 const seen=new Set(),fees=p.packagingCents+p.insuranceCents+p.trackingCents,options=[];
 for(const r of result.rates){
  if(!pickupRate(r)||!text(r.object_id,100)||seen.has(r.object_id)||r.currency!=="USD"||typeof r.amount!=="string"||!/^\d{1,5}(?:\.\d{1,2})?$/.test(r.amount)||!text(r.provider,100)||!text(r.servicelevel?.name,140))continue;
  const cents=Math.round(Number(r.amount)*100);if(!int(cents,1,1000000))continue;
  seen.add(r.object_id);options.push({id:r.object_id,carrier:r.provider,service:r.servicelevel.name,serviceToken:r.servicelevel.token,postageCents:cents,feesCents:fees,totalCents:cents+fees,days:int(r.estimated_days,0,365)?r.estimated_days:null});
 }
 if(!options.length)fail("No USPS Ground Advantage or Priority Mail rates available. Check address or contact the store.",422);
 return options.sort((a,b)=>a.totalCents-b.totalCents).slice(0,40);
}
export async function getRates(env,a,lines,count,fetcher=fetch,profile=null){
 const {countries,origin,pack:defaultPack,customs}=settings(env),pack=profile||defaultPack;
 if(!countries.includes(a.country))fail("We do not yet ship there.");
 const international=a.country!=="US";if(international&&!a.phone)fail("Recipient phone required for international shipping.");
 const parcel=parcelFor(pack,count);
 const body={address_from:origin,address_to:{name:a.name,street1:a.line1,street2:a.line2,city:a.city,state:a.state,zip:a.postal_code,country:a.country,phone:a.phone||undefined,email:a.email},parcels:[parcel],async:false};
 if(international)body.customs_declaration={certify:true,certify_signer:customs.signer,contents_type:"MERCHANDISE",non_delivery_option:"RETURN",incoterm:customs.incoterm,items:lines.map(l=>{const c=l.kind==="merch"?l.customs:{description:"Recorded music compact disc",originCountry:customs.originCountry,tariffNumber:customs.tariffNumber,unitWeight:pack.discWeight};if(!c?.description||!c.originCountry||!c.tariffNumber||!c.unitWeight)fail("A product is not approved for international shipping.",409);return {description:c.description,quantity:l.quantity,net_weight:String(c.unitWeight*l.quantity),mass_unit:"oz",value_amount:(l.priceCents*l.quantity/100).toFixed(2),value_currency:"USD",origin_country:c.originCountry,tariff_number:c.tariffNumber};})};
 const res=await fetcher("https://api.goshippo.com/shipments/",{method:"POST",headers:{Authorization:"ShippoToken "+env.SHIPPO_API_KEY,"Content-Type":"application/json"},body:JSON.stringify(body)});
 if(!res.ok)fail("Shipping carrier service unavailable. Check address or retry.",502);
 const result=await res.json();
 // Diagnostics contain counts only: never log carrier messages, addresses, credentials or shipment IDs.
 if(!Array.isArray(result.rates)||!result.rates.some(pickupRate))console.warn("USPS quote diagnostics",JSON.stringify({test:env.STORE_MODE==="test",returnedRates:Array.isArray(result.rates)?result.rates.length:0,uspsRates:Array.isArray(result.rates)?result.rates.filter(r=>r?.provider==="USPS").length:0,messageCount:Array.isArray(result.messages)?result.messages.length:0}));
 return {shipmentId:result.object_id,parcel,options:shippingOptions(result,pack,env.STORE_MODE),international};
}
export function selectedRate(saved,rateId,fingerprint,now=Date.now()){
 if(!saved||saved.expires<=now||saved.fingerprint!==fingerprint)fail("Shipping quote expired or address/cart changed. Request new rates.",409);
 const q=JSON.parse(saved.payload),rate=q.options.find(r=>r.id===rateId);if(!rate||rate.carrier!=="USPS"||!pickupServices.has(rate.serviceToken))fail("Request a new quote and select an eligible USPS service.",409);
 return {...rate,shipmentId:q.shipmentId,parcel:q.parcel,international:q.international};
}
