import {auth,usingLocalFirebaseEmulators} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {PASS,DEGREES,COURSES,position} from "./chess-school-core.mjs";
import {watchStaffRole,verifyStaff} from "./staff-auth.js";
import {moves,moveKey,color,square,inCheck,playChess} from "./chess-core.mjs";
import {axolotlPortrait} from "./reef-collection.js";
const $=id=>document.getElementById(id),G={K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙",k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟︎"};
const endpoint="https://princesstg-cd-store-live.transgirl1991.workers.dev/games/chess";
let course=COURSES.associates,adminTest=false,staff=false,associateCompleted=false,catalogBusy=true,catalogError="",menuEpoch=0;
const localCourses=new Map();
let local=course.initialCourse(),data=course.publicCourse(local),selected=-1,busy=true,remote=false,ready=false,connectionError="",actionError="",epoch=0,answers=[],quizKey="",exampleLesson=-1,examplePlayed=false;

function element(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function renderExample(){
 const l=course.LESSONS[data.lesson],e=l.example;if(exampleLesson!==data.lesson){exampleLesson=data.lesson;examplePlayed=false;}
 const before=position(e[0]),move=moves(before).find(m=>moveKey(m)===e[2]),g=examplePlayed&&move?playChess(before,move):before;
 $("academy-example-prompt").textContent=e[1];$("academy-example-feedback").textContent=examplePlayed?e[3]:"Select Show the move to see the piece travel to its destination.";
 $("academy-example-move").disabled=examplePlayed||!move;$("academy-example-reset").disabled=!examplePlayed;
 const board=$("academy-example-board");board.replaceChildren();
 for(let i=0;i<64;i++){const cell=element("div","");cell.className="ch-square ptg-theme-exempt"+(((i>>3)+i%8)%2?" dark":"")+(color(g.board[i])==="b"?" black-piece":"")+(move&&(examplePlayed?move.to:move.from)===i?" selected":"");const piece=element("span",G[g.board[i]]||"");piece.className="ch-piece";cell.append(piece);if(i%8===0){const rank=element("span",square(i)[1]);rank.className="ch-coord ch-rank";cell.append(rank);}if(i>=56){const file=element("span",square(i)[0]);file.className="ch-coord ch-file";cell.append(file);}board.append(cell);}
 board.setAttribute("aria-label",e[1]+" "+(examplePlayed?"After move.":"Before move."));
}
const degreeGrid=$("academy-degrees");
function renderDegrees(){
 degreeGrid.replaceChildren();
 DEGREES.forEach(([name,description,available,instructor],i)=>{
  const id=i===0?"associates":i===1?"bachelors":null,allowed=available&&(id==="associates"||associateCompleted);
  const card=element("article","");card.className="academy-degree"+(allowed?" active":"");
  card.append(element("h3",name),element("p",description),element("p",instructor?"Instructor: "+instructor:"Instructor to be announced"));
  const button=element("button",!available?"Coming later":allowed?"Enter course":catalogBusy?"Checking prerequisite…":"Associate’s required");button.type="button";button.disabled=!allowed||busy&& !$("academy-associates").hidden;
  if(allowed)button.onclick=()=>openCourse(id,false);
  card.append(button);
  if(available&&staff){const admin=element("button","Admin access · Test only");admin.type="button";admin.onclick=async()=>{admin.disabled=true;const uid=auth.currentUser?.uid;if(await verifyStaff()&&uid&&auth.currentUser?.uid===uid&&staff)openCourse(id,true);else{$("academy-catalog-status").textContent="Administrator access could not be verified.";admin.disabled=false;}};card.append(admin);}
  degreeGrid.append(card);
 });
 $("academy-catalog-status").textContent=catalogError||(!auth.currentUser?"Sign in and complete the Associate’s to unlock the Bachelor’s.":catalogBusy?"Checking course eligibility…":"");
 $("academy-catalog-retry").hidden=!catalogError;
}
async function refreshCatalog(){
 const gen=++menuEpoch;associateCompleted=false;catalogError="";catalogBusy=!!auth.currentUser?.emailVerified&&!usingLocalFirebaseEmulators;renderDegrees();
 if(!catalogBusy)return;
 try{const d=await api("catalog",{},COURSES.associates);if(gen===menuEpoch)associateCompleted=d.associateCompleted;}
 catch(e){if(gen===menuEpoch)catalogError=e.message;}
 finally{if(gen===menuEpoch){catalogBusy=false;renderDegrees();}}
}
function openCourse(id,test=false){
 if(!COURSES[id]||(!test&&id==="bachelors"&&!associateCompleted)||test&&!staff)return;
 ++epoch;course=COURSES[id];adminTest=test;local=course.initialCourse();data=course.publicCourse(local);selected=-1;answers=[];quizKey="";exampleLesson=-1;examplePlayed=false;
 $("academy-associates").hidden=false;$("academy-programs").hidden=true;
 $("academy-degree-title").textContent=course.degree+" in Chess";$("academy-professor-name").textContent=course.professor;
 $("academy-professor-description").textContent=course.degree+" instructor · "+(id==="associates"?"Learn the basics of chess, one lesson at a time.":"Learn to plan ahead, spot tactical opportunities and convert advantages.");
 $("academy-portrait").innerHTML=axolotlPortrait(course.professorId);
 $("academy-hint").textContent="Ask "+course.professor.replace("Professor ","");
 $("academy-history").open=false;
 if(test||!auth.currentUser?.emailVerified||usingLocalFirebaseEmulators)startLocal();else void loadSaved();
}
function returnToDegrees(){
 ++epoch;adminTest=false;busy=false;ready=false;remote=false;connectionError="";actionError="";
 $("academy-associates").hidden=true;$("academy-programs").hidden=false;
 if($("academy-promotion").open)$("academy-promotion").close();
 void refreshCatalog();
}
$("academy-back-degrees").onclick=returnToDegrees;
$("academy-catalog-retry").onclick=()=>void refreshCatalog();
$("academy-test-unlock").onclick=()=>{if(!adminTest||!staff||busy)return;local.unlocked=course.LESSONS.length-1;data=course.publicCourse(local);render();};
$("academy-test-exam").onclick=()=>{if(!adminTest||!staff||busy)return;local.best.fill(100);local.unlocked=course.LESSONS.length-1;data=course.publicCourse(local);void send("exam-start");};
watchStaffRole(value=>{staff=value===true;if(adminTest&&!staff)returnToDegrees();renderDegrees();});
$("academy-example-move").onclick=()=>{examplePlayed=true;renderExample();};
$("academy-example-reset").onclick=()=>{examplePlayed=false;renderExample();};
$("academy-begin").onclick=()=>send("begin");
function render(){
 const l=course.LESSONS[data.lesson],board=data.board,complete=data.best.filter(x=>x!==null&&x>=PASS).length;
 $("academy-test-tools").hidden=!adminTest;$("academy-test-unlock").disabled=busy;$("academy-test-exam").disabled=busy||data.completed;
 const examMode=["exam","exam-results"].includes(data.phase);$("academy-progress").max=course.LESSONS.length+1;$("academy-progress").value=complete+(data.completed?1:0);$("academy-overall").textContent=complete+" / "+course.LESSONS.length+" lessons passed · Passing grade "+PASS+"% · Final exam "+(data.completed?"passed":data.examUnlocked?"available":"locked");
 $("academy-title").textContent=(data.lesson+1)+". "+l.title;$("academy-teach").replaceChildren(...l.teach.map(t=>element("p",t)));$("academy-history").hidden=!l.history;$("academy-history-text").textContent=l.history||"";$("academy-begin").hidden=data.phase!=="study";$("academy-begin").disabled=busy||!ready;$("academy-begin").textContent=busy&&data.phase==="study"?"Loading…":"Begin practice";renderExample();
 for(const id of ["academy-teach","academy-example","academy-rule-source"])$(id).hidden=examMode||(id==="academy-example"&&data.phase!=="study");
 if(examMode){$("academy-title").textContent="Final exam: "+course.professor+" · Difficulty "+course.EXAM_LEVEL;$("academy-history").hidden=true;}
 $("academy-exam-start").disabled=busy||!ready||!data.examUnlocked||data.completed||data.phase==="exam";
 $("academy-exam-start").textContent=data.completed?"Final exam · Passed":!data.examUnlocked?"Final exam · Locked":data.exam.active?"Resume final exam":"Start final exam";
 $("academy-exam-status").textContent=data.examUnlocked?"Win a full match against "+course.professor+". Attempts: "+data.exam.attempts:"Pass all "+course.LESSONS.length+" lessons to unlock.";
 $("academy-exam-resign").hidden=data.phase!=="exam";$("academy-exam-resign").disabled=busy;
 $("academy-exam-results").hidden=data.phase!=="exam-results";
 $("academy-exam-result-title").textContent=data.completed?"Exam passed!":"Exam not passed";
 $("academy-exam-result-note").textContent=data.completed?"You earned your degree.":"Your coursework remains passed. Retry whenever you are ready.";
 $("academy-exam-retry").hidden=data.completed;$("academy-exam-retry").disabled=busy;
 $("academy-feedback").textContent=connectionError||actionError||(busy?"Please wait…":data.feedback);$("academy-feedback").classList.toggle("academy-error",!!(connectionError||actionError));$("academy-connection-actions").hidden=!remote||!connectionError;$("academy-reload").disabled=busy;$("academy-local").disabled=busy;$("academy-complete").hidden=!data.completed;$("academy-diploma-title").textContent=course.degree+" in Chess";$("academy-award-note").textContent=adminTest?"Admin test graduation only. No real diploma, grades or collectibles were changed.":remote?"Your in-game diploma is saved in Collections → Diplomas.":"Practice graduation only. Sign in to earn a saved diploma and collectibles." ;
 const nav=$("academy-lessons");nav.replaceChildren();course.LESSONS.forEach((lesson,i)=>{const group=course.MODULES.find(m=>m[1]===i);if(group)nav.append(element("h3",group[0]));const b=element("button",(i+1)+". "+lesson.title+" · "+(i>data.unlocked?"Locked":data.best[i]===null?"Not graded":data.best[i]+"% best"));b.type="button";b.disabled=busy||!ready||i>data.unlocked;b.setAttribute("aria-current",String(i===data.lesson));b.onclick=()=>send("lesson",{lesson:i});nav.append(b);});
 $("academy-practice").hidden=!board;$("academy-quiz").hidden=data.phase!=="quiz";$("academy-results").hidden=data.phase!=="results";$("academy-retry-match").hidden=data.phase!=="match-retry";$("academy-hint").hidden=data.phase==="exam";$("academy-hint").disabled=busy||!ready||data.phase==="exam";
 if(board){$("academy-prompt").textContent=data.phase==="exam"?"You (White) vs "+course.professor+" (Black) · Difficulty "+course.EXAM_LEVEL:data.prompt?"Exercise "+(data.exercise+1)+"/"+data.exerciseCount+": "+data.prompt:"Guided match · "+data.match.turns+"/"+data.match.target+" accepted moves · "+data.match.mistakes+" retries";$("academy-turn").textContent=(board.turn==="w"?"White":"Black")+" to move"+(inCheck(board)?" · Check":"");
  const legal=moves(board),targets=legal.filter(m=>m.from===selected),el=$("academy-board");el.replaceChildren();for(let pos=0;pos<64;pos++){const i=pos,p=board.board[i],b=element("button","");b.type="button";b.className="ch-square ptg-theme-exempt"+(((i>>3)+i%8)%2?" dark":"")+(color(p)==="b"?" black-piece":"")+(selected===i?" selected":"")+(targets.some(m=>m.to===i)?p?" target capture":" target":"");const piece=element("span",G[p]||"");piece.className="ch-piece";b.append(piece);if(pos%8===0){const rank=element("span",square(i)[1]);rank.className="ch-coord ch-rank";b.append(rank);}if(pos>=56){const file=element("span",square(i)[0]);file.className="ch-coord ch-file";b.append(file);}b.setAttribute("aria-label",square(i)+" "+(p||"empty"));b.disabled=busy||!ready;b.onclick=()=>click(i);el.append(b);}
 }
 if(data.phase==="quiz"){
  const key=data.lesson+":"+JSON.stringify(data.quiz);if(key!==quizKey){quizKey=key;answers=Array(data.quiz.length).fill(null);}
  const el=$("academy-questions");el.replaceChildren();data.quiz.forEach((q,i)=>{const field=document.createElement("fieldset");field.append(element("legend",(i+1)+". "+q.question));q.options.forEach((o,j)=>{const label=document.createElement("label"),input=document.createElement("input");input.type="radio";input.name="question-"+i;input.checked=answers[i]===j;input.required=true;input.disabled=busy;input.onchange=()=>{answers[i]=j;};label.append(input,document.createTextNode(o.label));field.append(label);});el.append(field);});$("academy-form").querySelector("button").disabled=busy;
 }
 if(data.phase==="results"){const grade=data.lastGrade.grade;$("academy-grade").textContent=grade+"% · "+(grade>=PASS?"Passed":"Try again")+" · Best "+data.best[data.lesson]+"%";$("academy-review").replaceChildren(...data.lastGrade.results.map(r=>element("p",(r.correct?"Correct: ":"Review: ")+r.question+" Answer: "+r.answer)));$("academy-next").hidden=data.lesson===course.LESSONS.length-1||data.unlocked<=data.lesson;$("academy-retry").disabled=busy;}
}
function click(i){if(busy||!ready||!data.board)return;const g=data.board;if(color(g.board[i])===g.turn){selected=selected===i?-1:i;render();return;}const opts=moves(g).filter(m=>m.from===selected&&m.to===i);if(!opts.length){$("academy-feedback").textContent="Choose a legal destination. Your king must stay safe.";return;}if(opts.length>1){const el=$("academy-promotion-buttons");el.replaceChildren();for(const m of opts){const b=element("button",({q:"Queen",r:"Rook",b:"Bishop",n:"Knight"})[m.promotion]);b.onclick=()=>{$("academy-promotion").close();send("move",{move:moveKey(m)});};el.append(b);}$("academy-promotion").showModal();}else send("move",{move:moveKey(opts[0])});}
async function api(action,extra={},target=course){
 if(adminTest&&action!=="catalog")throw Error("Admin tests never access saved course data.");
 const u=auth.currentUser;if(!u?.emailVerified||usingLocalFirebaseEmulators)throw Error("Verified Live Firebase sign-in required.");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const idToken=await u.getIdToken();
  const r=await fetch(endpoint,{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,academy:true,school:target.id,action,...extra})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||"Chess School request failed (HTTP "+r.status+").");
  if(action==="catalog"?typeof d.associateCompleted!=="boolean":!target.isSchoolState(d))throw Error("The live Worker is still running an older chess academy. Deploy the Chess School branch, then retry saved progress.");
  if(auth.currentUser?.uid!==u.uid)throw Error("Account changed.");
  return d;
 }catch(e){if(e.name==="AbortError")throw Error("Chess School timed out. Retry saved progress.");if(e instanceof TypeError)throw Error("Could not reach the Chess School Worker. Check deployment, network and allowed origin.");throw e;}finally{clearTimeout(timer);}
}
function scrollPractice(){requestAnimationFrame(()=>{const panel=$("academy-practice");if(!panel.hidden&&!$("academy-associates").hidden&&!$("ch-school-panel").hidden)panel.scrollIntoView({block:"start",behavior:"smooth"});});}
async function loadSaved(){
 if(adminTest)return;
 const gen=++epoch;remote=true;ready=false;busy=true;connectionError="";actionError="";$("academy-status").textContent="Loading saved course…";render();
 try{const d=await api("state");if(gen===epoch){data=d;selected=-1;answers=[];quizKey="";ready=true;$("academy-status").textContent="Your course progress is saved to your account.";}}
 catch(e){if(gen===epoch){connectionError=e.message;$("academy-status").textContent="Saved progress unavailable. Retry or use unsaved practice.";}}
 finally{if(gen===epoch){busy=false;render();}}
}
function startLocal(){
 ++epoch;remote=false;ready=true;busy=false;connectionError="";actionError="";local=adminTest?course.initialCourse():localCourses.get(course.id)||course.initialCourse();data=course.publicCourse(local);selected=-1;answers=[];quizKey="";
 $("academy-status").textContent=adminTest?"ADMIN TEST MODE · Nothing is saved or awarded.":"Unsaved practice mode: progress and rewards are not saved to your account.";render();
}
$("academy-reload").onclick=()=>loadSaved();
$("academy-local").onclick=()=>startLocal();
async function send(action,extra={}){
 if(busy||!ready||adminTest&&!staff)return;
 busy=true;actionError="";const generation=epoch;render();
 let advance=false;
 try{
  let next;if(remote&&!adminTest)next=await api(action,{revision:data.revision,requestId:crypto.randomUUID(),...extra});else{local=course.courseAction(local,{action,...extra});if(!adminTest)localCourses.set(course.id,local);next=course.publicCourse(local);}
  if(generation===epoch){data=next;selected=-1;if(action==="retry-quiz"||action==="lesson"){quizKey="";answers=[];}if(action==="lesson"){exampleLesson=-1;$("academy-history").open=false;}if(next.discovered)$("academy-status").textContent="New school collectible earned! Check your collection.";advance=action==="begin"||action==="exam-start";}
 }catch(e){if(generation===epoch){actionError=e.message;if(remote){connectionError=e.message;ready=false;$("academy-status").textContent="Saved action not confirmed. Retry saved progress.";}}}
 finally{if(generation===epoch){busy=false;render();if(advance)scrollPractice();}}
}
$("academy-exam-start").onclick=()=>send("exam-start");$("academy-exam-retry").onclick=()=>send("exam-start");$("academy-exam-resign").onclick=()=>{if(confirm("Resign this exam attempt? Your lesson grades will be kept."))send("exam-resign");};
$("academy-hint").onclick=()=>send("hint");$("academy-retry").onclick=()=>send("retry-quiz");$("academy-next").onclick=()=>send("lesson",{lesson:data.lesson+1});$("academy-retry-match").onclick=()=>send("retry-match");$("academy-cancel").onclick=()=>$("academy-promotion").close();$("academy-form").onsubmit=e=>{e.preventDefault();if(answers.length===data.quiz?.length&&answers.every(Number.isInteger))send("quiz",{answers:[...answers]});};
onAuthStateChanged(auth,()=>{localCourses.clear();returnToDegrees();});
render();
