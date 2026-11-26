
import {accessToken,verifyFirebaseIdentity} from "./rewards.js";
import {initialGarden,gardenAction} from "../../script/giving-tree-core.mjs";
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const str=v=>({stringValue:v}),integer=v=>({integerValue:String(v)});
const random=()=>(crypto.getRandomValues(new Uint32Array(1))[0]+.5)/4294967296;
function validate(input){
 if(!input||!uuid.test(input.requestId||"")||!["sync","plant","water","fertilize","cut","discard","discardMany","clearInventory","throw","upgradeInventory"].includes(input.kind))fail("Invalid garden action.");
 if(input.kind!=="sync"&&(!Number.isSafeInteger(input.revision)||input.revision<0))fail("Refresh your garden first.");
}
export async function gardenWithStorage({read,commit,root,uid,input,clock=Date.now,rng=random}){
 validate(input);const user="users/"+uid,path=user+"/privateGames/givingTree",walletPath=user+"/wallets/starCoins";
 for(let attempt=0;attempt<5;attempt++){
  const [account,stored,walletDoc]=await Promise.all([read(user),read(path),read(walletPath)]);
  if(!account?.updateTime||(account.fields?.status?.stringValue||"active")!=="active"||account.fields?.role?.stringValue==="banned")fail("An active verified account is required.",403);
  const record=stored?JSON.parse(stored.fields.payload.stringValue):null,now=clock(),wallet=Number(walletDoc?.fields?.balance?.integerValue||0);
  if(!Number.isSafeInteger(wallet)||wallet<0)fail("Wallet unavailable.",503);
  if(record?.lastRequest===input.requestId)return {...record.response,serverNow:now,wallet};
  const state=record?.state||initialGarden(now);
  if(input.kind!=="sync"&&input.revision!==state.revision)return {state,serverNow:now,wallet,conflict:true,applied:false,message:"Your garden changed in another tab. Review it and retry.",effects:{coins:0,spent:0,fruits:0,enemies:0,bosses:0},rewards:[]};
  const result=gardenAction(state,input,now,wallet,rng),next=result.state,fx=result.effects,rewards=[];
  for(const id of fx.rewards)if(!await read(user+"/axolotls/"+id))rewards.push(id);
  next.revision=state.revision+1;
  const balance=wallet+fx.coins-fx.spent;
  if(!Number.isSafeInteger(balance)||balance<0)fail("Wallet balance exceeds the supported range.",409);
  const response={state:next,serverNow:now,wallet:balance,applied:result.applied,message:result.message,effects:{coins:fx.coins,spent:fx.spent,fruits:fx.fruits,enemies:fx.enemies,bosses:fx.bosses},rewards};
  const writes=[
   {verify:root+"/"+user,currentDocument:{updateTime:account.updateTime}},
   {update:{name:root+"/"+path,fields:{payload:str(JSON.stringify({state:next,lastRequest:input.requestId,response}))}},currentDocument:stored?{updateTime:stored.updateTime}:{exists:false}}
  ];
  if(fx.coins||fx.spent)writes.push({update:{name:root+"/"+walletPath,fields:{currency:str("starCoins"),balance:integer(balance)}},updateMask:{fieldPaths:["currency","balance"]},currentDocument:walletDoc?{updateTime:walletDoc.updateTime}:{exists:false}});
  for(const id of rewards)writes.push({update:{name:root+"/"+user+"/axolotls/"+id,fields:{source:str("giving-tree"),foundAt:{timestampValue:new Date(now).toISOString()}}},currentDocument:{exists:false}});
  if(await commit(writes))return response;
 }
 fail("Your garden changed while saving. Retry.",409);
}
export async function playGivingTree(env,input){
 if(env.STORE_MODE!=="live"||!env.FIREBASE_PROJECT||env.REWARD_FIREBASE_PROJECT!==env.FIREBASE_PROJECT)fail("The Giving Tree service unavailable.",503);
 validate(input);
 const uid=await verifyFirebaseIdentity(env.FIREBASE_PROJECT,input.idToken,true),token=await accessToken(env,env.FIREBASE_PROJECT);
 const root="projects/"+env.FIREBASE_PROJECT+"/databases/(default)/documents",url="https://firestore.googleapis.com/v1/"+root,headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 const read=async p=>{const r=await fetch(url+"/"+p.split("/").map(encodeURIComponent).join("/"),{headers});if(r.status===404)return null;if(!r.ok)fail("Garden storage unavailable.",503);return r.json();};
 const commit=async writes=>{const r=await fetch(url+":commit",{method:"POST",headers,body:JSON.stringify({writes})});if(r.ok)return true;const e=await r.json().catch(()=>({}));if([409,412].includes(r.status)||["ABORTED","FAILED_PRECONDITION","ALREADY_EXISTS"].includes(e.error?.status))return false;fail("Garden save not confirmed. Retry to recover your progress.",503);};
 return gardenWithStorage({read,commit,root,uid,input});
}
