// King-capture chess: check is not a restriction; trapped side loses.
export const CHESS_AXOLOTLS=[["rookie","Rookie","#b4dcf9","#5294c8","crown"],["bishell","Bishell","#f4cf9f","#b77e50","shell"],["pawny","Pawny","#d7dbea","#9298b7","bow"],["ninite","Ninite","#c8a8ed","#7865bf","star"],["king-of-the-sea","King of the Sea","#65cbd7","#247caa","crown"],["quensy","Quensy","#f6a5cf","#be478c","crown"]];
export const CHESS_TROPHY=["chess-master","Chess Master","Win an eight-player tournament at difficulty 10."];
export const CHESS_UNLOCKS={rookie:"Win any tournament.",bishell:"Win your first rated PvB match.",pawny:"Win 10 rated PvB matches.",ninite:"Capture a king with a knight in rated play.","king-of-the-sea":"Win 10 tournaments.",quensy:"Capture a king with a queen at difficulty 5 or higher."};
export const BOT_ELO=[300,500,700,900,1100,1300,1500,1700,1900,2100];
export const validLevel=n=>Number.isInteger(n)&&n>=1&&n<=10;
export const other=c=>c==="w"?"b":"w";
export const color=p=>!p?null:p===p.toUpperCase()?"w":"b";
export const square=i=>"abcdefgh"[i%8]+(8-(i>>3));
export function initialChess(){return {board:[..."rnbqkbnrpppppppp",...Array(32).fill(""),..."PPPPPPPPRNBQKBNR"],turn:"w",castle:"KQkq",ep:-1,plies:0,quiet:0,winner:null,reason:null,last:null};}
const inside=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
const diag=[[-1,-1],[-1,1],[1,-1],[1,1]],ortho=[[-1,0],[1,0],[0,-1],[0,1]],knight=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
export function moves(s){
 if(s.winner)return [];const out=[],b=s.board;
 for(let f=0;f<64;f++){const p=b[f];if(color(p)!==s.turn)continue;const r=f>>3,c=f%8,k=p.toLowerCase();
 const add=(rr,cc,flag="")=>{if(!inside(rr,cc))return;const t=rr*8+cc;if(color(b[t])===s.turn)return;if(k==="p"&&(rr===0||rr===7)){for(const promotion of ["q","r","b","n"])out.push({from:f,to:t,promotion,flag});}else out.push({from:f,to:t,promotion:"",flag});};
 if(k==="p"){const d=s.turn==="w"?-1:1;if(inside(r+d,c)&&!b[(r+d)*8+c]){add(r+d,c);if(r===(s.turn==="w"?6:1)&&!b[(r+2*d)*8+c])add(r+2*d,c,"double");}
 for(const dc of [-1,1])if(inside(r+d,c+dc)){const t=(r+d)*8+c+dc;if(b[t]&&color(b[t])!==s.turn)add(r+d,c+dc);else if(t===s.ep&&!b[t]&&b[r*8+c+dc]===(s.turn==="w"?"p":"P"))add(r+d,c+dc,"ep");}}
 else{const dirs=k==="n"?knight:k==="b"?diag:k==="r"?ortho:[...diag,...ortho];for(const [dr,dc] of dirs)for(let n=1;n<=7;n++){const rr=r+dr*n,cc=c+dc*n;if(!inside(rr,cc))break;const t=rr*8+cc;if(color(b[t])===s.turn)break;add(rr,cc);if(b[t]||k==="k"||k==="n")break;}
 if(k==="k"&&f===(s.turn==="w"?60:4)){const king=s.turn==="w"?"K":"k",queen=s.turn==="w"?"Q":"q",rook=s.turn==="w"?"R":"r";if(s.castle.includes(king)&&b[f+3]===rook&&!b[f+1]&&!b[f+2])add(r,6,"castle");if(s.castle.includes(queen)&&b[f-4]===rook&&!b[f-1]&&!b[f-2]&&!b[f-3])add(r,2,"castle");}}
 }return out;
}
export const moveKey=m=>square(m.from)+square(m.to)+(m.promotion||"");
const V={p:100,n:320,b:330,r:500,q:900,k:20000};
export function material(s,c){return s.board.reduce((sum,p)=>sum+(color(p)===c?V[p.toLowerCase()]:0),0);}
function raw(s,m){const b=s.board.slice(),p=b[m.from],captured=b[m.to],turn=other(s.turn);b[m.from]="";b[m.to]=m.promotion?(s.turn==="w"?m.promotion.toUpperCase():m.promotion):p;if(m.flag==="ep")b[m.to+(s.turn==="w"?8:-8)]="";if(m.flag==="castle"){const rf=m.to>m.from?m.from+3:m.from-4,rt=m.to>m.from?m.from+1:m.from-1;b[rt]=b[rf];b[rf]="";}
 let castle=s.castle;const drop=chars=>{for(const c of chars)castle=castle.replace(c,"");};if(p==="K")drop("KQ");if(p==="k")drop("kq");const rights={0:"q",7:"k",56:"Q",63:"K"};drop((rights[m.from]||"")+(rights[m.to]||""));
 return {board:b,turn,castle,ep:m.flag==="double"?(m.from+m.to)/2:-1,plies:s.plies+1,quiet:p.toLowerCase()==="p"||captured||m.flag==="ep"?0:s.quiet+1,winner:captured.toLowerCase()==="k"?s.turn:null,reason:captured.toLowerCase()==="k"?"king-captured":null,last:{...m,piece:p,captured}};
}
export function playChess(s,request){const m=moves(s).find(x=>x.from===request?.from&&x.to===request?.to&&x.promotion===(request.promotion||""));if(!m)throw Error("Illegal move.");const n=raw(s,m);if(!n.winner&&!moves(n).length){n.winner=s.turn;n.reason="trapped";}if(!n.winner&&(n.quiet>=100||n.plies>=400)){const diff=material(n,"w")-material(n,"b"),mob=moves({...n,turn:"w"}).length-moves({...n,turn:"b"}).length;n.winner=diff>0?"w":diff<0?"b":mob>0?"w":mob<0?"b":s.turn;n.reason="move-limit";}return n;}
function score(s,c){let v=0;for(let i=0;i<64;i++){const p=s.board[i];if(!p)continue;const sign=color(p)===c?1:-1,center=7-Math.abs((i>>3)-3.5)-Math.abs(i%8-3.5);v+=sign*(V[p.toLowerCase()]+(p.toLowerCase()==="k"?-center:3*center));}return v;}
function rng32(n){let x=n>>>0||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
export function botMove(s,level,seed=1){if(!validLevel(level))throw Error("Invalid difficulty.");const legal=moves(s);if(!legal.length)return null;const rand=rng32((seed+s.plies*2654435761)>>>0);if(level===1||level===2&&rand()<.55||level===3&&rand()<.25)return legal[Math.floor(rand()*legal.length)];
 const root=s.turn,depth=[0,1,1,2,2,2,3,3,3,4][level-1],limit=[0,100,150,250,350,600,900,1300,2200,3600][level-1];let nodes=0;
 const order=(state,list)=>list.sort((a,b)=>(V[state.board[b.to]?.toLowerCase()]||0)-(V[state.board[a.to]?.toLowerCase()]||0));
 function search(state,d,a,b){nodes++;if(state.winner)return state.winner===root?100000-state.plies:-100000+state.plies;if(d<=0||nodes>=limit)return score(state,root);const ms=order(state,moves(state));if(!ms.length)return state.turn===root?-99999:99999;const max=state.turn===root;let best=max?-Infinity:Infinity;for(const m of ms){const v=search(raw(state,m),d-1,a,b);if(max){best=Math.max(best,v);a=Math.max(a,best);}else{best=Math.min(best,v);b=Math.min(b,best);}if(b<=a||nodes>=limit)break;}return best;}
 let best=legal[0],value=-Infinity;for(const m of order(s,legal)){const v=search(raw(s,m),depth-1,-Infinity,Infinity)+(level<5?rand()*70:rand()*3);if(v>value){best=m;value=v;}if(nodes>=limit)break;}return best;
}
export const expectedScore=(a,b)=>1/(1+10**((b-a)/400));
export function eloUpdate(a,b,score,k=32){if(![a,b,k].every(Number.isFinite)||![0,.5,1].includes(score))throw Error("Invalid rating result.");const delta=Math.round(k*(score-expectedScore(a,b)));return {a:Math.max(100,a+delta),b:Math.max(100,b-delta),delta};}
export const onlinePvpElo=(a,b,score)=>eloUpdate(a,b,score);
export const initialRatings=()=>({pvb:1000,pvpOnline:1000,bots:[...BOT_ELO],wins:0,losses:0,tournaments:0});
export function recordRated(r,level,won){const next={...r,bots:[...r.bots]},e=eloUpdate(r.pvb,r.bots[level-1],won?1:0);next.pvb=e.a;next.bots[level-1]=e.b;next.wins+=won?1:0;next.losses+=won?0:1;return next;}
// Eight-entrant 3GG bracket: opening losers receive another championship-path
// opportunity even after two losses. Championship reset if the unbeaten finalist loses.
// Match graph follows the published eight-team seeded three-game-guarantee bracket.
export const THREE_GG_WAVES=[[1,2,3,4],[5,6,7,8],[9,10,13],[11,12],[14],[15],[16],[17]];
export const THREE_GG_LABELS=["Opening round","Winners / losers brackets","Winners final / guarantee round","Losers bracket","Losers semifinal","Losers final","Championship","Championship reset"];
const THREE_GG_FEEDS={
 5:["L1","L2"],6:["L3","L4"],7:["W1","W2"],8:["W3","W4"],
 9:["L6","W5"],10:["L5","W6"],13:["W7","W8"],
 11:["L8","W9"],12:["L7","W10"],14:["W11","W12"],
 15:["L13","W14"],16:["W13","W15"],17:["W13","W15"]
};
export function newTournament(owned,level,format,seed){
 if(!Array.isArray(owned)||owned.length!==7||new Set(owned).size!==7||owned.some(x=>typeof x!=="string"||x==="player"||!/^[a-z0-9-]{1,64}$/.test(x))||!validLevel(level)||!["single","3gg"].includes(format))throw Error("Choose seven distinct owned game axolotls.");
 const entrants=["player",...owned],random=rng32(seed);
 for(let i=entrants.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[entrants[i],entrants[j]]=[entrants[j],entrants[i]];}
 return {version:2,level,format,seed,entrants,round:0,matches:[0,2,4,6].map(i=>({id:1+i/2,a:entrants[i],b:entrants[i+1],winner:null})),history:[],champion:null,complete:false};
}
export function tournamentMatch(t){return !t||t.complete?null:t.matches.find(m=>!m.winner&&(m.a==="player"||m.b==="player"))||null;}
const loser=m=>m.winner===m.a?m.b:m.a;
function make3ggWave(t){
 const done=new Map(t.history.flatMap(r=>r.matches).map(m=>[m.id,m]));
 const resolve=feed=>{const m=done.get(Number(feed.slice(1)));if(!m?.winner)throw Error("Bracket dependency missing.");return feed[0]==="W"?m.winner:loser(m);};
 return THREE_GG_WAVES[t.round].map(id=>{const [a,b]=THREE_GG_FEEDS[id].map(resolve);if(a===b)throw Error("Duplicate entrant in match.");return {id,a,b,winner:null};});
}
export function advanceTournament(t,playerWon){
 if(t.complete)throw Error("Tournament finished.");
 const next=JSON.parse(JSON.stringify(t));
 // Older preview-only 3GG saves had a different structure; do not silently award
 // a title from those incorrect brackets. They can be explicitly restarted.
 if(next.format==="3gg"&&next.version!==2)throw Error("This older 3GG bracket needs restarting.");
 while(!next.complete){
  const player=tournamentMatch(next);
  if(player&&typeof playerWon!=="boolean")return next;
  for(const m of next.matches){
   if(m.winner)continue;
   if(m===player){m.winner=playerWon?"player":m.a==="player"?m.b:m.a;m.simulated=false;}
   else{const random=rng32((next.seed+Math.imul(m.id||next.round+1,0x9e3779b1))>>>0);m.winner=random()<.5?m.a:m.b;m.simulated=true;}
  }
  next.history.push({round:next.round,matches:JSON.parse(JSON.stringify(next.matches))});
  if(next.format==="single"){
   if(next.round===2){next.complete=true;next.champion=next.matches[0].winner;return next;}
   const ms=next.matches;next.round++;next.matches=[];
   for(let i=0;i<ms.length;i+=2)next.matches.push({id:(next.round===1?5:7)+i/2,a:ms[i].winner,b:ms[i+1].winner,winner:null});
  }else{
   const last=next.matches[0];
   // Match 16 pairs the undefeated winners-bracket finalist with the challenger.
   // Only the challenger winning triggers a reset. Match 17 is decisive.
   if(last.id===17||last.id===16&&last.winner===last.a){next.complete=true;next.champion=last.winner;return next;}
   next.round++;next.matches=make3ggWave(next);
  }
  playerWon=undefined;
  if(tournamentMatch(next))return next;
 }
 return next;
}
export function chessUnlocks(r,game,level,tournamentChampion=false){const ids=[];if(game?.winner==="w"){ids.push("bishell");if(r.wins>=10)ids.push("pawny");if(game.last?.captured==="k"&&game.last.piece==="N")ids.push("ninite");if(level>=5&&game.last?.captured==="k"&&game.last.piece==="Q")ids.push("quensy");}if(tournamentChampion){ids.push("rookie");if(r.tournaments>=10)ids.push("king-of-the-sea");if(level===10)ids.push(CHESS_TROPHY[0]);}return ids;}
