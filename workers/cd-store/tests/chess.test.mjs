import test from "node:test";
import assert from "node:assert/strict";
import {newTournament,tournamentMatch,advanceTournament,initialChess,moves,playChess,botMove,initialRatings,recordRated,chessUnlocks,CHESS_TROPHY,recordTournamentResult,tournamentBotMatch,tournamentBotPly,tournamentBotSeed,playerColor,startPlayerChess,tournamentColor,assignTournamentColors} from "../../../script/chess-core.mjs";
const ids=["a","b","c","d","e","f","g"];
function finish(t,decide){let playerGames=0;while(!t.complete){assert.ok(tournamentMatch(t));t=advanceTournament(t,decide(t,playerGames++));assert.ok(playerGames<=10);}return t;}
test("real 3GG: minimum three games, 16 or 17 total, all feeds and reset valid",()=>{
 let cases=0,sawReset=false,sawNoReset=false,sawLong=false,sawComeback=false;
 for(let seed=1;seed<=24;seed++)for(let mask=0;mask<256;mask++){
  const t=finish(newTournament(ids,10,"3gg",seed),(t,i)=>Boolean(mask&(1<<i)));
  const ms=t.history.flatMap(r=>r.matches),counts=new Map(t.entrants.map(x=>[x,0]));
  for(const m of ms){assert.notEqual(m.a,m.b);assert.ok([m.a,m.b].includes(m.winner));counts.set(m.a,counts.get(m.a)+1);counts.set(m.b,counts.get(m.b)+1);}
  assert.ok([...counts.values()].every(n=>n>=3));assert.ok([16,17].includes(ms.length));assert.equal(new Set(ms.map(m=>m.id)).size,ms.length);assert.equal(t.champion,ms.at(-1).winner);
  const final=ms.find(m=>m.id===16),reset=ms.find(m=>m.id===17);
  assert.equal(Boolean(reset),final.winner===final.b);
  if(reset){sawReset=true;assert.equal(reset.a,final.a);assert.equal(reset.b,final.b);}else sawNoReset=true;
  const p=ms.filter(m=>m.a==="player"||m.b==="player");if(p.length>3)sawLong=true;
  if(p[0].winner!=="player"&&p[1].winner!=="player"&&t.champion==="player")sawComeback=true;
  cases++;
 }
 assert.ok(cases===6144&&sawReset&&sawNoReset&&sawLong&&sawComeback);
});
test("single elimination ends after one loss and three wins earn championship",()=>{
 const t=newTournament(ids,10,"single",1);assert.equal(advanceTournament(t,false).complete,true);const win=finish(t,()=>true);assert.equal(win.champion,"player");assert.equal(win.history.flatMap(r=>r.matches).length,7);
});
test("reject duplicate or insufficient entrants",()=>{assert.throws(()=>newTournament(ids.slice(1),1,"3gg",1));assert.throws(()=>newTournament([...ids.slice(1),"b"],1,"3gg",1));assert.throws(()=>newTournament([...ids.slice(1),"player"],1,"3gg",1));});
test("chess moves, king capture, bot levels and Elo",()=>{let g=initialChess();assert.equal(moves(g).length,20);for(let l=1;l<=10;l++){const m=botMove(g,l,234);assert.ok(moves(g).some(x=>x.from===m.from&&x.to===m.to&&x.promotion===m.promotion));}g={...g,board:Array(64).fill(""),castle:""};g.board[0]="k";g.board[8]="R";g.board[63]="K";g=playChess(g,{from:8,to:0});assert.equal(g.winner,"w");const r=recordRated(initialRatings(),1,true);assert.ok(r.pvb>1000);assert.ok(chessUnlocks({...r,tournaments:1},g,10,true).includes(CHESS_TROPHY[0]));assert.ok(!chessUnlocks(r,g,9,true).includes(CHESS_TROPHY[0]));});

test("interactive bracket waits for all current matches; watching and simulating feed same bracket",()=>{let t=newTournament(ids,1,"3gg",5);const human=tournamentMatch(t),bot=t.matches.find(m=>m!==human);t=recordTournamentResult(t,human.id,"player");assert.equal(t.round,0);assert.equal(tournamentMatch(t),null);assert.ok(tournamentBotMatch(t,bot.id));let g=initialChess();const seed=tournamentBotSeed(t,bot);g=tournamentBotPly(g,1,seed);assert.equal(g.plies,1);for(const m of t.matches.filter(m=>!m.winner))t=recordTournamentResult(t,m.id,m.a,m.id!==bot.id);assert.equal(t.round,1);assert.ok(t.history[0].matches.every(m=>m.winner));assert.throws(()=>recordTournamentResult(t,bot.id,bot.a));});
test("black player starts after legal white bot move and color choice is deterministic",()=>{const g=startPlayerChess("b",1,12);assert.equal(g.plies,1);assert.equal(g.turn,"b");assert.equal(startPlayerChess("w",1,12).plies,0);assert.equal(playerColor("random",1),"b");assert.equal(playerColor("random",2),"w");const r=initialRatings(),win={winner:"b",last:{captured:"K",piece:"n"}};assert.ok(chessUnlocks(r,win,5,false,"b").includes("ninite"));});

test("tournament colors are assigned and stable, championship reset reverses colors",()=>{
 let resets=0,whiteStarts=0,blackStarts=0;
 for(const format of ["single","3gg"])for(let seed=1;seed<=80;seed++){
  let t=newTournament(ids,1,format,seed);const first=tournamentMatch(t);
  if(tournamentColor(first,"player")==="w")whiteStarts++;else blackStarts++;
  while(!t.complete){
   const old=JSON.stringify(t);assert.equal(JSON.stringify(assignTournamentColors(JSON.parse(old))),old);
   for(const m of t.matches){assert.notEqual(m.white,m.black);assert.ok([m.a,m.b].includes(m.white));assert.ok([m.a,m.b].includes(m.black));assert.equal(tournamentColor(m,m.white),"w");assert.equal(tournamentColor(m,m.black),"b");}
   for(const m of t.matches.filter(m=>!m.winner))t=recordTournamentResult(t,m.id,m.id===16?m.b:m.a);
  }
  if(format==="3gg"){const ms=t.history.flatMap(r=>r.matches),final=ms.find(m=>m.id===16),reset=ms.find(m=>m.id===17);assert.ok(reset);assert.equal(reset.white,final.black);assert.equal(reset.black,final.white);resets++;}
 }
 assert.ok(whiteStarts>0&&blackStarts>0&&resets===80);
});
