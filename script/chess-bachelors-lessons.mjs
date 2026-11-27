const L=(title,teach,example,exercises,quiz,match=null)=>({title,teach,example,exercises,quiz,match,history:""});
const E=(fen,prompt,key,hint)=>[fen,prompt,key,hint];
const Q=(q,a,b,c,d)=>[q,a,b,c,d];
const open="rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -";
const italian="r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -";
const pin="4k3/8/4n3/8/8/8/R7/4K3 w - -";
const mate="k7/8/1QK5/8/8/8/8/8 w - -";
export const BACHELOR_LESSONS=[
L("Opening strategy: center, tempo and development",[
"An opening is not a memorization contest. Develop minor pieces to useful squares, contest the center, and prepare king safety. A tempo is one move; gaining a tempo means improving a piece while forcing a useful response.",
"Direct central occupation (e4 or d4) and indirect pressure (a knight on f3 or bishop on g2) are both useful. Avoid moving a piece repeatedly without a purpose. Compare candidate moves by activity, safety and what your opponent can do next.",
"On every turn, identify threats, choose candidate moves, calculate the strongest reply and decide."],
E(open,"Develop with tempo: attack e5 with the knight.","g1f3","Nf3 develops a piece and attacks e5."),
[E("start","Claim central space with the queen’s pawn.","d2d4","d4 controls c5 and e5."),E(italian,"Develop the bishop toward f7.","f1c4","Bc4 develops on an active diagonal.")],
[Q("What is a tempo?","A move or unit of time","A pawn structure","A forced draw","A piece value"),Q("Why develop minor pieces?","Improve activity and control the center","Avoid castling","Capture the king","Move only pawns"),Q("Nf3 after e4 e5 does what?","Develops and attacks e5","Wins a queen","Forces mate","Promotes"),Q("When is moving a piece twice justified?","When the position gives a concrete reason","Never","Always","Only after castling"),Q("Before choosing a move consider?","Opponent threats","Move number alone","Opening name","Queen color")]),
L("Opening families and adapting plans",[
"The Italian Game begins 1.e4 e5 2.Nf3 Nc6 3.Bc4. The Ruy Lopez uses 3.Bb5 to pressure the defender of e5. The Queen’s Gambit begins 1.d4 d5 2.c4, challenging Black’s central pawn.",
"Black can respond to e4 with the Sicilian Defense (c5), contesting d4 from the flank; against d4, Nf6 develops and contests e4. Openings are plans, not compulsory scripts. Do not follow a memorized move when the opponent creates an urgent threat.",
"After development, identify the pawn structure and select a useful improvement or pawn break."],
E(italian,"Choose the Ruy Lopez bishop move.","f1b5","Bb5 pressures the knight defending e5."),
[E("rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -","Challenge d5 with the Queen’s Gambit.","c2c4","c4 attacks d5."),E("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -","As Black, begin the Sicilian Defense.","c7c5","c5 contests d4.")],
[Q("Italian bishop goes to?","c4","b5","g2","a3"),Q("Queen’s Gambit challenges?","Black’s d5 pawn","Black’s h7 pawn","White’s king","The a8 rook"),Q("Sicilian reply to e4?","c5","e5","d5","h5"),Q("Opponent deviates from theory?","Respond to the position","Follow the book blindly","Resign","Restart"),Q("Ruy Lopez bishop pressures?","The c6 knight","The a1 rook","The e1 king","The h2 pawn")]),
L("King safety and prophylaxis",[
"Prophylaxis means anticipating and restricting the opponent’s plan before it becomes dangerous. Ask what they would do if you passed your turn. Prevent a threat while improving your position.",
"Castling often gives safety and activates a rook. A weak back rank can allow mate; making a flight square can help, but unnecessary pawn moves weaken the king’s shelter.",
"Defend actively where possible. A counterthreat may work better than passive defense, but calculate before relying on it."],
E("4k3/8/8/8/8/8/5PPP/4K2R w K -","Castle and activate the rook.","e1g1","King goes to g1, rook to f1."),
[E("4k3/8/8/8/8/8/5PPP/6K1 w - -","Create a flight square on h2.","h2h3","After h3, h2 is available if safe."),E("4k3/8/8/8/8/8/4q3/4K3 w - -","Remove the immediate threat: capture the undefended checking queen.","e1e2","A king may capture an undefended attacker.")],
[Q("Prophylaxis means?","Anticipate and restrict threats","Always sacrifice","Never trade","Only checkmate"),Q("Why create a flight square?","Reduce back-rank danger","Promote immediately","Force castling","Gain a queen"),Q("Priority threat?","Concrete threat to your king","Distant harmless pawn","Opening name","Decorative move"),Q("Pawn moves near king may?","Weaken shelter","Remove king","Always lose material","Forbid rooks"),Q("Ideal defense?","Stop threat and improve position","Ignore threat","Lose a piece","Always move queen")]),
L("Pawn structures and breaks",[
"An isolated pawn has no friendly pawns on adjacent files. Doubled pawns share a file. These can be weaknesses but may offer activity. A pawn chain has a base and tip; attacking its base may undermine it.",
"A passed pawn has no opposing pawn ahead on its own or neighboring files. A pawn break challenges a structure, often opening lines. Calculate exchanges first because pawn moves cannot be undone.",
"Choose a plan based on the structure: target a weakness, create a passer, or open a file for a rook."],
E("4k3/8/8/3p4/3P4/2P5/8/4K3 w - -","Challenge the black central pawn with c4.","c3c4","c4 attacks d5."),
[E("4k3/8/8/3p4/4P3/8/8/4K3 w - -","Exchange central pawns to open lines.","e4d5","Capture diagonally."),E("4k3/8/4P3/8/8/8/8/4K3 w - -","Advance the passed e-pawn.","e6e7","No enemy pawn can stop it.")],
[Q("A pawn break?","Challenges a structure","Guarantees mate","Restores a piece","Moves the king"),Q("Isolated pawn has?","No friendly adjacent-file pawns","Two nearby friendly pawns","Queen on its file","No moves"),Q("Passed pawn has?","No enemy pawns ahead on own or adjacent files","No friendly pieces","Always a rook behind it","No captures"),Q("Common pawn-chain target?","The base","King’s home","Last moved knight","Board edge"),Q("Why calculate a break?","Pawn moves change structure permanently","Pawns move backward","Breaks illegal","Every break wins")]),
L("Piece activity, outposts and open files",[
"An outpost is a stable square in enemy territory, often pawn-protected and hard for enemy pawns to challenge. Knights thrive on outposts; bishops on open diagonals; rooks on open files.",
"An open file has no pawns; a half-open file has no pawn of your side. Put a rook on a useful file and look for entry squares.",
"Improve your least active piece. Space matters when you can use it; exchanges can relieve a cramped position."],
E("4k3/8/8/8/2P5/2N5/8/4K3 w - -","Place the knight on the pawn-supported d5 outpost.","c3d5","c4 supports d5."),
[E("4k3/8/8/8/8/8/P7/R3K3 w - -","Put the rook on the open d-file.","a1d1","The d-file has no pawns."),E("4k3/8/8/8/8/8/8/2B1K3 w - -","Activate the bishop on the h6 diagonal.","c1h6","The diagonal is open.")],
[Q("Good outpost?","Stable against enemy pawn attacks","Any corner","King’s square","Any undefended pawn"),Q("Open file contains?","No pawns","Only friendly pawns","Only enemy pawns","A queen"),Q("Rooks work best on?","Open or half-open files","Blocked files","Only home squares","Knight outposts"),Q("Improve which piece?","Least active piece","Always queen","Always king","Only pawn"),Q("Exchanges in cramped position may?","Relieve lack of space","Always lose","Prevent castling","Remove all weaknesses")]),
L("Forks and double attacks",[
"A double attack creates two simultaneous threats. A knight fork is effective because its attacks cannot be blocked; a pawn or queen can also fork pieces.",
"Look for forcing moves: checks, captures and threats. Verify whether the opponent can capture your attacking piece or neutralize both threats.",
"Calculate one move beyond the fork: what will you take after the opponent saves the most valuable target?"],
E("4k3/8/8/7q/4N3/8/8/4K3 w - -","Fork king and queen with a knight check.","e4f6","Nf6 checks e8 and attacks h5."),
[E("4k3/8/8/1q6/4N3/8/8/4K3 w - -","Fork king e8 and queen b5.","e4d6","Nd6 checks e8 and attacks b5."),E("4k3/8/8/5q2/8/4N3/8/4K3 w - -","Capture the undefended queen.","e3f5","Take the queen with the knight.")],
[Q("A fork attacks?","Two or more targets","Only a pawn","Only a king","No pieces"),Q("Knight check can be blocked?","No","With a pawn","With any piece","With a rook"),Q("Before forking, check?","Whether attacker can be captured","Opening name","Previous game","Only material"),Q("Forcing move can be?","Check, capture or threat","Only pawn move","Only castle","Only retreat"),Q("After a fork calculate?","Best reply and follow-up","Only first move","Nothing","Random move")]),
L("Pins, skewers and overloaded defenders",[
"An absolute pin is against a king; a relative pin is against a valuable piece, and the pinned piece may legally move. A skewer attacks the valuable front piece to expose the piece behind.",
"An overloaded defender has too many jobs. Remove or deflect a defender before taking its target. Remember a pinned piece may still attack squares that a king cannot enter.",
"Distinguish a pin from a skewer by the order of targets."],
E(pin,"Pin the knight on the e-file.","a2e2","Re2 pins the knight on e6 to its king."),
[E("4k3/8/4b3/8/8/8/R7/4K3 w - -","Pin the bishop to its king.","a2e2","The bishop cannot leave the e-file."),E("4q3/4k3/8/8/8/8/R7/4K3 w - -","Skewer the king and queen.","a2e2","Check the king; the queen behind becomes a target.")],
[Q("Absolute pin is against?","King","Pawn","Empty square","Knight"),Q("Relatively pinned piece can move?","Yes if king stays safe","Never","Only backward","Only captures"),Q("Skewer attacks?","Valuable front piece with another behind","Separate lines","Only pawns","Only bishop"),Q("Overloaded defender?","Defends multiple important targets","Has no moves","Always king","Always pawn"),Q("Pinned attacks matter to?","King entering attacked square","Move counter","Only promotion","No one")]),
L("Discovered attacks and forcing combinations",[
"A discovered attack occurs when a piece moves away and reveals a sliding attack behind it. A discovered check forces a response. Double check requires a king move.",
"A combination is a sequence of forcing moves, sometimes a sacrifice. Calculate the strongest defense rather than assuming cooperation.",
"Look behind your own pieces: moving a knight can uncover a rook or bishop attack while creating a second threat."],
E("4k3/8/8/8/4N3/8/8/4RK2 w - -","Uncover the rook’s check with a knight move.","e4f6","The rook and knight both attack e8."),
[E("4k3/8/8/8/4N3/8/8/4RK2 w - -","Create double check on e8 from d6.","e4d6","Both rook and knight check."),E("7k/8/8/8/8/2N5/8/B3K3 w - -","Uncover the bishop’s long-diagonal check.","c3b5","Moving the knight opens a1–h8.")],
[Q("Discovered attack created by?","Moving a blocking piece from a sliding line","Castling every turn","Pawn backward","Trading kings"),Q("Double check requires?","King move","Block one attack","Random pawn","Capture queen always"),Q("Calculate in a combination?","Strongest legal defense","Expected mistake","Only first move","Rating"),Q("Sacrifice when?","Calculation or compensation justifies it","Whenever possible","Only after losing","Never"),Q("Benefit of discovered check?","Force reply while another piece attacks","Allows illegal moves","Creates second king","Promotes")]),
L("Trading and converting an advantage",[
"When ahead in material, exchanges often reduce counterplay, but do not trade into a drawn or lost ending. When behind, seek activity and practical threats.",
"Compare the resulting position, not just the immediate capture. A rook for a minor piece is the exchange; queen for two rooks can be reasonable depending on activity.",
"Consider material, king safety, passed pawns and remaining activity before trading."],
E("4k3/8/8/3q4/8/8/3Q4/4K3 w - -","Capture the undefended queen.","d2d5","Take material when the reply cannot recover it."),
[E("4k3/8/8/8/3r4/8/3R4/4K3 w - -","Capture the opposing rook.","d2d4","The file is clear."),E("4k3/8/8/5r2/8/4N3/8/4K3 w - -","Win the undefended rook with your knight.","e3f5","A knight is worth less than a rook.")],
[Q("When ahead, exchanges often?","Reduce counterplay","Always defeat","Increase enemy material","Immediately end game"),Q("Before trading consider?","Resulting position","Only captured piece","Move number","Opening"),Q("Rook vs minor piece roughly?","Five vs three pawns","One vs nine","Nine vs five","Equal by rule"),Q("When behind seek?","Activity and practical chances","Automatic exchanges","No threats","Resignation"),Q("Why avoid blind exchanges?","Resulting ending may be drawn or lost","Exchanges illegal","Queens cannot trade","Only pawns matter")]),
L("King activity and pawn endgames",[
"In an endgame, the king becomes active. Opposition occurs with kings facing each other and one square between; the player not obliged to move may control access to key squares.",
"The rule of the square estimates whether a king can catch a passed pawn: form a square from the pawn to its promotion rank. Account for whose turn it is and the initial double step.",
"Calculate promotion races exactly and escort passed pawns with the king when necessary."],
E("8/8/8/4k3/8/4K3/4P3/8 w - -","Bring your king toward the pawn’s path.","e3d3","Stay active without entering attack."),
[E("8/8/8/8/4k3/8/4P3/4K3 w - -","Move king to d2 to support your pawn.","e1d2","Approach safely."),E("7k/8/4P3/8/8/8/8/K7 w - -","Push the passed pawn toward promotion.","e6e7","Black’s king is too far to stop it.")],
[Q("Opposition?","Kings face with one square between","Kings touch","Opposite corners","King captures king"),Q("Endgame king should often?","Become active","Stay home","Never move","Only castle"),Q("Square rule estimates?","Whether king catches passed pawn","Rook value","Castling legality","Queen fork"),Q("Promotion races require?","Counting moves and whose turn","Guessing material","Ignoring double steps","Never moving pawns"),Q("Escorting king helps?","Support pawn advance","Prevent all captures","Create a pawn","Reset moves")]),
L("Rook and queen endgame technique",[
"Place a rook behind a passed pawn when appropriate; it supports the pawn or attacks an opposing passer from behind. Active rooks and king activity often matter more than a pawn.",
"With a queen or rook against a lone king, restrict the opposing king to a small area, then bring your king closer. Avoid accidental stalemate in standard chess; this site counts stalemate as victory.",
"Finish with a protected mating piece or a rook covering the final rank while your king controls escapes."],
E(mate,"Finish queen and king versus king.","b6b7","The protected queen covers the escapes."),
[E("k7/8/1K6/8/8/8/8/7R w - -","Deliver rook mate along rank eight.","h1h8","Your king controls a7 and b7."),E("4k3/8/4P3/8/8/8/R7/4K3 w - -","Place rook behind the passed pawn.","a2e2","Support the pawn from the rear.")],
[Q("Rook often belongs where?","Behind a passed pawn","Always ahead","Only h1","Only a8"),Q("Queen vs king finish?","Restrict king and coordinate own king","Chase checks forever","Sacrifice queen","Capture king"),Q("Standard stalemate?","Draw","Trapping side wins","Promotion","Castle"),Q("Endgame rook should be?","Active","Blocked","Never moved","Exchanged instantly"),Q("Before mating verify?","All escapes and captures","Only material","Only name","Only clock")]),
L("Strategy laboratory",[
"Combine opening, middlegame and endgame thinking: identify the threat, inspect forcing moves, evaluate structure and activity, then choose a plan. Reevaluate after every reply.",
"Use the guided game to practice safe, purposeful moves. The coach is a tactical heuristic, not a grandmaster. Its suggested moves are not the only good plans.",
"Pass the cumulative quiz and beat Professor Wiggleworts in a complete, unassisted difficulty-4 match."],
E(open,"Develop while pressuring the center.","g1f3","Develop and attack e5."),
[E(pin,"Find the absolute pin.","a2e2","Pin the knight on e6."),E(mate,"Convert the winning position with checkmate.","b6b7","Protect the queen and cover escapes.")],
[Q("First step in a strategic decision?","Identify threats","Move queen instantly","Copy last game","Ignore board"),Q("Useful positional plan?","Improve worst piece","Only move king","Sacrifice blindly","Avoid center"),Q("Pawn break changes?","Pawn structure and lines","Board size","Piece names","Turn order"),Q("Forcing sequence must consider?","Best defense","Desired reply","Only values","Only checks"),Q("When ahead trade if?","Resulting position favorable","Always","Never","Only queens"),Q("In rook ending prioritize?","Activity and passed pawns","Never move king","Pawn count alone","Castling"),Q("Outpost should be?","Stable against enemy pawn attacks","On edge","Occupied by enemy king","Unreachable"),Q("Final exam?","Beat Wiggleworts at difficulty 4","Finish twelve moves","Draw level 1","One quiz")],{level:3,turns:10,opening:true})
];
export const BACHELOR_MODULES=[["Strategic Foundations",0,5],["Tactical Combinations",5,8],["Conversion and Endgames",8,12]];
