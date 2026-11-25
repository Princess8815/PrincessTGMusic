
import {accessToken,verifyFirebaseIdentity} from "./rewards.js";
import {validId,validPrice,purchaseCheck,BUILTIN_TYPES} from "../../script/starlight-model.mjs";
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const fields=data=>Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==="string"?{stringValue:v}:typeof v==="boolean"?{booleanValue:v}:{integerValue:String(v)}]));
const decode=d=>d?Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,"integerValue" in v?Number(v.integerValue):v.stringValue??v.booleanValue])):null;
export function starlightOrigin(env,origin){
 if(env.STORE_MODE!=="live"||typeof origin!=="string")return false;
 if(/^http:\/\/(localhost|127\.0\.0\.1)(?::[0-9]{1,5})?$/.test(origin))return true;
 const host=env.STARLIGHT_PREVIEW_HOST,suffix="."+host,h=origin.slice(8);
 return !!host&&origin.startsWith("https://")&&h.endsWith(suffix)&&/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(h.slice(0,-suffix.length));
}
export async function purchaseWithStorage({read,commit,root,uid,itemId,expectedPrice}){
 const userPath="users/"+uid,itemPath="starlightItems/"+itemId,walletPath=userPath+"/wallets/starCoins",ownedPath=userPath+"/starlightCollectibles/"+itemId;
 const verify=(path,d)=>({verify:root+"/"+path,currentDocument:{updateTime:d.updateTime}});
 for(let n=0;n<5;n++){
  const [account,item,wallet,owned]=await Promise.all([read(userPath),read(itemPath),read(walletPath),read(ownedPath)]);
  const data=decode(item),result=purchaseCheck({account:decode(account),item:data,wallet:decode(wallet),owned:!!owned,expectedPrice});
  if(result.alreadyOwned)return result;
  if(!account?.updateTime||!wallet?.updateTime||!item?.updateTime)fail("Purchase records unavailable.",503);
  const writes=[verify(userPath,account),verify(itemPath,item),
   {update:{name:root+"/"+walletPath,fields:fields({currency:"starCoins",balance:result.balance})},updateMask:{fieldPaths:["currency","balance"]},currentDocument:{updateTime:wallet.updateTime}},
   {update:{name:root+"/"+ownedPath,fields:{...fields({itemId,name:data.name,typeId:data.typeId,image:data.image,pricePaid:data.price,source:"starlight-store"}),foundAt:{timestampValue:new Date().toISOString()}}},currentDocument:{exists:false}}];
  if(!BUILTIN_TYPES.some(t=>t.id===data.typeId)){const path="starlightTypes/"+data.typeId,category=await read(path);if(!category?.updateTime)fail("Collection type unavailable.",409);writes.push(verify(path,category));}
  if(await commit(writes))return result;
 }
 fail("Store changed during purchase. Refresh and retry.",409);
}
export async function buyStarlight(env,input){
 if(env.STORE_MODE!=="live"||!env.FIREBASE_PROJECT||env.REWARD_FIREBASE_PROJECT!==env.FIREBASE_PROJECT)fail("Starlight Store is not configured.",503);
 if(!input||!validId(input.itemId)||!validPrice(input.expectedPrice)||Object.keys(input).some(k=>!["idToken","itemId","expectedPrice"].includes(k)))fail("Invalid purchase request.");
 const uid=await verifyFirebaseIdentity(env.FIREBASE_PROJECT,input.idToken,true),token=await accessToken(env,env.FIREBASE_PROJECT);
 const root="projects/"+env.FIREBASE_PROJECT+"/databases/(default)/documents",url="https://firestore.googleapis.com/v1/"+root,headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 const read=async path=>{const r=await fetch(url+"/"+path.split("/").map(encodeURIComponent).join("/"),{headers});if(r.status===404)return null;if(!r.ok)fail("Store records unavailable.",503);return r.json();};
 const commit=async writes=>{const r=await fetch(url+":commit",{method:"POST",headers,body:JSON.stringify({writes})});if(r.ok)return true;const err=await r.json().catch(()=>({}));if([409,412].includes(r.status)||["ABORTED","FAILED_PRECONDITION","ALREADY_EXISTS"].includes(err.error?.status))return false;fail("Purchase not confirmed. Retry to check ownership.",503);};
 return purchaseWithStorage({read,commit,root,uid,itemId:input.itemId,expectedPrice:input.expectedPrice});
}
