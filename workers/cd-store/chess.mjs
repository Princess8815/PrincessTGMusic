import {gameCoinAward} from "./game-coin-rewards.mjs";
import {accessToken,verifyFirebaseIdentity} from "./rewards.js";
import {initialChess,botMove,playChess,initialRatings,recordRated,newTournament,tournamentMatch,recordTournamentResult,tournamentSimWinner,tournamentBotMatch,tournamentBotSeed,tournamentBotPly,playerColor,startPlayerChess,playerWon,other,chessUnlocks,validLevel,CHESS_TROPHY,captureCoins,chessMatchCoins,CHESS_CAPTURE_CAP,CHESS_TOURNAMENT_COINS,chessDifficultyCoins} from "../../script/chess-core.mjs";
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const str=stringValue=>({stringValue}),pre=d=>d?{updateTime:d.updateTime}:{exists:false};
const idOK=s=>typeof s==="string"&&/^[a-z0-9-]{1,64}$/.test(s);
const unpack=d=>d?JSON.parse(d.fields.payload.stringValue):null;
const write=(root,path,data,old)=>({update:{name:root+"/"+path,fields:{payload:str(JSON.stringify(data))}},currentDocument:pre(old)});
const present=(state,extra={})=>({revision:state.revision,ratings:state.ratings,game:state.game,mode:state.mode,level:state.level,tournament:state.tournament,side:state.side||"w",colorChoice:state.colorChoice||"w",playerMatchId:state.playerMatchId??null,spectator:state.spectator||null,pendingCoins:state.pendingCoins||0,matchCoins:state.matchCoins||0,coinAward:0,rewards:[],...extra});
export async function chessWithStorage({read,commit,root,uid,input,preview=false,clock=Date.now,seed=()=>crypto.getRandomValues(new Uint32Array(1))[0]}){
 const user="users/"+uid,path=user+"/privateGames/chess";
 if(!input||!["state","start","move","next","resign","bot-watch","bot-step","bot-simulate"].includes(input.action))fail("Unknown chess action.");
 for(let attempt=0;attempt<4;attempt++){
  const [account,old]=await Promise.all([read(user),read(path)]);
  if(!account?.updateTime||(account.fields?.status?.stringValue||"active")!=="active"||account.fields?.role?.stringValue==="banned")fail("Active verified account required.",403);
  const prior=unpack(old),state=prior?JSON.parse(JSON.stringify(prior)):{revision:0,ratings:initialRatings(),game:null,mode:null,level:null,tournament:null,seed:1};
  if(input.action==="state")return present(state);
  if(!idOK(input.requestId)||!Number.isSafeInteger(input.revision))fail("Refresh chess first.");
  if(state.lastRequest===input.requestId)return present(state,{rewards:state.lastRewards||[],coinAward:state.lastCoinAward||0});
  if(state.revision!==input.revision)fail("Chess changed in another tab. Reload your match.",409);
  let rewards=[],checks=[],baseCoins=0,coinAward=0;
  const wasChampion=state.tournament?.complete&&state.tournament.champion==="player";
  let completedPlayerGame=false;
  function startGame(){
   state.seed=seed();state.side=playerColor(state.colorChoice||"w",state.seed);
   state.game=startPlayerChess(state.side,state.level,state.seed);state.pendingCoins=0;state.matchCoins=0;
   state.playerMatchId=state.mode==="tournament"?tournamentMatch(state.tournament)?.id??null:null;
  }
  if(input.action==="start"){
   if(state.game&&!state.game.winner)fail("Finish or resign the current match first.",409);
   if(state.tournament&&!state.tournament.complete)fail("Complete the current tournament first.",409);
   if(!validLevel(input.level)||!["pvb","tournament"].includes(input.mode))fail("Invalid match settings.");
   state.level=input.level;state.mode=input.mode;state.seed=seed();state.colorChoice=input.colorChoice??"w";playerColor(state.colorChoice,state.seed);
   state.tournament=null;state.spectator=null;state.playerMatchId=null;
   if(input.mode==="tournament"){
    state.tournament=newTournament(input.entrants,input.level,input.format,state.seed);
    for(const id of input.entrants){
     const p=user+"/axolotls/"+id,d=await read(p);
     if(!d||!["hanggirl","apple-catcher","cherry-empire","giving-tree","orange-knock-down","peach-panic","shiny-light","chess"].includes(d.fields?.source?.stringValue))fail("Tournament requires seven distinct owned game-earned axolotls.",403);
     checks.push({verify:root+"/"+p,currentDocument:pre(d)});
    }
   }
   startGame();
  }else if(input.action==="next"){
   if(state.mode!=="tournament"||!state.tournament||state.tournament.complete||!state.game?.winner||!tournamentMatch(state.tournament))fail("No next tournament match. Finish the pending bot games first.");
   startGame();
  }else if(["bot-watch","bot-step","bot-simulate"].includes(input.action)){
   if(state.mode!=="tournament"||!state.tournament)fail("No tournament.");
   const match=tournamentBotMatch(state.tournament,input.matchId);
   if(!match)fail("This bot match is not pending.",409);
   if(input.action==="bot-simulate"){
    state.tournament=recordTournamentResult(state.tournament,match.id,tournamentSimWinner(state.tournament,match),true);
    if(state.spectator?.matchId===match.id)state.spectator=null;
   }else if(input.action==="bot-watch"){
    if(state.spectator&&state.spectator.matchId!==match.id&&!state.spectator.game.winner)fail("Finish or simulate the other watched game first.",409);
    if(state.spectator?.matchId!==match.id)state.spectator={matchId:match.id,a:match.a,b:match.b,game:initialChess(),seed:tournamentBotSeed(state.tournament,match)};
   }else{
    const watch=state.spectator;if(!watch||watch.matchId!==match.id||watch.game.winner)fail("Open the pending bot match first.",409);
    watch.game=tournamentBotPly(watch.game,state.level,watch.seed);
    if(watch.game.winner)state.tournament=recordTournamentResult(state.tournament,match.id,watch.game.winner==="w"?match.a:match.b,false);
   }
  }else{
   const side=state.side||"w";
   if(!state.game||state.game.winner||state.game.turn!==side)fail("No active player turn.");
   if(input.action==="resign")state.game={...state.game,winner:other(side),reason:"resigned"};
   else{
    state.game=playChess(state.game,input.move);
    state.pendingCoins=Math.min(CHESS_CAPTURE_CAP,(state.pendingCoins||0)+captureCoins(state.game.last?.captured)+(state.game.last?.flag==="ep"?1:0));
    if(!state.game.winner){const bot=botMove(state.game,state.level,state.seed);if(!bot)fail("No bot move.");state.game=playChess(state.game,bot);}
   }
   if(state.game.winner){
    completedPlayerGame=true;baseCoins+=chessMatchCoins(state.pendingCoins,state.game,side);state.pendingCoins=0;
    state.ratings=recordRated(state.ratings,state.level,playerWon(state.game,side));
    if(state.tournament){
     const m=tournamentMatch(state.tournament);if(!m)fail("No pending player match.");
     state.playerMatchId=m.id;
     state.tournament=recordTournamentResult(state.tournament,m.id,playerWon(state.game,side)?"player":m.a==="player"?m.b:m.a,false);
    }
   }
  }
  const champion=!wasChampion&&state.tournament?.complete&&state.tournament.champion==="player";
  if(champion){state.ratings.tournaments++;baseCoins+=CHESS_TOURNAMENT_COINS;}
  for(const id of chessUnlocks(state.ratings,completedPlayerGame?state.game:null,state.level,champion,state.side||"w")){
   const p=user+"/"+(id===CHESS_TROPHY[0]?"trophies/":"axolotls/")+id;if(!await read(p))rewards.push(id);
  }
  if(baseCoins){const award=await gameCoinAward({read,root,uid,account,coins:chessDifficultyCoins(baseCoins,state.level),preview,clock});coinAward=award.coins;checks.push(...award.checks);if(completedPlayerGame)state.matchCoins=coinAward;}
  state.revision++;state.lastRequest=input.requestId;state.lastRewards=rewards;state.lastCoinAward=coinAward;
  const writes=[{verify:root+"/"+user,currentDocument:pre(account)},write(root,path,state,old),...checks];
  if(coinAward)writes.push({update:{name:root+"/"+user+"/wallets/starCoins",fields:{currency:str("starCoins")}},updateMask:{fieldPaths:["currency"]},updateTransforms:[{fieldPath:"balance",increment:{integerValue:String(coinAward)}}]});
  for(const id of rewards)writes.push({update:{name:root+"/"+user+"/"+(id===CHESS_TROPHY[0]?"trophies/":"axolotls/")+id,fields:{source:str("chess"),foundAt:{timestampValue:new Date().toISOString()}}},currentDocument:{exists:false}});
  if(await commit(writes))return present(state,{rewards,coinAward});
 }
 fail("Chess save changed. Retry or reload.",409);
}
export async function chessService(env,input,preview=false){
 if(env.STORE_MODE!=="live"||!env.FIREBASE_PROJECT||env.REWARD_FIREBASE_PROJECT!==env.FIREBASE_PROJECT)fail("Chess reward service unavailable.",503);
 const uid=await verifyFirebaseIdentity(env.FIREBASE_PROJECT,input?.idToken,true),token=await accessToken(env,env.FIREBASE_PROJECT);
 const root="projects/"+env.FIREBASE_PROJECT+"/databases/(default)/documents",url="https://firestore.googleapis.com/v1/"+root,headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 const read=async p=>{const r=await fetch(url+"/"+p.split("/").map(encodeURIComponent).join("/"),{headers});if(r.status===404)return null;if(!r.ok)fail("Chess storage unavailable.",503);return r.json();};
 const commit=async writes=>{const r=await fetch(url+":commit",{method:"POST",headers,body:JSON.stringify({writes})});if(r.ok)return true;const e=await r.json().catch(()=>({}));if([409,412].includes(r.status)||["ABORTED","FAILED_PRECONDITION","ALREADY_EXISTS"].includes(e.error?.status))return false;fail("Chess save not confirmed. Retry.",503);};
 try{return await chessWithStorage({read,commit,root,uid,input,preview});}catch(e){if(e.status)throw e;fail(e.message);}
}
