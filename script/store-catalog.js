// Shared CD catalog schema, stored in albums/{albumId}.store.
export const MAX_VOLUMES=20;
export const DEFAULT_PRICE=1000;
export const DEFAULT_CATEGORY="Albums";
export function cdCategory(value){
 const cleaned=typeof value==="string"?value.trim().replace(/\s+/g," "):"";
 return cleaned.slice(0,60)||DEFAULT_CATEGORY;
}
export const categoryKey=value=>cdCategory(value).toLowerCase();
export function categoryOptions(items){
 const names=new Map();
 for(const p of items){const name=cdCategory(p.category),key=categoryKey(name);if(!names.has(key))names.set(key,name);}
 return [...names].sort((a,b)=>a[1].localeCompare(b[1]));
}
export function filterCDs(items,category="",albumId=""){
 return items.filter(p=>(!category||categoryKey(p.category)===category)&&(!albumId||p.albumId===albumId));
}
export const money=cents=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
export function storeProducts(albumId,data){
 const store=data?.store;
 if(store?.sellable!==true||!Array.isArray(store.volumes)||store.volumes.length<1||store.volumes.length>MAX_VOLUMES)return [];
 return store.volumes.flatMap((v,i)=>{
  if(!Number.isInteger(v.priceCents)||v.priceCents<50||v.priceCents>100000||typeof v.name!=="string"||!Array.isArray(v.songIds)||!v.songIds.length||v.songIds.length>380)return [];
  return [{albumId,volume:i+1,sku:albumId+":"+(i+1),albumName:String(data.name||albumId),name:store.volumes.length===1?String(data.name||albumId):String(data.name||albumId)+" · "+(v.name||"Volume "+(i+1)),priceCents:v.priceCents,category:cdCategory(v.category),featured:v.featured===true,songIds:v.songIds.map(String),coverUrl:String(data.coverUrl||""),description:String(data.description||"")}];
 });
}
