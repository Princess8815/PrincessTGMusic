import {auth,db,usingLocalFirebaseEmulators} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {collection,onSnapshot} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {axolotlPortrait,axolotlName,axolotlIds} from "./reef-collection.js";
import {validImage} from "./starlight-model.mjs";
import {initialChess,moves,playChess,botMove,color,square,BOT_ELO,initialRatings,tournamentMatch,CHESS_TROPHY,THREE_GG_LABELS,THREE_GG_WAVES,THREE_GG_FEEDS,playerColor,chessDifficultyCoins,CHESS_WIN_COINS,CHESS_TOURNAMENT_COINS,CHESS_CAPTURE_COINS,inCheck} from "./chess-core.mjs";
const $=id=>document.getElementById(id),G={K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙",k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟︎"};
const endpoint="https://princesstg-cd-store-live.transgirl1991.workers.dev/games/chess",gameSources=new Set(["hanggirl","apple-catcher","cherry-empire","giving-tree","orange-knock-down","peach-panic","shiny-light","chess"]);
let game=initialChess(),mode="pvp",level=1,whiteLevel=1,selected=-1,busy=false,paused=false,started=false,remote=null,seed=1,owned=[],items=[],trophies=[],unsubs=[],epoch=0,serial=0,botTimer=null,accountRatings=initialRatings(),selectedEntrants=new Set(),request=null,side="w",watching=false;
const message=t=>{$("ch-message").textContent=t;};
const option=(s,val,name)=>{const o=document.createElement("option");o.value=val;o.textContent=name;s.append(o);};
for(const id of ["ch-level","ch-white-level","ch-tournament-level"]){for(let l=1;l<=10;l++)option($(id),String(l),"Level "+l+" · "+BOT_ELO[l-1]+" starting Elo");}
$("ch-level").value="1";$("ch-white-level").value="1";$("ch-tournament-level").value="1";
function label(id){if(id==="player")return "You";return axolotlName(id);}
function portraitBox(node,id){node.replaceChildren();if(id.startsWith("ax:")){node.innerHTML=axolotlPortrait(id.slice(3));return;}const item=items.find(x=>"item:"+x.id===id);if(id==="logo"||id==="character"||item&&validImage(item.image)){const img=document.createElement("img");img.src=id==="logo"?"../images/logo avatar.png":id==="character"?"../images/games/chess-player.webp":item.image;img.alt=id==="logo"?"PrincessTG logo":id==="character"?"PrincessTG character":item.name;node.append(img);return;}if(id.startsWith("trophy:")){node.textContent="🏆";return;}node.textContent="♟";}
function avatars(){const p=$("ch-player-avatar"),old=p.value||"character";p.replaceChildren();option(p,"logo","PrincessTG logo");option(p,"character","PrincessTG character");for(const x of owned)if(axolotlIds().includes(x.id))option(p,"ax:"+x.id,axolotlName(x.id));for(const x of items)option(p,"item:"+x.id,x.name||x.id);for(const x of trophies)option(p,"trophy:"+x.id,x.id.replaceAll("-"," "));p.value=[...p.options].some(o=>o.value===old)?old:"character";const p2=$("ch-pvp-avatar"),old2=p2.value||"logo";p2.replaceChildren(...[...p.options].map(o=>o.cloneNode(true)));p2.value=[...p2.options].some(o=>o.value===old2)?old2:"logo";for(const id of ["ch-bot-avatar","ch-white-avatar"]){const s=$(id),prev=s.value|| (id==="ch-bot-avatar"?"ax:marina":"ax:luna");s.replaceChildren();for(const x of axolotlIds())option(s,"ax:"+x,axolotlName(x));s.value=[...s.options].some(o=>o.value===prev)?prev:s.options[0]?.value;}renderEntrants();render();}
function renderEntrants(){const list=owned.filter(x=>gameSources.has(x.source)&&axolotlIds().includes(x.id)),set=new Set(list.map(x=>x.id));selectedEntrants=new Set([...selectedEntrants].filter(id=>set.has(id)));$("ch-owned-status").textContent=list.length+" owned game axolotls · "+selectedEntrants.size+"/7 selected";$("ch-entrants").replaceChildren();for(const x of list){const l=document.createElement("label"),b=document.createElement("input");b.type="checkbox";b.checked=selectedEntrants.has(x.id);b.disabled=selectedEntrants.size===7&&!b.checked;b.onchange=()=>{if(b.checked&&selectedEntrants.size<7)selectedEntrants.add(x.id);else selectedEntrants.delete(x.id);renderEntrants();};l.append(b,document.createTextNode(axolotlName(x.id)));$("ch-entrants").append(l);}}
function tournamentRecords(t){
 const waveIds=t.format==="3gg"?THREE_GG_WAVES:[[1,2,3,4],[5,6],[7]];
 const feeds=t.format==="3gg"?THREE_GG_FEEDS:{5:["W1","W2"],6:["W3","W4"],7:["W5","W6"]};
 return waveIds.map((ids,round)=>{const saved=t.history.find(r=>r.round===round);return {round,matches:saved?.matches||(round===t.round?t.matches:ids.map(id=>({id,feed:feeds[id]||[]})))};});
}
function bracketPerson(id){const n=document.createElement("span");n.className="ch-match-person";const pic=document.createElement("span");pic.className="ch-mini-avatar";portraitBox(pic,id==="player"?$("ch-player-avatar").value:"ax:"+id);n.append(pic,document.createTextNode(label(id)));return n;}
function renderBracket(){
 const t=remote?.tournament;
 $("ch-bracket-panel").hidden=!t;
 $("ch-bracket-summary").textContent=t?(t.format==="3gg"?"3-game guarantee":"Single elimination")+" · Difficulty "+t.level+" · "+(t.complete?"Champion: "+label(t.champion):"Round "+(t.round+1)):"";
 for(const el of [$("ch-bracket"),$("ch-full-bracket")]){
  el.replaceChildren();if(!t){el.textContent="Start a tournament to see the bracket.";continue;}
  for(const r of tournamentRecords(t)){
   if(el.id==="ch-bracket"&&r.round>t.round)continue;
   const sec=document.createElement("div");sec.className="ch-round";const head=document.createElement("h3");head.textContent=(t.format==="3gg"?THREE_GG_LABELS:["Quarterfinals","Semifinals","Final"])[r.round];sec.append(head);
   for(const m of r.matches){
    const row=document.createElement("div");row.className="ch-match";const title=document.createElement("strong");title.textContent="Game "+m.id;row.append(title);
    if(m.feed){row.classList.add("pending-feed");const p=document.createElement("p");p.textContent=t.complete?"Not needed":m.feed.map(x=>(x[0]==="W"?"Winner":"Loser")+" of game "+x.slice(1)).join(" vs ");row.append(p);}
    else{const people=document.createElement("div");people.className="ch-match-players";if(m.white&&m.black)people.append(document.createTextNode("White: "),bracketPerson(m.white),document.createTextNode(" · Black: "),bracketPerson(m.black));else people.append(bracketPerson(m.a),document.createTextNode(" vs "),bracketPerson(m.b));row.append(people);
     const p=document.createElement("p");p.className="ch-match-result";p.textContent=m.winner?"Winner: "+label(m.winner)+(m.simulated?" (simulated)":""):"Pending";row.append(p);
     if(!t.complete&&r.round===t.round&&!m.winner&&m.a!=="player"&&m.b!=="player"){
      const actions=document.createElement("div");actions.className="ch-match-actions";
      for(const [action,title] of [["bot-watch","Watch"],["bot-simulate","Simulate"]]){
       const button=document.createElement("button");button.type="button";button.textContent=title;button.disabled=busy;button.onclick=()=>{if(action==="bot-watch"){if(remote?.spectator&&!remote.spectator.game.winner&&remote.spectator.matchId!==m.id){message("Finish or simulate the currently watched bot game first.");return;}watching=true;paused=false;$("ch-board-section").scrollIntoView({block:"start",behavior:"smooth"});}void send(action,{matchId:m.id});};actions.append(button);
      }row.append(actions);
     }
    }sec.append(row);
   }el.append(sec);
  }
  if(t.complete){const p=document.createElement("p");p.textContent="Champion: "+label(t.champion);el.append(p);}
 }
}
function renderRatings(){const r=accountRatings;$("ch-ratings").textContent="PvB Elo: "+r.pvb+" · Wins: "+r.wins+" · Losses: "+r.losses+" · Tournament wins: "+r.tournaments+" · Online PvP Elo: "+r.pvpOnline+" (reserved)";const b=$("ch-bot-ratings");b.className="ch-rankings";b.replaceChildren();r.bots.forEach((n,i)=>{const p=document.createElement("span");p.textContent="Bot "+(i+1)+": "+n;b.append(p);});}
function isRemote(){return mode==="rated"||mode==="tournament";}
function isBot(){return mode==="bvb"||mode==="pvb"&&game.turn!==side;}
function setup(){const m=$("ch-mode").value,t=m==="tournament",b=m==="bvb",p=m==="pvp";$("ch-tournament-settings").hidden=!t;$("ch-color-field").hidden=p||b||t;$("ch-level-field").hidden=p||t;$("ch-white-level-field").hidden=!b;$("ch-player-avatar-field").hidden=b;$("ch-bot-avatar-field").hidden=p||t;$("ch-white-avatar-field").hidden=!b;$("ch-pvp-avatar-field").hidden=!p;$("ch-level-label").textContent=b?"Black bot difficulty":"Opponent difficulty";$("ch-bot-avatar-label").textContent=b?"Black bot portrait":"Opponent portrait";$("ch-start").textContent=t?"Start tournament":"Start match";}
function render(){
 setup();
 const spectator=watching?remote?.spectator:null,shown=spectator?.game||game,flipped=!spectator&&(mode==="pvb"||isRemote())&&side==="b";
 document.querySelector(".ch-board-card").classList.toggle("black-view",flipped);
 const valid=moves(shown),targets=valid.filter(m=>m.from===selected),checkedKing=!shown.winner&&inCheck(shown)?shown.board.indexOf(shown.turn==="w"?"K":"k"):-1;
 const board=$("ch-board");board.replaceChildren();
 for(let pos=0;pos<64;pos++){
  const i=flipped?63-pos:pos,p=shown.board[i],b=document.createElement("button");b.type="button";b.className="ch-square ptg-theme-exempt"+(((i>>3)+i%8)%2?" dark":"")+(color(p)==="b"?" black-piece":"")+(i===selected?" selected":"")+(i===checkedKing?" in-check":"")+(shown.last&&(i===shown.last.from||i===shown.last.to)?" last-move":"")+(targets.some(m=>m.to===i)?p?" target capture":" target":"");
  const piece=document.createElement("span");piece.className="ch-piece";piece.textContent=G[p]||"";b.append(piece);
  if(pos%8===0){const c=document.createElement("span");c.className="ch-coord ch-rank";c.textContent=square(i)[1];b.append(c);}
  if(pos>=56){const c=document.createElement("span");c.className="ch-coord ch-file";c.textContent=square(i)[0];b.append(c);}
  b.setAttribute("aria-label",square(i)+" "+(p||"empty"));b.disabled=!!spectator||!started||busy||!!game.winner||isBot()||(isRemote()&&game.turn!==side);b.onclick=()=>clickSquare(i);board.append(b);
 }
 const reason={"king-captured":"King captured",checkmate:"Checkmate · king captured",stalemate:"Trapped stalemate · king captured",trapped:"Opponent trapped","move-limit":"Move-limit adjudication",resigned:"Resignation"};
 $("ch-turn").textContent=(spectator?"Watching game "+spectator.matchId+" · ":"")+(shown.winner?(shown.winner==="w"?"White":"Black")+" wins · "+(reason[shown.reason]||shown.reason):busy?"Saving / thinking…":(shown.turn==="w"?"White":"Black")+" to move"+(inCheck(shown)?" · Check!":""));
 const t=mode==="tournament"?remote?.tournament:null;
 const match=t&&[...t.history.flatMap(r=>r.matches),...t.matches].find(m=>m.id===remote?.playerMatchId);
 const opponent=match?(match.a==="player"?match.b:match.a):null;
 let wp=$("ch-player-avatar").value,bp=$("ch-bot-avatar").value,wn="You",bn=axolotlName(bp.slice(3)),wr="",br="Bot level "+level;
 if(mode==="pvp"){bp=$("ch-pvp-avatar").value;wn="Player 1";bn="Player 2";br="";}
 else if(mode==="bvb"){wp=$("ch-white-avatar").value;wn=axolotlName(wp.slice(3));wr="Bot level "+whiteLevel;}
 else {if(opponent){bp="ax:"+opponent;bn=axolotlName(opponent);}if(isRemote())wr="PvB Elo "+accountRatings.pvb;if(side==="b"){[wp,bp]=[bp,wp];[wn,bn]=[bn,wn];[wr,br]=[br,wr];}}
 if(spectator){wp="ax:"+spectator.a;bp="ax:"+spectator.b;wn=label(spectator.a);bn=label(spectator.b);wr=br="Bot level "+remote.level;}
 portraitBox($("ch-white-pic"),wp);portraitBox($("ch-black-pic"),bp);
 $("ch-white-name").textContent="White · "+wn;$("ch-black-name").textContent="Black · "+bn;$("ch-white-rating").textContent=wr;$("ch-black-rating").textContent=br;
 $("ch-start").disabled=busy;$("ch-resume").disabled=busy;$("ch-pause").hidden=!(spectator||mode==="bvb"&&started)||!!shown.winner;$("ch-pause").textContent=paused?"Resume bots":"Pause bots";
 $("ch-back-player").hidden=!watching;$("ch-resign").hidden=watching||!started||!!game.winner||mode==="bvb";$("ch-next").hidden=watching||mode!=="tournament"||!game.winner||!tournamentMatch(t);
 const planned=$("ch-mode").value,chosen=Number($(planned==="tournament"?"ch-tournament-level":"ch-level").value)||1;
 $("ch-coins").textContent=spectator||mode==="bvb"||mode==="pvp"||mode==="pvb"&&started?"Practice / spectator: no coin rewards.":isRemote()&&started?"Pending capture base: "+chessDifficultyCoins(remote?.pendingCoins||0,level)+" · Mate/stalemate base bonus: "+chessDifficultyCoins(CHESS_WIN_COINS+CHESS_CAPTURE_COINS.k,level)+" · Last match credited: "+(remote?.matchCoins||0):"Base mate/stalemate bonus at level "+chosen+": "+chessDifficultyCoins(CHESS_WIN_COINS+CHESS_CAPTURE_COINS.k,chosen);
 renderBracket();renderRatings();
}
function queueBot(){
 clearTimeout(botTimer);if(paused||busy)return;
 const spectator=watching?remote?.spectator:null;
 const delay=Number($("ch-speed").value)||2000,ticket=serial;
 if(spectator&&!spectator.game.winner){botTimer=setTimeout(()=>{if(ticket===serial&&!paused&&watching)void send("bot-step",{matchId:spectator.matchId});},delay);return;}
 if(watching||!started||game.winner||!isBot()||isRemote())return;
 botTimer=setTimeout(()=>{if(ticket!==serial||paused||game.winner)return;try{const m=botMove(game,game.turn==="w"&&mode==="bvb"?whiteLevel:level,seed+(game.turn==="w"?91:0));if(m)game=playChess(game,m);selected=-1;render();queueBot();}catch(e){message(e.message);}},mode==="bvb"?delay:400);
}
function applyLocal(m){game=playChess(game,m);selected=-1;render();queueBot();}
function clickSquare(i){if(watching||!started||busy||game.winner||isBot())return;if(color(game.board[i])===game.turn){selected=selected===i?-1:i;render();return;}const opts=moves(game).filter(m=>m.from===selected&&m.to===i);if(!opts.length)return;if(opts.length>1){const el=$("ch-promotion-buttons");el.replaceChildren();for(const m of opts){const b=document.createElement("button");b.textContent=({q:"Queen",r:"Rook",b:"Bishop",n:"Knight"})[m.promotion];b.onclick=()=>{$("ch-promotion").close();doMove(m);};el.append(b);}$("ch-promotion").showModal();}else doMove(opts[0]);}
function doMove(m){if(isRemote())void send("move",{move:m});else applyLocal(m);}
async function api(body){const user=auth.currentUser;if(usingLocalFirebaseEmulators||!user?.emailVerified)throw Error("Rated play requires a verified account using Live Firebase. Local practice works without it.");const token=await user.getIdToken();const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:token,...body})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Chess service unavailable. Deploy the current Worker for rated play.");if(auth.currentUser?.uid!==user.uid)throw Error("Account changed.");return d;}
function accept(d){remote=d;accountRatings=d.ratings||initialRatings();if(d.game){serial++;clearTimeout(botTimer);game=d.game;mode=d.mode==="tournament"?"tournament":"rated";level=d.level;side=d.side||"w";started=true;selected=-1;$("ch-mode").value=mode;$("ch-level").value=String(level);$("ch-tournament-level").value=String(level);if(mode!=="tournament")$("ch-color").value=d.colorChoice||side;if(d.tournament)$("ch-format").value=d.tournament.format;}if(watching&&!d.spectator)watching=false;const notes=[];if(d.coinAward)notes.push("+"+d.coinAward+" Star Coins credited");if(d.rewards?.length)notes.push("Unlocked: "+d.rewards.map(label).join(", "));if(notes.length)message(notes.join(" · "));render();}
async function send(action,extra={}){if(busy)return;busy=true;clearTimeout(botTimer);render();const gen=epoch;try{if(!remote){remote=await api({action:"state"});if(gen!==epoch)return;}const body=action==="state"?{action}:{action,revision:remote.revision,requestId:crypto.randomUUID(),...extra};request=body;const d=await api(body);if(gen===epoch){request=null;accept(d);}}catch(e){if(gen===epoch){paused=true;message(e.message);}}finally{if(gen===epoch){busy=false;render();queueBot();}}}
$("ch-start").onclick=()=>{if(busy)return;const m=$("ch-mode").value;level=Number($(m==="tournament"?"ch-tournament-level":"ch-level").value);whiteLevel=Number($("ch-white-level").value);message("");if(m==="tournament"&&selectedEntrants.size!==7){message("Choose seven owned game axolotls first.");return;}watching=false;paused=false;const choice=$("ch-color").value;if(m==="rated"||m==="tournament"){void send("start",{mode:m==="rated"?"pvb":"tournament",level,format:$("ch-format").value,entrants:[...selectedEntrants],...(m==="rated"?{colorChoice:choice}:{})});return;}serial++;clearTimeout(botTimer);mode=m;game=initialChess();started=true;selected=-1;seed=crypto.getRandomValues(new Uint32Array(1))[0];side=m==="pvb"?playerColor(choice,seed):"w";render();queueBot();};
$("ch-resume").onclick=()=>{watching=false;paused=false;void send("state");};
$("ch-next").onclick=()=>{watching=false;paused=false;void send("next");};
$("ch-back-player").onclick=()=>{watching=false;paused=true;clearTimeout(botTimer);render();};
$("ch-resign").onclick=()=>{if(isRemote())void send("resign");else{game={...game,winner:game.turn==="w"?"b":"w",reason:"resigned"};render();}};
$("ch-pause").onclick=()=>{paused=!paused;render();queueBot();};
$("ch-promotion-cancel").onclick=()=>$("ch-promotion").close();$("ch-mode").onchange=render;
$("ch-show-bracket").onclick=()=>{if(!remote?.tournament){message("Start or resume a tournament to see the full bracket.");return;}renderBracket();$("ch-bracket-panel").scrollIntoView({block:"start",behavior:"smooth"});};
$("ch-close-bracket").onclick=()=>$("ch-board-section").scrollIntoView({block:"start",behavior:"smooth"});
$("ch-speed").onchange=queueBot;
for(const [id,prop] of [["ch-light","--ch-light"],["ch-dark","--ch-dark"]])$(id).oninput=()=>$("ch-board").style.setProperty(prop,$(id).value);
for(const id of ["ch-player-avatar","ch-bot-avatar","ch-white-avatar","ch-pvp-avatar","ch-level","ch-tournament-level"])$(id).onchange=render;
const trophyLi=document.createElement("li");trophyLi.textContent=CHESS_TROPHY[1]+": "+CHESS_TROPHY[2];$("ch-unlocks").append(trophyLi);
onAuthStateChanged(auth,user=>{epoch++;busy=false;watching=false;clearTimeout(botTimer);remote=null;accountRatings=initialRatings();owned=[];items=[];trophies=[];selectedEntrants.clear();unsubs.forEach(fn=>fn());unsubs=[];if(isRemote()){game=initialChess();started=false;mode="pvp";}avatars();if(!user)return;const uid=user.uid;for(const [name,update] of [["axolotls",d=>{owned=d;}],["starlightCollectibles",d=>{items=d;}],["trophies",d=>{trophies=d;}]])unsubs.push(onSnapshot(collection(db,"users",uid,name),snap=>{if(auth.currentUser?.uid!==uid||snap.metadata.hasPendingWrites)return;update(snap.docs.map(x=>({id:x.id,...x.data()})));avatars();},()=>message("Collection unavailable. Local matches are still playable.")));if(user.emailVerified&&!usingLocalFirebaseEmulators){const gen=epoch;api({action:"state"}).then(d=>{if(gen===epoch&&!busy&&(!remote||d.revision>=remote.revision)){remote=d;accountRatings=d.ratings;render();}}).catch(()=>{});}});
avatars();
