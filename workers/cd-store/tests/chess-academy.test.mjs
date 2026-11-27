import test from "node:test";
import assert from "node:assert/strict";
import {LESSONS,initialCourse,courseAction,publicCourse,position,coach,quizView,PROFESSOR_ID} from "../../../script/chess-academy-core.mjs";
import {moves,moveKey,playChess,attacked} from "../../../script/chess-core.mjs";
import {academyWithStorage} from "../chess-academy.mjs";
const answer=(s,correct=true)=>quizView(s).map(q=>q.options.findIndex(o=>correct?o.id===0:o.id!==0));
test("all exercise moves legal; final positions yield mate or stalemate",()=>{
 for(const l of LESSONS)for(const e of l.exercises){const g=position(e[0]),m=moves(g).find(x=>moveKey(x)===e[2]);assert.ok(m,l.title+": "+e[2]);if(l===LESSONS.at(-1))assert.ok(["checkmate","stalemate"].includes(playChess(g,m).reason));}
 const e=LESSONS[6].exercises.find(e=>e[2]==="e4f6"),g=position(e[0]),n=playChess(g,moves(g).find(m=>moveKey(m)===e[2]));assert.ok(attacked(n,4,"w")&&attacked(n,6,"w"));
});
test("exercise gates, fail and retry, passing threshold, best grade",()=>{
 let s=initialCourse();assert.throws(()=>courseAction(s,{action:"lesson",lesson:1}));assert.throws(()=>courseAction(s,{action:"quiz",answers:[0,0,0,0,0]}));
 s=courseAction(s,{action:"move",move:"a2a3"});assert.equal(s.exercise,0);
 for(const e of LESSONS[0].exercises)s=courseAction(s,{action:"move",move:e[2]});
 assert.equal(s.phase,"quiz");assert.ok(publicCourse(s).quiz.every(q=>q.options.every(o=>!("id" in o))));
 s=courseAction(s,{action:"quiz",answers:answer(s,false)});assert.equal(s.best[0],0);assert.equal(s.unlocked,0);
 s=courseAction(s,{action:"retry-quiz"});const four=answer(s);four[0]=answer(s,false)[0];s=courseAction(s,{action:"quiz",answers:four});assert.equal(s.best[0],80);assert.equal(s.unlocked,1);
 s=courseAction(s,{action:"retry-quiz"});s=courseAction(s,{action:"quiz",answers:answer(s)});assert.equal(s.best[0],100);assert.equal(s.attempts[0],3);
});
test("all lessons, guided moves, and one server-side collectible grant",async()=>{
 const root="docs",uid="u",user="users/u",path=user+"/privateGames/chess-academy",reward=user+"/axolotls/"+PROFESSOR_ID;
 const data=new Map([[user,{updateTime:"a",fields:{role:{stringValue:"user"}}}]]);let version=0,grants=0,req=0;
 const read=async p=>data.get(p)||null;
 const commit=async writes=>{for(const w of writes){if(w.verify)continue;const p=w.update.name.slice(root.length+1);if(p===reward)grants++;data.set(p,{fields:w.update.fields,updateTime:String(++version)});}return true;};
 const call=input=>academyWithStorage({read,commit,root,uid,input});
 let d=await call({action:"state"}),last;
 const send=async(action,extra={})=>{last={action,revision:d.revision,requestId:"req-"+(++req),...extra};d=await call(last);};
 for(let i=0;i<LESSONS.length;i++){
  if(i)await send("lesson",{lesson:i});
  for(const e of LESSONS[i].exercises)await send("move",{move:e[2]});
  let tries=0;while(d.phase==="match"||d.phase==="match-retry"){if(d.phase==="match-retry")await send("retry-match");else{const m=coach(d.board,LESSONS[i].match.opening)[0].m;await send("move",{move:moveKey(m)});}assert.ok(++tries<=80);}
  assert.equal(d.phase,"quiz");const saved=JSON.parse(data.get(path).fields.payload.stringValue);await send("quiz",{answers:answer(saved)});assert.equal(d.best[i],100);assert.equal(grants,i===LESSONS.length-1?1:0);
 }
 assert.equal(d.completed,true);assert.equal(d.discovered,true);assert.equal(grants,1);await call(last);assert.equal(grants,1);assert.equal((await call({action:"state"})).completed,true);
});
