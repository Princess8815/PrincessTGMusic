import test from "node:test";
import assert from "node:assert/strict";
import {chessWithStorage} from "../chess.mjs";
import {initialChess,initialRatings,chessDifficultyCoins,CHESS_CAPTURE_COINS,tournamentMatch,tournamentColor} from "../../../script/chess-core.mjs";
const root="docs",uid="u",user="users/u",path=user+"/privateGames/chess";
function fixture(mode="free"){
 const data=new Map([[user,{updateTime:"account",fields:{role:{stringValue:"owner"}}}],["staffTestMembershipOverrides/u",{updateTime:"membership",fields:{mode:{stringValue:mode}}}]]);let version=0,coins=0;
 const read=async p=>data.get(p)||null;
 const commit=async writes=>{for(const w of writes){if(w.verify){assert.equal(data.get(w.verify.slice(root.length+1))?.updateTime,w.currentDocument.updateTime);continue;}const p=w.update.name.slice(root.length+1);if(p.endsWith("/wallets/starCoins")){coins+=Number(w.updateTransforms[0].increment.integerValue);continue;}data.set(p,{updateTime:String(++version),fields:w.update.fields});}return true;};
 return {data,read,commit,get coins(){return coins;},call(input){return chessWithStorage({read,commit,root,uid,input,preview:true,seed:()=>8});},save(state){data.set(path,{updateTime:String(++version),fields:{payload:{stringValue:JSON.stringify(state)}}});}};
}
test("difficulty-scaled server payouts for black player, Free and Paid; retry never credits twice",async()=>{
 for(const [member,multiplier] of [["free",1],["actual",2]])for(const level of [1,5,10]){
  const f=fixture(member),game={...initialChess(),board:Array(64).fill(""),turn:"b",castle:""};game.board[0]="k";game.board[55]="r";game.board[63]="K";
  f.save({revision:3,ratings:initialRatings(),mode:"pvb",level,side:"b",game,seed:1,pendingCoins:5});
  const req={action:"move",requestId:"win",revision:3,move:{from:55,to:63}};
  const d=await f.call(req),expected=chessDifficultyCoins(35,level)*multiplier;assert.equal(d.coinAward,expected);assert.equal(f.coins,expected);assert.equal(d.ratings.wins,1);assert.equal(d.game.winner,"b");
  assert.equal((await f.call(req)).coinAward,expected);assert.equal(f.coins,expected);
 }
});
test("watched/simulated tournament bot moves never change wallet or player rating",async()=>{
 const f=fixture();const ids=["a","b","c","d","e","f","g"];for(const id of ids)f.data.set(user+"/axolotls/"+id,{updateTime:id,fields:{source:{stringValue:"hanggirl"}}});
 let d=await f.call({action:"start",mode:"tournament",format:"3gg",level:1,entrants:ids,colorChoice:"b",revision:0,requestId:"start"});
 const first=tournamentMatch(d.tournament);assert.equal(d.side,tournamentColor(first,"player"));assert.equal(d.game.turn,d.side);const m=d.tournament.matches.find(x=>x.a!=="player"&&x.b!=="player"),before=JSON.stringify(d.game);
 d=await f.call({action:"bot-watch",matchId:m.id,revision:d.revision,requestId:"watch"});assert.equal(d.spectator.a,m.white);assert.equal(d.spectator.b,m.black);
 d=await f.call({action:"bot-step",matchId:m.id,revision:d.revision,requestId:"step"});assert.equal(d.spectator.game.plies,1);assert.equal(JSON.stringify(d.game),before);assert.equal(d.ratings.pvb,1000);assert.equal(f.coins,0);
 d=await f.call({action:"bot-simulate",matchId:m.id,revision:d.revision,requestId:"sim"});assert.equal(d.spectator,null);assert.equal(d.tournament.matches.find(x=>x.id===m.id).simulated,true);assert.equal(f.coins,0);assert.equal(d.ratings.pvb,1000);
});
test("reward scaling rises across ten levels",()=>{assert.equal(CHESS_CAPTURE_COINS.q,9);for(let l=2;l<=10;l++)assert.ok(chessDifficultyCoins(20,l)>chessDifficultyCoins(20,l-1));assert.equal(chessDifficultyCoins(20,10),65);});

test("server ignores tournament color preference; resume and next match use assigned colors",async()=>{
 for(const choice of ["w","b","random"]){
  const f=fixture();const ids=["a","b","c","d","e","f","g"];for(const id of ids)f.data.set(user+"/axolotls/"+id,{updateTime:id,fields:{source:{stringValue:"hanggirl"}}});
  let d=await f.call({action:"start",mode:"tournament",format:"3gg",level:1,entrants:ids,colorChoice:choice,revision:0,requestId:"start"});
  const m=tournamentMatch(d.tournament);assert.equal(d.side,tournamentColor(m,"player"));assert.equal(d.colorChoice,"assigned");
  const resumed=await f.call({action:"state"});assert.equal(resumed.side,d.side);assert.equal(JSON.stringify(resumed.tournament),JSON.stringify(d.tournament));
  d=await f.call({action:"resign",revision:d.revision,requestId:"resign"});
  for(const bot of d.tournament.matches.filter(x=>!x.winner&&x.a!=="player"&&x.b!=="player"))d=await f.call({action:"bot-simulate",matchId:bot.id,revision:d.revision,requestId:"sim-"+bot.id});
  const next=tournamentMatch(d.tournament);assert.ok(next);
  d=await f.call({action:"next",revision:d.revision,requestId:"next",colorChoice:choice});
  assert.equal(d.side,tournamentColor(next,"player"));assert.equal(d.game.turn,d.side);
 }
});
