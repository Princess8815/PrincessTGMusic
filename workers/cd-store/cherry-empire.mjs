
import {accessToken,verifyFirebaseIdentity} from "./rewards.js";
import {initialEmpire,applyAction,binomial,rewardCandidates,hasMastery,CHERRY_TROPHY} from "../../script/cherry-empire-core.mjs";
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const str=v=>({stringValue:v}),integer=v=>({integerValue:String(v)});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function secureRandom(){
 // Strictly between zero and one, so logarithmic samplers remain finite.
 return (crypto.getRandomValues(new Uint32Array(1))[0]+.5)/4294967296;
}
function validate(input){
 if(!input||!uuid.test(input.requestId||"")||!["sync","buyTree","harvestAll","harvest","upgrade","prestige"].includes(input.kind))fail("Invalid orchard action.");
 if(input.kind!=="sync"&&(!Number.isSafeInteger(input.revision)||input.revision<0))fail("Refresh your orchard first.");
 if(["harvest","upgrade","prestige"].includes(input.kind)&&(!Number.isInteger(input.treeId)||input.treeId<1||input.treeId>12))fail("Invalid tree.");
 if(input.kind==="upgrade"&&!["speed","yield","auto","capacity","star","starMultiplier"].includes(input.upgrade))fail("Invalid upgrade.");
}
export async function orchardWithStorage({read,commit,root,uid,input,clock=Date.now,rng=secureRandom}){
 validate(input);
 const user="users/"+uid,path=user+"/privateGames/cherryEmpire";
 for(let attempt=0;attempt<5;attempt++){
  const [account,stored]=await Promise.all([read(user),read(path)]);
  if(!account?.updateTime||(account.fields?.status?.stringValue||"active")!=="active"||account.fields?.role?.stringValue==="banned")fail("An active verified account is required.",403);
  const record=stored?JSON.parse(stored.fields.payload.stringValue):null,now=clock();
  if(record?.lastRequest===input.requestId)return {...record.response,serverNow:now};
  const state=record?.state||initialEmpire(now);
  if(input.kind!=="sync"&&input.revision!==state.revision)return {state,serverNow:now,conflict:true,message:"Your orchard changed in another tab. Review the updated state and try again.",rewards:[],effects:{cherries:0,coins:0,harvests:0},applied:false};
  const result=applyAction(state,input,now,(n,p)=>binomial(n,p,rng));
  const next=result.state,fx=result.effects,rewards=[];
  for(const id of rewardCandidates(fx,rng)){
   if(!await read(user+"/axolotls/"+id))rewards.push(id);
  }
  const trophyPath=user+"/trophies/"+CHERRY_TROPHY[0];
  if(hasMastery(next)&&!next.masteryAwarded){
   if(!await read(trophyPath))rewards.push(CHERRY_TROPHY[0]);
   next.masteryAwarded=true;
  }
  next.revision=state.revision+1;
  const response={state:next,serverNow:now,effects:fx,rewards,message:result.message,applied:result.applied};
  const saved={state:next,lastRequest:input.requestId,response};
  const writes=[
   {verify:root+"/"+user,currentDocument:{updateTime:account.updateTime}},
   {update:{name:root+"/"+path,fields:{payload:str(JSON.stringify(saved))}},currentDocument:stored?{updateTime:stored.updateTime}:{exists:false}}
  ];
  if(fx.coins)writes.push({update:{name:root+"/"+user+"/wallets/starCoins",fields:{currency:str("starCoins")}},updateMask:{fieldPaths:["currency"]},updateTransforms:[{fieldPath:"balance",increment:integer(fx.coins)}]});
  for(const id of rewards)writes.push({update:{name:root+"/"+user+"/"+(id===CHERRY_TROPHY[0]?"trophies":"axolotls")+"/"+id,fields:{foundAt:{timestampValue:new Date(now).toISOString()},source:str("cherry-empire")}},currentDocument:{exists:false}});
  if(await commit(writes))return response;
 }
 fail("Orchard changed while saving. Retry to refresh.",409);
}
export async function playCherryEmpire(env,input){
 if(env.STORE_MODE!=="live"||!env.FIREBASE_PROJECT||env.REWARD_FIREBASE_PROJECT!==env.FIREBASE_PROJECT)fail("Cherry Empire service is not configured.",503);
 validate(input);
 const uid=await verifyFirebaseIdentity(env.FIREBASE_PROJECT,input.idToken,true),token=await accessToken(env,env.FIREBASE_PROJECT);
 const root="projects/"+env.FIREBASE_PROJECT+"/databases/(default)/documents",url="https://firestore.googleapis.com/v1/"+root,headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 const read=async p=>{const r=await fetch(url+"/"+p.split("/").map(encodeURIComponent).join("/"),{headers});if(r.status===404)return null;if(!r.ok)fail("Orchard storage unavailable.",503);return r.json();};
 const commit=async writes=>{const r=await fetch(url+":commit",{method:"POST",headers,body:JSON.stringify({writes})});if(r.ok)return true;const e=await r.json().catch(()=>({}));if([409,412].includes(r.status)||["ABORTED","FAILED_PRECONDITION","ALREADY_EXISTS"].includes(e.error?.status))return false;fail("Orchard save not confirmed. Retry to recover your progress.",503);};
 return orchardWithStorage({read,commit,root,uid,input});
}
