
import test from "node:test";
import assert from "node:assert/strict";
import {newGame,step,replay,rollRewards,fruiterDenominator,difficulty} from "../../../script/apple-catcher-core.mjs";
test("replay matches the browser simulation, including a lost run",()=>{
 let s=newGame(42),moves=[];const start=s;while(!s.done&&s.tick<300){const t=s.tick+1,target=Math.floor(t/20)%5;if(target!==s.target)moves.push([t,target]);s=step(s,target).state;}
 assert.deepEqual(replay(start,s.tick,moves).state,s);
 assert.throws(()=>replay(start,400,[]));assert.throws(()=>replay(start,2,[[1,5]]));
});
test("fresh apple earns one point; misses and rotten catches cost lives",()=>{
 const a={lane:2,born:0,due:1,rotten:false},s={...newGame(7),apples:[a]};
 assert.equal(step(s).state.score,1);assert.equal(step(s).catches.length,1);
 assert.equal(step({...s,apples:[{...a,lane:0}]}).state.lives,2);
 assert.equal(step({...s,apples:[{...a,rotten:true}]}).state.lives,2);
 assert.equal(step({...s,apples:[{...a,rotten:true,lane:0}]}).state.lives,3);
});
test("milestones and increasingly likely Fruiter",()=>{
 assert.deepEqual(rollRewards([{score:49,tick:1}],n=>n-1),[]);
 assert.deepEqual(rollRewards([{score:50,tick:1}],n=>n===5?0:n-1),["appey"]);
 assert.deepEqual(rollRewards([{score:1000,tick:1}],n=>n-1),["apple-tree-basket"]);
 assert.deepEqual(rollRewards([{score:1,tick:1}],()=>0),["fruiter"]);
 assert.equal(fruiterDenominator(0),10000);assert.ok(fruiterDenominator(600)<10000);assert.equal(difficulty(600),1);
});
test("a perfect solver can reach 1,000 without impossible overlapping arrivals",()=>{
 let s=newGame(42);while(!s.done&&s.score<1000&&s.tick<100000){
 const a=s.apples[0];let t=s.target;
 if(a)t=a.rotten?(a.lane+1)%5:a.lane;
 s=step(s,t).state;
 }assert.equal(s.score,1000);assert.equal(s.lives,3);
});
