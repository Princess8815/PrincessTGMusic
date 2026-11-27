import {initialChess,moves,playChess,botMove,inCheck,moveKey} from "./chess-core.mjs";
import {position,coach,coachHint,LESSONS as OLD} from "./chess-academy-core.mjs";
export {position,coach};
export const PASS=80,COURSE_VERSION=1,PROFESSOR_ID="professor-squiggles";
export const DEGREES=[["Associate’s","Learn chess from zero to independent play.",true],["Bachelor’s","Intermediate strategy and opening study.",false],["Master’s","Advanced calculation and positional play.",false],["PhD","Expert research and chess mastery.",false]];
export const SCHOOL_TROPHIES=[
 ["chess-school-foundations","Chess Foundations Medal","Complete the Foundations module.",6],
 ["chess-school-rulebook","Chess Rules Scholar","Complete the Rules and Endings module.",12],
 ["chess-associates-diploma","Associate’s in Chess Diploma","Graduate from Professor Squiggles’ Associate’s course.",15]
];
const E=(fen,prompt,key,hint)=>[fen,prompt,key,hint];
const Q=(q,a,b,c,d)=>[q,a,b,c,d];
const L=(title,teach,example,exercises,quiz,history="",match=null)=>({title,teach,example,exercises,quiz,history,match});
const start="start";
export const LESSONS=[
L("Welcome to the chessboard",[
"Chess is a two-player game. Each player begins with sixteen pieces: eight pawns, two rooks, two knights, two bishops, one queen and one king. White goes first and players alternate one move each.",
"An 8 × 8 board has 64 squares. Files are columns a–h; ranks are rows 1–8. With White at the bottom, a1 is dark and h1 is light. The queen starts on her own color: White d1, Black d8. Kings start beside them on e1/e8.",
"From a1 toward h1: rook, knight, bishop, queen, king, bishop, knight, rook. Pawns fill the next rank. The goal is checkmate, not physically taking a king. Tap a piece, then a highlighted destination. For this first activity we will use a pawn's simple forward step."
],E(start,"Example: the white pawn on a2 steps to a3.","a2a3","a2 is file a, rank 2; a3 is directly ahead."),
[E(start,"Find e2 and move its pawn one square to e3.","e2e3","Look for file e, second rank."),E("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -","Now play Black: move the pawn on d7 to d6.","d7d6","Black advances toward rank 1.")],
[Q("How many squares are on the board?","64","32","81","16"),Q("Who moves first?","White","Black","The winner","Either side"),Q("Which square holds White’s queen initially?","d1","e1","d8","a1"),Q("What is a file?","A column named a–h","A row numbered 1–8","A captured piece","A diagonal"),Q("What is the goal of standard chess?","Checkmate","Capture the king","Capture every pawn","Reach rank eight")],
"Chess probably developed from earlier games in India, including chaturanga, around the sixth century. It traveled through Persia and the Islamic world into Europe, evolving over many centuries. The exact origin is debated."),
L("Pawns: the little foot soldiers",[
"Pawns move straight forward toward the other side: White toward rank 8, Black toward rank 1. They usually move one square. From their original rank they may move two squares only if both are empty.",
"A pawn captures an opposing piece one square diagonally forward. It cannot capture directly ahead, move backward, jump, or move into an occupied square. A pawn reaching the far rank promotes, which we will study later.",
"A pawn is often valued at one point for material comparisons. Its small value does not make it unimportant."
],E(start,"Example: d2 to d4 is a legal first double step.","d2d4","Both d3 and d4 are clear."),
[...OLD[0].exercises,E("4k3/4p3/8/8/8/8/8/4K3 b - -","Move Black’s pawn two squares.","e7e5","Black moves toward smaller rank numbers.")],
[...OLD[0].quiz.slice(2),Q("Which direction does Black advance?","Toward rank 1","Toward rank 8","Toward file h","Any direction"),Q("Can a pawn capture backward?","No","Yes","Only on rank 2","Only after moving twice")],
"The pawn’s earlier relatives represented infantry. The double-step rule appeared later in European chess, leading to en passant."),
L("Rooks: straight lines",[
"The rook moves along a file or rank, any number of clear squares. It cannot turn a corner or jump over pieces. If an enemy stands on its path, the rook may capture it and must stop there; a friendly piece blocks it.",
"Rooks begin on the four corners, a1/h1 and a8/h8. They are commonly worth about five pawns. Open files and ranks make rooks especially useful."
],E("4k3/8/8/8/8/8/R7/4K3 w - -","Example: a2 to d2, a horizontal move.","a2d2","Same rank, clear path."),
[OLD[1].exercises[0],E("4k3/8/8/8/R3p3/8/8/4K3 w - -","Capture the black pawn with the rook.","a4e4","Follow rank 4 until the enemy pawn.")],
[Q("How does the rook move?","Horizontally or vertically","Only diagonally","In an L","One square only"),Q("Can it jump over a pawn?","No","Yes","Only a friendly pawn","Only while capturing"),Q("Where do rooks start?","Corners","Center","Beside queens","Pawn ranks"),Q("Can a rook capture a friendly piece?","No","Yes","Only a pawn","Only when castling"),Q("What is its approximate material value?","Five pawns","One pawn","Nine pawns","Three pawns")],"The rook’s name is historically connected to the Persian rukh, a piece traditionally associated with a chariot."),
L("Bishops: diagonals",[
"Bishops slide diagonally for any distance until blocked. A diagonal changes file and rank by the same amount. A bishop that starts on a light square always remains on light squares; its partner covers dark squares.",
"Each player starts with two bishops beside the knights. Bishops cannot jump or capture friendly pieces. A bishop is typically worth about three pawns."
],E("4k3/8/8/8/8/8/8/2B1K3 w - -","Example: c1 to b2 is diagonal.","c1b2","One file and one rank."),
[OLD[1].exercises[1],E("4k3/8/8/5p2/8/3B4/8/4K3 w - -","Capture the pawn on f5.","d3f5","Two squares up and right.")],
[Q("How does a bishop move?","Diagonally","Along files only","In an L","Like a king only"),Q("Can it change square color?","No","Yes","Only by capturing","Only once"),Q("Can it jump a blocker?","No","Yes","Only a pawn","Only if three squares away"),Q("How many bishops does each side start with?","Two","One","Four","Eight"),Q("Approximate value?","Three pawns","Nine pawns","Five pawns","One pawn")],"Earlier chess variants had an elephant piece with a more limited diagonal move. The modern bishop gained its long-range diagonal movement in late medieval Europe."),
L("Knights: the jumping L",[
"Knights move two squares along one axis and one along the other. They can jump over any intervening piece. Only the destination matters: it may be empty or occupied by an enemy, never a friendly piece.",
"The knight changes square color each move. Knights begin at b1/g1 and b8/g8, and are worth roughly three pawns. They can move immediately in the opening because they can jump over pawns."
],E(start,"Example: b1 jumps to a3.","b1a3","Two ranks and one file."),
[OLD[2].exercises[0],OLD[2].exercises[1],E("4k3/8/8/8/3n4/8/8/4K3 b - -","Move Black’s knight from d4 to c2.","d4c2","Two ranks down and one file left.")],
[Q("What shape is a knight move?","An L","A straight line","A diagonal","A circle"),Q("Can it jump?","Yes","No","Only over enemies","Only from home"),Q("Can a knight land on its own pawn?","No","Yes","Only once","Only in check"),Q("Does a knight change square color?","Yes, every move","Never","Only capturing","Only on the edge"),Q("Can g1 move to f3 from the starting board?","Yes","No","Only after e4","Only after castling")],"Horse-shaped pieces have been part of chess and its ancestors for centuries."),
L("Queens: the versatile piece",[
"The queen combines rook and bishop movement: any distance along a straight rank, file or diagonal. She cannot jump. She stops on the first opposing piece she captures, and friendly pieces block her.",
"A queen is usually worth about nine pawns, but even a queen cannot be traded for a king. Starting squares are d1 for White and d8 for Black. Keep your queen safe."
],E("4k3/8/8/8/8/8/8/3QK3 w - -","Example: d1 to d4 along the file.","d1d4","The queen can move like a rook."),
[OLD[1].exercises[2],E("4k3/8/8/8/3Q3p/8/8/4K3 w - -","Capture the pawn on h4.","d4h4","The queen moves horizontally.")],
[Q("Which moves does a queen combine?","Rook and bishop","Knight and pawn","King and knight","Pawn and bishop"),Q("Can she jump?","No","Yes","Only when capturing","Only diagonally"),Q("White queen starts on?","d1","e1","d8","h1"),Q("Approximate value?","Nine pawns","Three pawns","One pawn","Five pawns"),Q("Can the queen capture the enemy king?","No","Yes","Only after check","Only if undefended")],"The queen became a much stronger piece as modern chess rules developed in Europe in the late fifteenth century."),
L("Kings: keep the crown safe",[
"The king normally moves one square horizontally, vertically or diagonally. It cannot land on an attacked square. Kings cannot stand next to each other because each attacks the surrounding squares.",
"The king is priceless: losing it is not a material trade. An opposing piece that attacks your king gives check. You must never choose a move that leaves your king in check. Castling is a special king move covered later."
],E("4k3/8/8/8/8/8/8/4K3 w - -","Example: e1 to f1, one square.","e1f1","One file to the right."),
[OLD[2].exercises[2],E("8/8/8/4k3/8/4K3/8/8 w - -","Move your king from e3 to d3, keeping it safe.","e3d3","Do not step into the black king’s attack.")],
[Q("How far can a king normally move?","One square","Two squares","Any distance","Only forward"),Q("Can kings touch?","No","Yes","Only diagonally","Only in endgames"),Q("What is check?","An attack on the king","A queen capture","A pawn move","A drawn game"),Q("May a king move into attack?","No","Yes","Only to capture","Only once"),Q("What is the king’s material value?","It is priceless; it cannot be exchanged","One pawn","Five pawns","Nine pawns")],"The word check ultimately comes from the Persian word for king, shah."),
L("Check, escape and pins",[
"If your king is attacked, there are three possible defenses: move the king to safety, capture the checking piece legally, or block a sliding attack. You cannot block a knight attack or an adjacent attacking piece by putting something between.",
"A piece is absolutely pinned if moving it would uncover an attack on its own king. It may still move along the pin line if that keeps the king safe. Every move must leave your king safe."
],E("k3r3/8/8/8/8/8/8/4K3 w - -","Example: move the checked king to f1.","e1f1","Leave the attacked e-file."),
[...OLD[3].exercises,E("k7/8/8/8/8/8/4r3/4K3 w - -","Capture the unprotected checking rook with your king.","e1e2","The rook is not defended.")],
OLD[3].quiz),
L("Castling",[
"Castling is one move involving king and rook. Kingside: White king e1→g1 and rook h1→f1. Queenside: king e1→c1 and rook a1→d1. Black uses rank 8.",
"The king and chosen rook must never have moved, every square between them must be empty, and the king cannot be in check, cross an attacked square, or finish on one. A rook may be attacked; that alone does not prohibit castling."
],E("4k3/8/8/8/8/8/8/R3K3 w Q -","Example: castle queenside, e1 to c1.","e1c1","The rook automatically moves to d1."),
[OLD[4].exercises[0],E("r3k3/8/8/8/8/8/8/4K3 b q -","Castle queenside as Black.","e8c8","King moves two squares toward a8.")],
[OLD[4].quiz[0],OLD[4].quiz[3],OLD[4].quiz[4],Q("May you castle while in check?","No","Yes","Only queenside","Only with a safe rook"),Q("Where does White’s king finish queenside?","c1","d1","b1","g1")],"Castling developed from earlier special king moves and was standardized gradually."),
L("En passant",[
"En passant means in passing. If an enemy pawn advances two squares from its starting rank and ends beside your pawn, your pawn can capture it as if it had advanced only one square.",
"White example: white pawn e5, black pawn d7 moves to d5. White immediately plays e5→d6 and removes the pawn on d5. This right lasts exactly one reply; if you play something else it expires. Your king must still be safe."
],E("4k3/8/8/2pP4/8/8/8/4K3 w - c6","Example: capture in passing from d5 to c6.","d5c6","The black pawn on c5 is removed."),
[OLD[4].exercises[1],E("4k3/8/8/8/3pP3/8/8/4K3 b - e3","Black captures in passing.","d4e3","Black lands on e3 and removes e4.")],
[OLD[4].quiz[1],Q("Which piece can capture en passant?","A pawn","A rook","A king","A knight"),Q("Does the capturing pawn land on the enemy pawn’s current square?","No, it lands on the passed square","Yes","Only for White","Only on rank 5"),Q("What if you make a different reply?","The right expires","It remains for the game","It returns next turn","The pawn promotes"),Q("Can it expose your king to check?","No","Yes","Only if capturing","Only in endgames")],"En passant developed as a response to the pawn’s new two-square first move."),
L("Promotion",[
"When a pawn reaches the farthest rank, it must immediately become a queen, rook, bishop or knight of its own color. It cannot remain a pawn or become a king. You can choose a second queen even if the original is still on the board.",
"A queen is usually strongest, but a knight can sometimes give a unique check or a rook or bishop can avoid stalemate. This is called underpromotion."
],E("4k3/7P/8/8/8/8/8/4K3 w - -","Example: h7 to h8, promote to a rook.","h7h8r","Choose Rook in the promotion dialog."),
[OLD[4].exercises[2],E("4k3/8/8/8/8/8/p7/4K3 b - -","Promote Black’s pawn to a knight.","a2a1n","Choose Knight.")],
[OLD[4].quiz[2],Q("When must a pawn promote?","On reaching its last rank","On reaching the center","After its first capture","Whenever you choose"),Q("Can you have two queens?","Yes","No","Only if the first was captured","Only in practice"),Q("What is underpromotion?","Choosing rook, bishop or knight instead of queen","Leaving the pawn unchanged","Promoting an opponent’s pawn","Castling"),Q("Which rank promotes a Black pawn?","1","8","7","2")]),
L("Ending a game: mate, stalemate and draws",[
"Checkmate is a king in check with no legal response. A game ends immediately; the king is not captured. Stalemate is when the player to move has no legal move but is NOT in check. In standard chess it is a draw.",
"Standard chess also has draws by agreement, dead positions, and rules for repeated positions or long periods without pawn moves or captures. A player may resign to concede. A timed game can end on time; exact draw and time rules are in the FIDE handbook.",
"Axolotl Chess deliberately differs: stalemate counts as victory for the trapping player, and long games use a house move-limit decision. In these lessons we teach standard rules as well as identifying the site’s behavior."
],E("k7/8/1QK5/8/8/8/8/8 w - -","Example: queen to b7 gives checkmate.","b6b7","The king protects the queen and escape squares are covered."),
[OLD[7].exercises[1],OLD[7].exercises[2],E("k7/8/2K5/1Q6/8/8/8/8 w - -","Deliver checkmate with the queen on b7.","b5b7","The king on c6 protects b7.")],
[Q("Checkmate means?","In check with no legal response","No legal move but not in check","Any check","Taking the king"),Q("Standard stalemate result?","Draw","Win for trapping side","Win for trapped side","Restart"),Q("Axolotl Chess stalemate result?","Win for trapping side","Standard draw","Win for trapped side","Restart"),Q("What is resignation?","Voluntarily conceding","A pawn promotion","A castle","An opening"),Q("Is a king ever physically captured?","No","Yes","Only in checkmate","Only by queen")],"Stalemate’s treatment varied historically before the modern draw rule became established."),
L("Your opening and the language of chess",[
"Develop your pieces, fight for the center (d4, e4, d5, e5), and prepare to castle. Avoid moving one piece repeatedly or bringing your queen out before it is safe. Before every turn ask what the opponent threatens.",
"Algebraic notation uses square names. e4 means a pawn moves to e4; Nf3 means a knight moves to f3. K, Q, R, B and N stand for king, queen, rook, bishop and knight. x denotes a capture; + means check, # means checkmate, O-O kingside castle and O-O-O queenside castle.",
"Play the guided opening laboratory. Squiggles checks legal moves and offers suggestions, then replies as the opponent. Several good moves may exist."
],E(start,"Example: e2 to e4 contests the center.","e2e4","A central pawn opens lines for other pieces."),
OLD[5].exercises,[Q("Which squares form the center?","d4 e4 d5 e5","a1 h1 a8 h8","a4 b4 g4 h4","c1 d1 e1 f1"),Q("What does Nf3 mean?","Knight to f3","Pawn to f3","Bishop to f3","Queen to f3"),Q("What does + mean?","Check","Capture","Checkmate","Castling"),Q("What is O-O?","Kingside castling","A draw","A queen move","Promotion"),Q("Why develop pieces?","Give them useful activity and prepare king safety","Move only the queen","Avoid all central squares","Trade every pawn")],"Algebraic notation became the international standard; older books may use descriptive notation.",{level:1,turns:8,opening:true}),
L("Tactics, defense and material",[
"Before moving, look for the opponent’s checks, captures and threats. A hanging piece can be captured without adequate compensation. A fork attacks two targets; a pin restricts movement; a skewer forces a valuable piece away to expose another.",
"Approximate piece values are pawn 1, knight and bishop 3, rook 5, queen 9. They are guides, not rules. A checkmate wins regardless of material. Look at the opponent’s reply before deciding whether a capture is safe."
],E("4k3/8/8/5q2/8/4N3/8/4K3 w - -","Example: knight e3 captures the undefended queen on f5.","e3f5","Check the queen’s defenders first."),
OLD[6].exercises.slice(1),OLD[6].quiz),
L("Graduation laboratory",[
"You have learned all six pieces, special moves, king safety, notation, basic openings and game endings. Review any lesson if you need more practice. During the final laboratory, find legal safe moves, watch for threats, and coordinate your pieces.",
"Complete the board exercises, then a coached match and cumulative quiz. To graduate, you must also win a full unassisted difficulty-1 exam match against Professor Squiggles. Squiggles will let you try again when a move creates a serious tactical problem. This is a beginner course, not an official chess rating or accredited degree."
],E("k7/8/1QK5/8/8/8/8/8 w - -","Example: queen b6 to b7 is checkmate.","b6b7","Check all of Black’s possible responses."),
[OLD[7].exercises[0],E("4k3/8/8/3q4/8/8/3R4/4K3 w - -","Find the safe capture of the queen.","d2d5","Rook on d2 can capture up the file."),E("4k3/8/8/3pP3/8/8/8/4K3 w - d6","Show that you remember en passant.","e5d6","Capture on the passed square."),E("4k3/8/8/8/8/8/8/4K2R w K -","Show that you remember castling.","e1g1","King two squares toward the rook.")],
[Q("Which piece alone can jump normally?","Knight","Rook","Bishop","Queen"),Q("Can a move leave your own king in check?","No","Yes","Only when capturing","Only if ahead in material"),Q("A pawn on rank 8 must become?","Queen, rook, bishop or knight","A king","A pawn","Any enemy piece"),Q("Standard stalemate means?","Draw","Checkmate","A captured king","A win for trapping side"),Q("What is a useful opening plan?","Center, development and king safety","Move the queen every turn","Ignore opponent threats","Move all edge pawns"),Q("What does N mean in notation?","Knight","King","Pawn","Queen"),Q("When can you capture en passant?","Immediately after a qualifying double step","Any future turn","Only after castling","After promotion"),Q("Can you castle through an attacked square?","No","Yes","Only if rook is safe","Only queenside"),Q("What is a fork?","One piece attacking multiple targets","A draw","A pawn double step","A rook move"),Q("What ends standard chess with a winner on the board?","Checkmate","Stalemate","Capturing all pawns","A check alone")],"",{level:3,turns:12,opening:false})
];
export const MODULES=[["Foundations",0,7],["Rules and Endings",7,12],["Independent Play",12,15]];
// Foundations reward includes the king; all milestones use counts, not score totals.
SCHOOL_TROPHIES[0][3]=7;
export const EXAM_LEVEL=1;
export const graduated=s=>passed(s)&&s.exam?.passed===true;
export const passed=(s,n=LESSONS.length)=>s.best.slice(0,n).length===n&&s.best.slice(0,n).every(g=>Number.isFinite(g)&&g>=PASS);
export function initialCourse(){return {version:COURSE_VERSION,revision:0,unlocked:0,best:LESSONS.map(()=>null),attempts:LESSONS.map(()=>0),lesson:0,exercise:0,phase:"study",match:null,quizAttempt:0,feedback:"Welcome to Chess School! Read the lesson, watch the example, then practice.",lastGrade:null,exam:{attempts:0,passed:false,game:null,result:null,seed:0}};}
function shuffle(n,seed){const a=Array.from({length:n},(_,i)=>i);let x=seed>>>0||1;for(let i=n-1;i>0;i--){x^=x<<13;x^=x>>>17;x^=x<<5;const j=(x>>>0)%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
export function quizView(s){return LESSONS[s.lesson].quiz.map((q,i)=>({question:q[0],options:shuffle(4,Math.imul(s.quizAttempt+1,7919)+i*101+s.lesson*37).map(j=>({id:j,label:q[j+1]}))}));}
export function publicCourse(s){const l=LESSONS[s.lesson],ex=s.phase==="exercise"?l.exercises[s.exercise]:null;return {version:s.version,revision:s.revision,unlocked:s.unlocked,best:s.best,attempts:s.attempts,lesson:s.lesson,exercise:s.exercise,exerciseCount:l.exercises.length,phase:s.phase,feedback:s.feedback,lastGrade:s.lastGrade,completed:graduated(s),examUnlocked:passed(s),exam:{level:EXAM_LEVEL,attempts:s.exam?.attempts||0,passed:s.exam?.passed===true,result:s.exam?.result||null,active:!!s.exam?.game&&!s.exam.game.winner&&!s.exam.result},board:ex?position(ex[0]):s.phase==="match"?s.match.game:s.phase==="exam"?s.exam.game:null,prompt:ex?.[1]||null,match:s.phase==="match"?{turns:s.match.turns,target:l.match.turns,mistakes:s.match.mistakes}:null,quiz:s.phase==="quiz"?quizView(s).map(q=>({question:q.question,options:q.options.map(o=>({label:o.label}))})):null};}
export function courseAction(prior,input){
 const s=JSON.parse(JSON.stringify(prior)),l=LESSONS[s.lesson],action=input.action;
 s.exam??={attempts:0,passed:false,game:null,result:null,seed:0};
 const enterQuiz=()=>{s.phase="quiz";s.quizAttempt++;s.feedback="Time for your quiz. Score at least 80% to pass.";};
 const afterExercises=()=>{if(l.match){s.phase="match";s.match={game:initialChess(),turns:0,mistakes:0,seed:Math.imul(s.revision+1,347)+s.lesson};s.feedback="Guided match: consider your opponent’s threats before moving.";}else enterQuiz();};
 if(action==="exam-start"){
  if(!passed(s))throw Error("Pass every lesson before attempting the final exam.");
  if(s.exam.passed)throw Error("You already graduated.");
  if(!s.exam.game||s.exam.result){s.exam.attempts++;s.exam.game=initialChess();s.exam.result=null;s.exam.seed=Math.imul(s.revision+1,7919)^Math.imul(s.exam.attempts,347);}
  s.phase="exam";s.feedback="Final exam: defeat Professor Squiggles at difficulty 1. Play as White; no coaching or takebacks.";
 }
 else if(action==="exam-resign"){
  if(s.phase!=="exam"||!s.exam.game||s.exam.result)throw Error("No active exam.");
  s.exam.result="resigned";s.phase="exam-results";s.feedback="Exam not passed. You can retry without repeating lessons.";
 }
 else if(action==="move"&&s.phase==="exam"){
  const g=s.exam.game;
  if(!g||g.winner||s.exam.result||g.turn!=="w")throw Error("No active exam move.");
  const m=moves(g).find(x=>moveKey(x)===input.move);
  if(!m)throw Error("Illegal move. Keep your king safe.");
  let next=playChess(g,m);
  if(!next.winner){const bot=botMove(next,EXAM_LEVEL,s.exam.seed);if(!bot)throw Error("No bot move.");next=playChess(next,bot);}
  s.exam.game=next;
  if(next.winner){s.exam.passed=next.winner==="w";s.exam.result=s.exam.passed?"won":"lost";s.phase="exam-results";s.feedback=s.exam.passed?"Congratulations! You defeated Professor Squiggles and earned your Associate’s in Chess.":"Professor Squiggles won this attempt. Review any lesson and try again.";}
  else s.feedback=inCheck(next)?"You are in check.":"Your turn.";
 }
 else if(action==="lesson"){if(!Number.isInteger(input.lesson)||input.lesson<0||input.lesson>=LESSONS.length||input.lesson>s.unlocked)throw Error("Pass the previous lesson first.");s.lesson=input.lesson;s.exercise=0;s.phase="study";s.match=null;s.lastGrade=null;s.feedback="Read the lesson and try the example before beginning practice.";}
 else if(action==="begin"&&s.phase==="study"){s.phase="exercise";s.feedback="Try the exercises. Ask Squiggles if you need a clue.";}
 else if(action==="hint"){if(s.phase==="exercise")s.feedback=l.exercises[s.exercise][3];else if(s.phase==="match")s.feedback=coachHint(s.match.game,l.match.opening);else throw Error("Hints are available during practice.");}
 else if(action==="move"&&s.phase==="exercise"){const e=l.exercises[s.exercise],g=position(e[0]),m=moves(g).find(x=>moveKey(x)===input.move);if(!m||moveKey(m)!==e[2])s.feedback="Not quite. "+e[3]+" Try again.";else{s.exercise++;s.feedback="Nicely done!";if(s.exercise===l.exercises.length)afterExercises();}}
 else if(action==="move"&&s.phase==="match"){
  const g=s.match.game,rated=coach(g,l.match.opening),choice=rated.find(x=>moveKey(x.m)===input.move);
  if(!choice||choice.score<rated[0].score-6){s.match.mistakes++;s.feedback="That move may leave an opening for your opponent. "+coachHint(g,l.match.opening)+" Try again.";}
  else{let next=playChess(g,choice.m);s.match.turns++;if(!next.winner){const bot=botMove(next,l.match.level,s.match.seed);if(bot)next=playChess(next,bot);}s.match.game=next;
   if(next.winner==="w"||!next.winner&&s.match.turns>=l.match.turns){enterQuiz();s.feedback="Guided practice passed! Time for the quiz.";}
   else if(next.winner==="b"){s.phase="match-retry";s.feedback="The opponent won. Review and retry the practice match.";}
   else s.feedback=inCheck(next)?"You are in check. Find a legal escape.":"Good move. Check your opponent’s threats before continuing.";
  }
 }
 else if(action==="retry-match"&&s.phase==="match-retry")afterExercises();
 else if(action==="quiz"&&s.phase==="quiz"){
  if(!Array.isArray(input.answers)||input.answers.length!==l.quiz.length||input.answers.some(x=>!Number.isInteger(x)||x<0||x>3))throw Error("Answer every question.");
  const view=quizView(s),results=l.quiz.map((q,i)=>({question:q[0],correct:view[i].options[input.answers[i]].id===0,answer:q[1]}));
  const grade=Math.round(results.filter(r=>r.correct).length/results.length*100);s.lastGrade={grade,results};s.attempts[s.lesson]++;s.best[s.lesson]=Math.max(s.best[s.lesson]??0,grade);if(grade>=PASS)s.unlocked=Math.max(s.unlocked,Math.min(LESSONS.length-1,s.lesson+1));s.phase="results";s.feedback=grade>=PASS?(passed(s)?"All lessons passed! Your final exam is now available.":"You passed! Continue or try again to improve your grade."):"Review the lesson, then retry. You need 80% to advance.";
 }
 else if(action==="retry-quiz"&&s.phase==="results")enterQuiz();
 else throw Error("Complete the current section first.");
 s.revision++;return s;
}
