import {gameCoinAward} from "./game-coin-rewards.mjs";

import {accessToken,verifyFirebaseIdentity} from "./rewards.js";
import {ROUND_MS,replayPeaches,peachRewards,PEACH_TROPHY} from "../../script/peach-panic-core.mjs";
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const secureRandom=()=>(crypto.getRandomValues(new Uint32Array(1))[0]+.5)/4294967296;
const str=v=>({stringValue:v});
const present=(run,now)=>run?{...run,serverNow:now}:{best:0,serverNow:now,closed:true};
export async function peachWithStorage({read,commit,root,uid,input,clock=Date.now,rng=secureRandom,seed=()=>crypto.getRandomValues(new Uint32Array(1))[0]}){
 if(!input||!["start","state","finish"].includes(input.action)||input.action!=="state"&&!uuid.test(input.runId||""))fail("Invalid Peach Panic request.");
 const user="users/"+uid,path=user+"/privateGames/peachPanic";
 for(let attempt=0;attempt<5;attempt++){
  const [account,stored]=await Promise.all([read(user),read(path)]);
  if(!account?.updateTime||(account.fields?.status?.stringValue||"active")!=="active"||account.fields?.role?.stringValue==="banned")fail("An active verified account is required.",403);
  const previous=stored?JSON.parse(stored.fields.payload.stringValue):null,now=clock();
  if(input.action==="state")return present(previous,now);
  let run,checks=[];
  if(input.action==="start"){
   if(previous?.runId===input.runId)return present(previous,now);
   if(previous&&!previous.closed&&now<previous.startAt+ROUND_MS)fail("A round is already running. Refresh to resume.",409);
   run={runId:input.runId,seed:seed()>>>0||1,startAt:now+1000,best:previous?.best||0,closed:false,result:null,rewards:[]};
  }else{
   if(!previous||previous.runId!==input.runId)fail("This round was replaced. Refresh the game.",409);
   if(previous.closed)return present(previous,now);
   if(now<previous.startAt+ROUND_MS)fail("The 30-second round is still running. Retry after it ends.",409);
   let result;try{result=replayPeaches(previous.seed,input.picks);}catch(e){fail(e.message);}
   const rewards=[];
   for(const id of peachRewards(result,rng)){
    const dest=user+"/"+(id===PEACH_TROPHY[0]?"trophies":"axolotls")+"/"+id;
    if(!await read(dest))rewards.push(id);
   }
   const award=await gameCoinAward({read,root,uid,account,coins:result.coins,clock});result.coins=award.coins;checks=award.checks;
   run={...previous,closed:true,best:Math.max(previous.best,result.score),result,rewards};
  }
  const writes=[{verify:root+"/"+user,currentDocument:{updateTime:account.updateTime}},
   {update:{name:root+"/"+path,fields:{payload:str(JSON.stringify(run))}},currentDocument:stored?{updateTime:stored.updateTime}:{exists:false}}];
  writes.push(...checks);
  // The verified round result and whole-coin wallet increment are committed
  // together. A closed run returns before this write, including on retries.
  if(run.closed&&run.result.coins>0)writes.push({update:{name:root+"/"+user+"/wallets/starCoins",fields:{currency:str("starCoins")}},updateMask:{fieldPaths:["currency"]},updateTransforms:[{fieldPath:"balance",increment:{integerValue:String(run.result.coins)}}]});
  for(const id of run.rewards){
   const dest=user+"/"+(id===PEACH_TROPHY[0]?"trophies":"axolotls")+"/"+id;
   writes.push({update:{name:root+"/"+dest,fields:{source:str("peach-panic"),foundAt:{timestampValue:new Date(now).toISOString()}}},currentDocument:{exists:false}});
  }
  if(await commit(writes))return present(run,clock());
 }
 fail("Your game changed in another tab. Retry.",409);
}
export async function playPeachPanic(env,input){
 if(env.STORE_MODE!=="live"||!env.FIREBASE_PROJECT||env.REWARD_FIREBASE_PROJECT!==env.FIREBASE_PROJECT)fail("Peach Panic service unavailable.",503);
 const uid=await verifyFirebaseIdentity(env.FIREBASE_PROJECT,input?.idToken,true),token=await accessToken(env,env.FIREBASE_PROJECT);
 const root="projects/"+env.FIREBASE_PROJECT+"/databases/(default)/documents",url="https://firestore.googleapis.com/v1/"+root,headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 const read=async p=>{const res=await fetch(url+"/"+p.split("/").map(encodeURIComponent).join("/"),{headers});if(res.status===404)return null;if(!res.ok)fail("Game storage unavailable.",503);return res.json();};
 const commit=async writes=>{const res=await fetch(url+":commit",{method:"POST",headers,body:JSON.stringify({writes})});if(res.ok)return true;const e=await res.json().catch(()=>({}));if([409,412].includes(res.status)||["ABORTED","FAILED_PRECONDITION","ALREADY_EXISTS"].includes(e.error?.status))return false;fail("Game save not confirmed. Retry to recover your result.",503);};
 return peachWithStorage({read,commit,root,uid,input});
}
