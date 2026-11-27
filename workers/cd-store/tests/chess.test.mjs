import test from "node:test";
import assert from "node:assert/strict";
import {newTournament,tournamentMatch,advanceTournament,initialChess,moves,playChess,botMove,initialRatings,recordRated,chessUnlocks,CHESS_TROPHY} from "../../../script/chess-core.mjs";
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
