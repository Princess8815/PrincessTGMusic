
import {accessToken,verifyFirebaseIdentity} from "./rewards.js";
import {initialOrange,applyOrange,PRICE,SPECIALS,validShot,ORANGE_TROPHY,hasOrangeMastery,validateDesign,checkDesignUnlocks,validateMilestones,designMap,campaignMap,boardFromMap} from "../../script/orange-knock-down-core.mjs";
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const secureRandom=()=>(crypto.getRandomValues(new Uint32Array(1))[0]+.5)/4294967296;
const str=v=>({stringValue:v}),integer=v=>({integerValue:String(v)});
export async function configuredOrangeLevel(read,state){
 const [config,official]=await Promise.all([read("orangeConfig/milestones"),read("orangeOfficialLevels/"+state.level)]);
 const milestones=config?validateMilestones(JSON.parse(config.fields.payload.stringValue)):null;
 state.milestones=milestones;
 let map;
 if(official){try{const d=checkDesignUnlocks(validateDesign(JSON.parse(official.fields.payload.stringValue)),state.level,milestones);map=designMap(d);}catch(e){console.warn("Official orange level incompatible with milestones",state.level);}}
 state.levelMap=map||campaignMap(state.level,state.seed,milestones);
 state.board=boardFromMap(state.levelMap);
 return state;
}
export async function orangeWithStorage({read,commit,root,uid,input,clock=Date.now,rng=secureRandom,seed=()=>crypto.getRandomValues(new Uint32Array(1))[0],configure=null}){
 if(!input||!["state","shot","buy","retry","next"].includes(input.kind))fail("Invalid game action.");
 if(input.kind!=="state"&&(!uuid.test(input.requestId||"")||!Number.isSafeInteger(input.revision)||input.revision<0))fail("Refresh your game first.");
 if(input.kind==="shot"&&!validShot(input.shot))fail("Invalid shot.");
 if(input.kind==="buy"&&!SPECIALS.includes(input.type))fail("Invalid power-up.");
 const user="users/"+uid,path=user+"/privateGames/orangeKnockDown",wp=user+"/wallets/starCoins";
 for(let attempt=0;attempt<5;attempt++){
  const [account,stored,walletDoc]=await Promise.all([read(user),read(path),read(wp)]);
  if(!account?.updateTime||(account.fields?.status?.stringValue||"active")!=="active"||account.fields?.role?.stringValue==="banned")fail("An active verified account is required.",403);
  const record=stored?JSON.parse(stored.fields.payload.stringValue):null,wallet=Number(walletDoc?.fields?.balance?.integerValue||0);
  if(!Number.isSafeInteger(wallet)||wallet<0)fail("Wallet unavailable.",503);
  if(record&&input.kind==="state"){
   // Backfill an existing qualifying account without changing its revision or
   // overwriting the last action response used for idempotent retries.
   const dest=user+"/trophies/"+ORANGE_TROPHY[0];
   const response={state:record.state,wallet,rewards:[],coins:0,message:"Ready."};
   if(!hasOrangeMastery(record.state)||record.state.level1000TrophyAwarded||await read(dest))return response;
   if(await commit([{verify:root+"/"+user,currentDocument:{updateTime:account.updateTime}},{verify:root+"/"+path,currentDocument:{updateTime:stored.updateTime}},{update:{name:root+"/"+dest,fields:{source:str("orange-knock-down"),foundAt:{timestampValue:new Date(clock()).toISOString()}}},currentDocument:{exists:false}}]))return {...response,rewards:[ORANGE_TROPHY[0]]};
   continue;
  }
  if(record&&record.lastRequest===input.requestId)return {...record.response,wallet};
  const state=record?.state||initialOrange(seed());
  if(!record&&configure)await configure(read,state);
  if(input.kind!=="state"&&!record)fail("Load the game first.",409);
  if(input.kind!=="state"&&input.revision!==state.revision)return {state,wallet,conflict:true,applied:false,rewards:[],coins:0,message:"Game changed in another tab. Review the board."};
  const result=input.kind==="state"?{state,applied:true,message:"Ready.",coins:0,rewards:[]}:input.kind==="buy"&&wallet<PRICE?{state,applied:false,message:"Not enough Star Coins.",coins:0,rewards:[]}:applyOrange(state,input,rng);
  if(!result.applied)return {...result,wallet};
  const next=result.state,rewards=[];
  if(input.kind==="next"&&configure)await configure(read,next);
  if(input.kind!=="state")next.revision=state.revision+1;
  for(const id of result.rewards)if(!await read(user+"/axolotls/"+id))rewards.push(id);
  if(hasOrangeMastery(next)&&!next.level1000TrophyAwarded){
   if(!await read(user+"/trophies/"+ORANGE_TROPHY[0]))rewards.push(ORANGE_TROPHY[0]);
   next.level1000TrophyAwarded=true;
  }
  const balance=wallet+result.coins;if(!Number.isSafeInteger(balance)||balance<0)fail("Wallet unavailable.",409);
  const response={state:next,wallet:balance,applied:true,message:result.message,coins:result.coins,rewards};
  const writes=[{verify:root+"/"+user,currentDocument:{updateTime:account.updateTime}},
   {update:{name:root+"/"+path,fields:{payload:str(JSON.stringify({state:next,lastRequest:input.requestId||null,response}))}},currentDocument:stored?{updateTime:stored.updateTime}:{exists:false}}];
  if(result.coins)writes.push({update:{name:root+"/"+wp,fields:{currency:str("starCoins"),balance:integer(balance)}},updateMask:{fieldPaths:["currency","balance"]},currentDocument:walletDoc?{updateTime:walletDoc.updateTime}:{exists:false}});
  for(const id of rewards)writes.push({update:{name:root+"/"+user+"/"+(id===ORANGE_TROPHY[0]?"trophies":"axolotls")+"/"+id,fields:{source:str("orange-knock-down"),foundAt:{timestampValue:new Date(clock()).toISOString()}}},currentDocument:{exists:false}});
  if(await commit(writes))return response;
 }
 fail("Game changed while saving. Retry.",409);
}
export async function playOrangeKnockDown(env,input){
 if(env.STORE_MODE!=="live"||!env.FIREBASE_PROJECT||env.REWARD_FIREBASE_PROJECT!==env.FIREBASE_PROJECT)fail("Orange Knock Down service unavailable.",503);
 const uid=await verifyFirebaseIdentity(env.FIREBASE_PROJECT,input?.idToken,true),token=await accessToken(env,env.FIREBASE_PROJECT);
 const root="projects/"+env.FIREBASE_PROJECT+"/databases/(default)/documents",url="https://firestore.googleapis.com/v1/"+root,headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 const read=async p=>{const r=await fetch(url+"/"+p.split("/").map(encodeURIComponent).join("/"),{headers});if(r.status===404)return null;if(!r.ok)fail("Game storage unavailable.",503);return r.json();};
 const commit=async writes=>{const r=await fetch(url+":commit",{method:"POST",headers,body:JSON.stringify({writes})});if(r.ok)return true;const e=await r.json().catch(()=>({}));if([409,412].includes(r.status)||["ABORTED","FAILED_PRECONDITION","ALREADY_EXISTS"].includes(e.error?.status))return false;fail("Game save not confirmed. Retry to recover your result.",503);};
 return orangeWithStorage({read,commit,root,uid,input,configure:configuredOrangeLevel});
}
