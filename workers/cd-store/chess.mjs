import {accessToken,verifyFirebaseIdentity} from "./rewards.js";
import {initialChess,botMove,playChess,initialRatings,recordRated,newTournament,tournamentMatch,advanceTournament,chessUnlocks,validLevel,CHESS_TROPHY} from "../../script/chess-core.mjs";
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const str=stringValue=>({stringValue}),pre=d=>d?{updateTime:d.updateTime}:{exists:false};
const idOK=s=>typeof s==="string"&&/^[a-z0-9-]{1,64}$/.test(s);
const unpack=d=>d?JSON.parse(d.fields.payload.stringValue):null;
const write=(root,path,data,old)=>({update:{name:root+"/"+path,fields:{payload:str(JSON.stringify(data))}},currentDocument:pre(old)});
const present=(state,extra={})=>({revision:state.revision,ratings:state.ratings,game:state.game,mode:state.mode,level:state.level,tournament:state.tournament,rewards:[],...extra});
export async function chessWithStorage({read,commit,root,uid,input,seed=()=>crypto.getRandomValues(new Uint32Array(1))[0]}){
 const user="users/"+uid,path=user+"/privateGames/chess";
 if(!input||!["state","start","move","next","resign"].includes(input.action))fail("Unknown chess action.");
 for(let attempt=0;attempt<4;attempt++){
  const [account,old]=await Promise.all([read(user),read(path)]);
  if(!account?.updateTime||(account.fields?.status?.stringValue||"active")!=="active"||account.fields?.role?.stringValue==="banned")fail("Active verified account required.",403);
  const prior=unpack(old),state=prior?JSON.parse(JSON.stringify(prior)):{revision:0,ratings:initialRatings(),game:null,mode:null,level:null,tournament:null,seed:1};
  if(input.action==="state")return present(state);
  if(!idOK(input.requestId)||!Number.isSafeInteger(input.revision))fail("Refresh chess first.");
  if(state.lastRequest===input.requestId)return present(state,{rewards:state.lastRewards||[]});
  if(state.revision!==input.revision)fail("Chess changed in another tab. Reload your match.",409);
  let rewards=[],checks=[];
  if(input.action==="start"){
   if(state.game&&!state.game.winner)fail("Finish or resign the current match first.",409);
   if(state.tournament&&!state.tournament.complete)fail("Complete the current tournament first.",409);
   if(!validLevel(input.level)||!["pvb","tournament"].includes(input.mode))fail("Invalid match settings.");
   state.level=input.level;state.mode=input.mode;state.seed=seed();state.game=initialChess();state.tournament=null;
   if(input.mode==="tournament"){
    state.tournament=newTournament(input.entrants,input.level,input.format,state.seed);
    for(const id of input.entrants){
     // Only game-earned axolotl documents with a trusted game source qualify.
     const p=user+"/axolotls/"+id,d=await read(p);
     if(!d||!["hanggirl","apple-catcher","cherry-empire","giving-tree","orange-knock-down","peach-panic","shiny-light","chess"].includes(d.fields?.source?.stringValue))fail("Tournament requires seven distinct owned game-earned axolotls.",403);
     checks.push({verify:root+"/"+p,currentDocument:pre(d)});
    }
   }
  }else if(input.action==="next"){
   if(state.mode!=="tournament"||!state.tournament||state.tournament.complete||!state.game?.winner||!tournamentMatch(state.tournament))fail("No next tournament match.");
   state.game=initialChess();state.seed=seed();
  }else{
   if(!state.game||state.game.winner||state.game.turn!=="w")fail("No active player turn.");
   if(input.action==="resign")state.game={...state.game,winner:"b",reason:"resigned"};
   else{
    state.game=playChess(state.game,input.move);
    if(!state.game.winner){const bot=botMove(state.game,state.level,state.seed);if(!bot)fail("No bot move.");state.game=playChess(state.game,bot);}
   }
   if(state.game.winner){
    state.ratings=recordRated(state.ratings,state.level,state.game.winner==="w");
    let champion=false;
    if(state.tournament){state.tournament=advanceTournament(state.tournament,state.game.winner==="w");champion=state.tournament.complete&&state.tournament.champion==="player";if(champion)state.ratings.tournaments++;}
    for(const id of chessUnlocks(state.ratings,state.game,state.level,champion)){const p=user+"/"+(id===CHESS_TROPHY[0]?"trophies/":"axolotls/")+id;if(!await read(p))rewards.push(id);}
   }
  }
  state.revision++;state.lastRequest=input.requestId;state.lastRewards=rewards;
  const writes=[{verify:root+"/"+user,currentDocument:pre(account)},write(root,path,state,old),...checks];
  for(const id of rewards)writes.push({update:{name:root+"/"+user+"/"+(id===CHESS_TROPHY[0]?"trophies/":"axolotls/")+id,fields:{source:str("chess"),foundAt:{timestampValue:new Date().toISOString()}}},currentDocument:{exists:false}});
  if(await commit(writes))return present(state,{rewards});
 }
 fail("Chess save changed. Retry or reload.",409);
}
export async function chessService(env,input){
 if(env.STORE_MODE!=="live"||!env.FIREBASE_PROJECT||env.REWARD_FIREBASE_PROJECT!==env.FIREBASE_PROJECT)fail("Chess reward service unavailable.",503);
 const uid=await verifyFirebaseIdentity(env.FIREBASE_PROJECT,input?.idToken,true),token=await accessToken(env,env.FIREBASE_PROJECT);
 const root="projects/"+env.FIREBASE_PROJECT+"/databases/(default)/documents",url="https://firestore.googleapis.com/v1/"+root,headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 const read=async p=>{const r=await fetch(url+"/"+p.split("/").map(encodeURIComponent).join("/"),{headers});if(r.status===404)return null;if(!r.ok)fail("Chess storage unavailable.",503);return r.json();};
 const commit=async writes=>{const r=await fetch(url+":commit",{method:"POST",headers,body:JSON.stringify({writes})});if(r.ok)return true;const e=await r.json().catch(()=>({}));if([409,412].includes(r.status)||["ABORTED","FAILED_PRECONDITION","ALREADY_EXISTS"].includes(e.error?.status))return false;fail("Chess save not confirmed. Retry.",503);};
 try{return await chessWithStorage({read,commit,root,uid,input});}catch(e){if(e.status)throw e;fail(e.message);}
}
