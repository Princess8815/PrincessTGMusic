import {gameCoinAward} from "./game-coin-rewards.mjs";

import {accessToken,verifyFirebaseIdentity} from "./rewards.js";
import {initialState,begin,guess,abandon,publicState,DIFFICULTIES} from "./hanggirl-core.mjs";
import {chooseWord} from "./hanggirl-words.mjs";
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const encode=v=>v===null?{nullValue:null}:typeof v==="string"?{stringValue:v}:typeof v==="boolean"?{booleanValue:v}:Number.isSafeInteger(v)?{integerValue:String(v)}:Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:{mapValue:{fields:fields(v)}};
const fields=v=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]));
const decode=v=>v?.mapValue?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):v?.arrayValue?(v.arrayValue.values||[]).map(decode):v&&"integerValue"in v?Number(v.integerValue):v&&"nullValue"in v?null:v?.stringValue??v?.booleanValue;
const unpack=doc=>doc?decode({mapValue:{fields:doc.fields}}):null;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Only the live game service can change real balances, including from approved previews.
export async function playHanggirl(env,input,preview=false){
 if(env.STORE_MODE!=="live"||!env.FIREBASE_PROJECT||env.REWARD_FIREBASE_PROJECT!==env.FIREBASE_PROJECT)fail("Hanggirl reward service is not configured.",503);
 if(!input||!["state","start","guess","abandon"].includes(input.action))fail("Unknown game action.");
 const {action,roundId,letter,difficulty}=input;
 if(action!=="state"&&!uuid.test(roundId||""))fail("Invalid round ID.");
 if(action==="start"&&!DIFFICULTIES.includes(difficulty))fail("Choose a difficulty.");
 if(action==="guess"&&(typeof letter!=="string"||!/^[a-z]$/.test(letter)))fail("Guess a single letter.");
 const uid=await verifyFirebaseIdentity(env.FIREBASE_PROJECT,input.idToken,true);
 const token=await accessToken(env,env.FIREBASE_PROJECT);
 const root="projects/"+env.FIREBASE_PROJECT+"/databases/(default)/documents";
 const origin="https://firestore.googleapis.com/v1/"+root;
 const headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 const accountPath="users/"+encodeURIComponent(uid),statePath=accountPath+"/privateGames/hanggirl";
 const read=async path=>{
  const r=await fetch(origin+"/"+path,{headers});
  if(r.status===404)return null;
  if(!r.ok)fail("Game storage unavailable. Try again.",503);
  return r.json();
 };
 for(let attempt=0;attempt<4;attempt++){
  const account=await read(accountPath);
  if(!account||!account.updateTime||(account.fields?.status?.stringValue||"active")!=="active")fail("An active verified account is required.",403);
  const stored=await read(statePath),state=unpack(stored)||initialState();
  if(action==="state")return publicState(state);
  let next=state;
  if(action==="start"){
   if(state.round?.id===roundId||state.round?.status==="playing")return publicState(state);
   next=begin(state,difficulty,await chooseWord(difficulty,state.recent,env),roundId);
  }else{
   if(!state.round||state.round.id!==roundId)return publicState(state);
   next=action==="guess"?guess(state,letter):abandon(state);
  }
  if(next===state)return publicState(state);
  const writes=[
   {update:{name:root+"/"+statePath,fields:fields(next)},currentDocument:stored?{updateTime:stored.updateTime}:{exists:false}},
   {update:{name:root+"/"+accountPath,fields:{}},updateMask:{fieldPaths:[]},currentDocument:{updateTime:account.updateTime}}
  ];
  if(next.round.status==="won"&&state.round.status==="playing"){
   const award=await gameCoinAward({read,root,uid,account,coins:next.round.awarded,preview});
   next.round.awarded=award.coins;writes.push(...award.checks);
   writes.push({update:{name:root+"/"+accountPath+"/wallets/starCoins",fields:fields({currency:"starCoins"})},updateMask:{fieldPaths:["currency"]},updateTransforms:[{fieldPath:"balance",increment:{integerValue:String(next.round.awarded)}}]});
   for(const item of next.round.unlocks){
    const path=accountPath+"/"+item.type+"/"+item.id;
    // Do not overwrite an existing discovery, including concurrent writes.
    if(!await read(path))writes.push({update:{name:root+"/"+path,fields:{foundAt:{timestampValue:new Date().toISOString()},source:{stringValue:"hanggirl"}}},currentDocument:{exists:false}});
   }
  }
  const result=await fetch(origin+":commit",{method:"POST",headers,body:JSON.stringify({writes})});
  if(result.ok)return publicState(next);
  if([409,412].includes(result.status))continue;
  // Firestore can report a failed precondition as HTTP 400.
  const error=await result.json().catch(()=>({}));
  if(["ABORTED","FAILED_PRECONDITION","ALREADY_EXISTS"].includes(error.error?.status))continue;
  fail("Game save failed. Your reward has not been confirmed; retry.",503);
 }
 fail("Game changed in another tab. Retry to refresh.",409);
}

 // Additional origins apply only to Hanggirl, never checkout.
export function hanggirlOrigin(env,origin){
 if(env.STORE_MODE!=="live"||typeof origin!=="string")return false;
 if(/^http:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?$/.test(origin))return true;
 const host=env.HANGGIRL_PREVIEW_HOST;
 if(!host||!origin.startsWith("https://"))return false;
 const suffix="."+host;
 const hostname=origin.slice(8);
 return hostname.endsWith(suffix)&&/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(hostname.slice(0,-suffix.length));
}
