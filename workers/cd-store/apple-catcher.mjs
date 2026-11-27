import {gameCoinAward} from "./game-coin-rewards.mjs";

import {accessToken,verifyFirebaseIdentity} from "./rewards.js";
import {newGame,replay,rollRewards,TICK_MS,MAX_BATCH} from "../../script/apple-catcher-core.mjs";
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const str=v=>({stringValue:v}),integer=v=>({integerValue:String(v)});
const randomInt=n=>{const max=Math.floor(4294967296/n)*n;let v;do{v=crypto.getRandomValues(new Uint32Array(1))[0];}while(v>=max);return v%n;};
function unpack(d){return d?JSON.parse(d.fields.payload.stringValue):null;}
const present=(run,rewards=[])=>({runId:run.id,state:run.game,best:run.best,credited:run.creditedCoins??run.game.score,rewards,closed:run.closed});
export async function playAppleCatcher(env,input,preview=false){
 if(env.STORE_MODE!=="live"||!env.FIREBASE_PROJECT||env.REWARD_FIREBASE_PROJECT!==env.FIREBASE_PROJECT)fail("Apple Catcher service unavailable.",503);
 if(!input||!["start","state","checkpoint","finish"].includes(input.action))fail("Invalid game action.");
 if(input.action!=="state"&&!idPattern.test(input.runId||""))fail("Invalid run.");
 const uid=await verifyFirebaseIdentity(env.FIREBASE_PROJECT,input.idToken,true);
 const token=await accessToken(env,env.FIREBASE_PROJECT);
 const root="projects/"+env.FIREBASE_PROJECT+"/databases/(default)/documents",url="https://firestore.googleapis.com/v1/"+root,headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 const user="users/"+encodeURIComponent(uid),path=user+"/privateGames/appleCatcher";
 const read=async p=>{const r=await fetch(url+"/"+p,{headers});if(r.status===404)return null;if(!r.ok)fail("Game storage unavailable.",503);return r.json();};
 const verify=(p,d)=>({update:{name:root+"/"+p,fields:{}},updateMask:{fieldPaths:[]},currentDocument:{updateTime:d.updateTime}});
 for(let attempt=0;attempt<5;attempt++){
  const [account,stored]=await Promise.all([read(user),read(path)]);
  if(!account?.updateTime||(account.fields?.status?.stringValue||"active")!=="active"||account.fields?.role?.stringValue==="banned")fail("An active verified account is required.",403);
  const prev=unpack(stored);
  if(input.action==="state")return prev?present(prev,prev.lastRewards||[]):null;
  let run,coins=0,rewards=[],checks=[];
  if(input.action==="start"){
   if(prev?.id===input.runId)return present(prev,prev.lastRewards||[]);
   // A new run replaces the old one; already committed coins remain.
   run={id:input.runId,game:newGame(crypto.getRandomValues(new Uint32Array(1))[0]),best:prev?.best||0,savedAt:Date.now(),closed:false,lastRewards:[],creditedCoins:0};
  }else{
   if(!prev||prev.id!==input.runId)fail("This run was replaced. Start a new game.",409);
   if(prev.closed||input.to<prev.game.tick||(input.to===prev.game.tick&&input.action!=="finish"))return present(prev,prev.lastRewards||[]);
   if(!Number.isInteger(input.to)||input.to-prev.game.tick>MAX_BATCH)fail("Invalid checkpoint.");
   if((input.to-prev.game.tick)*TICK_MS>Date.now()-prev.savedAt+1200)fail("Checkpoint arrived too soon. Retry.",409);
   let result;try{result=replay(prev.game,input.to,input.moves);}catch(e){fail(e.message);}
   const award=await gameCoinAward({read,root,uid,account,coins:result.catches.length,preview});coins=award.coins;checks=award.checks;
   const candidates=rollRewards(result.catches,randomInt);
   for(const id of candidates){
    const dest=user+"/"+(id==="apple-tree-basket"?"trophies":"axolotls")+"/"+id;
    if(!await read(dest))rewards.push(id);
   }
   run={...prev,game:result.state,best:Math.max(prev.best,result.state.score),savedAt:Date.now(),closed:result.state.done||input.action==="finish",lastRewards:rewards,creditedCoins:(prev.creditedCoins??prev.game.score)+coins};
  }
  const writes=[{update:{name:root+"/"+path,fields:{payload:str(JSON.stringify(run))}},currentDocument:stored?{updateTime:stored.updateTime}:{exists:false}},verify(user,account),...checks];
  if(coins)writes.push({update:{name:root+"/"+user+"/wallets/starCoins",fields:{currency:str("starCoins")}},updateMask:{fieldPaths:["currency"]},updateTransforms:[{fieldPath:"balance",increment:integer(coins)}]});
  for(const id of rewards){const dest=user+"/"+(id==="apple-tree-basket"?"trophies":"axolotls")+"/"+id;writes.push({update:{name:root+"/"+dest,fields:{foundAt:{timestampValue:new Date().toISOString()},source:str("apple-catcher")}},currentDocument:{exists:false}});}
  const result=await fetch(url+":commit",{method:"POST",headers,body:JSON.stringify({writes})});
  if(result.ok)return present(run,rewards);
  const err=await result.json().catch(()=>({}));
  if([409,412].includes(result.status)||["ABORTED","FAILED_PRECONDITION","ALREADY_EXISTS"].includes(err.error?.status))continue;
  fail("Game save not confirmed. Retry your checkpoint.",503);
 }
 fail("Game changed in another tab. Retry.",409);
}
