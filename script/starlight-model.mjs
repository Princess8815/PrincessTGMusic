
export const BUILTIN_TYPES=[{id:"axolotls",name:"Axolotls"},{id:"trophies",name:"Trophies"},{id:"cards",name:"Cards"}];
export const validId=x=>typeof x==="string"&&/^[a-z0-9-]{1,64}$/.test(x);
export const validName=x=>typeof x==="string"&&x.trim()===x&&x.length>=1&&x.length<=80;
export const validPrice=x=>Number.isSafeInteger(x)&&x>=1&&x<=100000000;
export const validImage=x=>typeof x==="string"&&x.length<=180000&&/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(x);
export function mergeTypes(rows){const m=new Map(BUILTIN_TYPES.map(t=>[t.id,t]));for(const t of rows)if(validId(t.id)&&validName(t.name)&&!m.has(t.id))m.set(t.id,t);return [...m.values()];}
export function purchaseCheck({account,item,wallet,owned,expectedPrice}){
 const fail=(message,status)=>{throw Object.assign(Error(message),{status});};
 if(!account||(account.status||"active")!=="active")fail("An active account is required.",403);
 if(owned)return {alreadyOwned:true,charged:0};
 if(!item||item.active!==true||!validName(item.name)||!validId(item.typeId)||item.typeId==="trophies"||!validPrice(item.price)||!validImage(item.image))fail("This collectible is unavailable.",404);
 if(item.price!==expectedPrice)fail("The price changed. Refresh the store.",409);
 const balance=wallet?.balance??0;
 if(!Number.isSafeInteger(balance)||balance<0)fail("Wallet balance unavailable.",503);
 if(balance<item.price)fail("Not enough Star Coins.",409);
 return {alreadyOwned:false,charged:item.price,balance:balance-item.price};
}
