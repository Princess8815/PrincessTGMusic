import test from "node:test";
import assert from "node:assert/strict";
import {LESSONS,DEGREES,COURSES,WIGGLEWORTS_ID,PROFESSOR_ID,position,coach,initialCourse,courseAction,publicCourse,quizView} from "../../../script/chess-school-core.mjs";
import {moves,moveKey,playChess,botMove} from "../../../script/chess-core.mjs";
import {schoolWithStorage,chessDiplomaWrite} from "../chess-school.mjs";
import {SCHOOL_MEDALS,CHESS_DIPLOMA_ID,diplomaTitle} from "../../../script/chess-school-awards.mjs";
const answers=s=>quizView(s).map(q=>q.options.findIndex(o=>o.id===0));
test("four degrees, Associate’s and Bachelor’s implemented; all examples and exercises use legal moves",()=>{
 assert.equal(DEGREES.length,4);assert.equal(DEGREES.filter(x=>x[2]).length,2);assert.equal(LESSONS.length,15);
 for(const l of LESSONS)for(const e of [l.example,...l.exercises])assert.ok(moves(position(e[0])).some(m=>moveKey(m)===e[2]),l.title+": "+e[2]);
 assert.ok(LESSONS.every(l=>l.quiz.every(q=>q.length===5)));
});
test("study, practice, quiz and grade gates",()=>{
 let s=initialCourse();assert.throws(()=>courseAction(s,{action:"lesson",lesson:1}));assert.throws(()=>courseAction(s,{action:"move",move:"e2e3"}));
 s=courseAction(s,{action:"begin"});s=courseAction(s,{action:"move",move:"a2a3"});assert.equal(s.exercise,0);
 for(const e of LESSONS[0].exercises)s=courseAction(s,{action:"move",move:e[2]});
 assert.equal(s.phase,"quiz");assert.ok(publicCourse(s).quiz.every(q=>q.options.every(o=>!("id" in o))));
 s=courseAction(s,{action:"quiz",answers:answers(s).map(x=>(x+1)%4)});assert.equal(s.unlocked,0);
 s=courseAction(s,{action:"retry-quiz"});s=courseAction(s,{action:"quiz",answers:answers(s)});assert.equal(s.best[0],100);assert.equal(s.unlocked,1);
});
test("graduation earns two medals, one diploma and professor once, with old course preserved",async()=>{
 const root="docs",uid="u",user="users/u",path=user+"/privateGames/chess-school-associates",legacy=user+"/privateGames/chess-academy";
 const data=new Map([[user,{updateTime:"a",fields:{role:{stringValue:"user"}}}],[legacy,{updateTime:"legacy",fields:{payload:{stringValue:"old progress"}}}]]);let version=0,req=0,grants=0;
 const read=async p=>data.get(p)||null;
 const commit=async writes=>{for(const w of writes){if(w.verify)continue;const p=w.update.name.slice(root.length+1);if(p.includes("/medals/")||p.includes("/diplomas/")||p.includes("/axolotls/")){assert.ok(!data.has(p));grants++;}data.set(p,{fields:w.update.fields,updateTime:String(++version)});}return true;};
 const call=input=>schoolWithStorage({read,commit,root,uid,input});
 let d=await call({action:"state"}),last;
 const send=async(action,extra={})=>{last={action,revision:d.revision,requestId:"req-"+(++req),...extra};d=await call(last);};
 for(let i=0;i<LESSONS.length;i++){
  if(i)await send("lesson",{lesson:i});await send("begin");
  for(const e of LESSONS[i].exercises)await send("move",{move:e[2]});
  let tries=0;while(d.phase==="match"||d.phase==="match-retry"){if(d.phase==="match-retry")await send("retry-match");else await send("move",{move:moveKey(coach(d.board,LESSONS[i].match.opening)[0].m)});assert.ok(++tries<=80);}
  const saved=JSON.parse(data.get(path).fields.payload.stringValue);await send("quiz",{answers:answers(saved)});
  assert.equal(d.best[i],100);assert.equal(grants,SCHOOL_MEDALS.filter(t=>t[3]<=i+1).length);
 }
 assert.equal(d.completed,false);assert.equal(grants,2);assert.equal(d.examUnlocked,true);
 await send("exam-start");assert.equal(d.phase,"exam");assert.equal(d.exam.level,1);assert.equal(d.exam.attempts,1);
 await assert.rejects(()=>call({action:"hint",revision:d.revision,requestId:"hint-forbidden"}));
 await send("exam-resign");assert.equal(d.completed,false);assert.equal(grants,2);
 await send("exam-start");assert.equal(d.exam.attempts,2);
 // Full legal match against the actual level-one engine, using a stronger engine for White.
 let tries=0;while(d.phase==="exam"){const move=botMove(d.board,5,123);assert.ok(move);await send("move",{move:moveKey(move)});assert.ok(++tries<=200);}
 assert.equal(d.completed,true);assert.equal(grants,4);assert.equal(data.get(user+"/diplomas/"+CHESS_DIPLOMA_ID).fields.rank.integerValue,"1");assert.ok(SCHOOL_MEDALS.every(m=>data.has(user+"/medals/"+m[0])));assert.ok(![...data.keys()].some(p=>p.includes("/trophies/")));assert.ok(data.has(user+"/axolotls/"+PROFESSOR_ID));assert.equal(data.get(legacy).fields.payload.stringValue,"old progress");
 await call(last);assert.equal(grants,4);
});

test("exam locked until all lessons pass; no hints; losing never graduates",()=>{
 let s=initialCourse();assert.throws(()=>courseAction(s,{action:"exam-start"}));
 s.best.fill(80);s=courseAction(s,{action:"exam-start"});assert.equal(publicCourse(s).completed,false);
 assert.throws(()=>courseAction(s,{action:"hint"}));assert.throws(()=>courseAction(s,{action:"move",move:"e2e5"}));
 s.exam.game=position("k7/8/1QK5/8/8/8/8/8 w - -");s=courseAction(s,{action:"move",move:"b6b7"});
 assert.equal(publicCourse(s).completed,true);assert.equal(s.exam.result,"won");
 let loss=initialCourse();loss.best.fill(80);loss=courseAction(loss,{action:"exam-start"});loss=courseAction(loss,{action:"exam-resign"});
 assert.equal(publicCourse(loss).completed,false);assert.equal(loss.exam.result,"resigned");
});

test("diploma upgrades replace the same record and never downgrade",async()=>{
 const user="users/u",root="docs",path=user+"/diplomas/chess";let old=null;
 const read=async p=>{assert.equal(p,path);return old;};
 for(let rank=1;rank<=4;rank++){
  const w=await chessDiplomaWrite({read,root,user,rank});assert.equal(w.update.name,root+"/"+path);assert.equal(w.update.fields.rank.integerValue,String(rank));assert.equal(w.currentDocument.updateTime,old?.updateTime);
  old={fields:w.update.fields,updateTime:String(rank)};
 }
 assert.equal(await chessDiplomaWrite({read,root,user,rank:1}),null);assert.equal(await chessDiplomaWrite({read,root,user,rank:4}),null);assert.equal(diplomaTitle(4),"PhD in Chess Diploma");
});

test("Bachelor’s strategy exercises are legal and exam is fixed at level four",()=>{
 const b=COURSES.bachelors;
 assert.equal(b.LESSONS.length,12);assert.equal(b.EXAM_LEVEL,4);
 for(const l of b.LESSONS)for(const e of [l.example,...l.exercises])assert.ok(moves(position(e[0])).some(m=>moveKey(m)===e[2]),l.title+": "+e[2]);
 let s=b.initialCourse();assert.throws(()=>b.courseAction(s,{action:"exam-start"}));s.best.fill(80);s=b.courseAction(s,{action:"exam-start"});assert.equal(b.publicCourse(s).exam.level,4);assert.throws(()=>b.courseAction(s,{action:"hint"}));
});
test("Bachelor’s requires server-confirmed Associate’s and upgrades diploma only after real win",async()=>{
 const root="docs",uid="u",user="users/u",a=user+"/privateGames/chess-school-associates",b=user+"/privateGames/chess-school-bachelors",dip=user+"/diplomas/chess";
 const pack=s=>({updateTime:"v",fields:{payload:{stringValue:JSON.stringify(s)}}});
 const data=new Map([[user,{updateTime:"u",fields:{role:{stringValue:"owner"}}}]]);
 const read=async p=>data.get(p)||null;let commits=0;
 const commit=async writes=>{commits++;for(const w of writes)if(w.update)data.set(w.update.name.slice(root.length+1),{updateTime:"v"+commits,fields:w.update.fields});return true;};
 const call=input=>schoolWithStorage({read,commit,root,uid,input:{school:"bachelors",...input}});
 await assert.rejects(()=>call({action:"state"}));
 let assoc=COURSES.associates.initialCourse();assoc.best.fill(100);data.set(a,pack(assoc));await assert.rejects(()=>call({action:"state"}));
 assert.equal((await call({action:"catalog"})).associateCompleted,false);assert.equal(commits,0);
 assoc.exam.passed=true;data.set(a,pack(assoc));data.set(dip,{updateTime:"d",fields:{rank:{integerValue:"1"}}});
 assert.equal((await call({action:"catalog"})).associateCompleted,true);assert.equal(commits,0);
 await assert.rejects(()=>call({action:"state",adminTest:true}));assert.equal(commits,0);
 let state=await call({action:"state"});assert.equal(state.exam.level,4);
 const course=COURSES.bachelors;let s=course.initialCourse();s.best.fill(100);s=course.courseAction(s,{action:"exam-start"});s.exam.game=position("k7/8/1QK5/8/8/8/8/8 w - -");data.set(b,pack(s));
 const result=await call({action:"move",move:"b6b7",revision:s.revision,requestId:"test-win"});assert.equal(result.completed,true);assert.equal(data.get(dip).fields.rank.integerValue,"2");assert.ok(data.has(user+"/axolotls/"+WIGGLEWORTS_ID));assert.equal(data.get(a).fields.payload.stringValue,JSON.stringify(assoc));
 const count=commits;await call({action:"move",move:"b6b7",revision:s.revision,requestId:"test-win"});assert.equal(commits,count);
});
