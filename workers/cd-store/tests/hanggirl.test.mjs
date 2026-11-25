
import test from "node:test";
import assert from "node:assert/strict";
import {initialState,begin,guess,abandon,publicState,difficultyOf,COINS} from "../hanggirl-core.mjs";
function win(s,d,word="cry"){
 s=begin(s,d,word,crypto.randomUUID());
 for(const l of new Set(word))s=guess(s,l);
 return s;
}
test("difficulty uses vowels, common patterns and familiarity rather than word length",()=>{
 assert.equal(difficultyOf("cry",100),"hard");
 assert.equal(difficultyOf("why",100),"hard");
 assert.equal(difficultyOf("flower",100),"easy");
 assert.ok(difficultyOf("quartz",0.2)==="hard");
});
test("all tiers and milestones award once; hard streak and total trophies",()=>{
 let s=initialState();
 s=win(s,"easy");assert.equal(s.round.awarded,1);assert.deepEqual(s.round.unlocks.map(u=>u.id),["hangy","sleepy"]);
 for(let i=1;i<5;i++)s=win(s,"easy");assert.equal(s.round.unlocks[0].id,"wordy");
 s=win(s,"medium");assert.equal(s.round.awarded,2);assert.equal(s.round.unlocks[0].id,"lazy");
 for(let i=1;i<5;i++)s=win(s,"medium");assert.equal(s.round.unlocks[0].id,"impressionate");
 s=win(s,"hard");assert.equal(s.round.awarded,3);assert.equal(s.round.unlocks[0].id,"mindful");
 const unlocked=new Set();
 for(let i=1;i<100;i++){s=win(s,"hard");for(const u of s.round.unlocks)unlocked.add(u.id);}
 assert.equal(s.streak,100);for(const id of ["wired","flippy","magica","hang-girl-god"])assert.ok(unlocked.has(id));
 while(s.totalWins<1000)s=win(s,"hard");
 assert.ok(s.round.unlocks.some(u=>u.id==="hang-girl-mastery"));
 assert.equal(guess(s,"a"),s);
 s=win(s,"hard");assert.equal(s.round.unlocks.length,0);
});
test("repeated guesses, no answer exposure, losses, abandonment and streak resets",()=>{
 let s=begin(win(initialState(),"easy"),"hard","apple","test");
 assert.equal(JSON.stringify(publicState(s)).includes("apple"),false);
 s=guess(s,"p");assert.deepEqual(publicState(s).round.mask,["_","p","p","_","_"]);
 assert.equal(guess(s,"p"),s);
 for(const c of "bcdfgh")s=guess(s,c);
 assert.equal(s.round.status,"lost");assert.equal(s.streak,0);assert.equal(s.round.awarded,0);
 s=begin(win(s,"hard"),"hard","cry","again");s=abandon(s);
 assert.equal(s.streak,0);assert.equal(s.round.status,"abandoned");
 assert.deepEqual(COINS,{easy:1,medium:2,hard:3});
});
