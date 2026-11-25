
export const DIFFICULTIES=["easy","medium","hard"];
export const COINS={easy:1,medium:2,hard:3};
export const MAX_MISSES=6;
export const AXOLOTLS=[
 ["hangy","Hangy","#f7a5b8","#c978d5","bow"],["flippy","Flippy","#7de1d4","#5b9fea","scarf"],
 ["magica","Magica","#bba3ff","#ed9dff","star"],["sleepy","Sleepy","#b0d5ef","#aab1e9","heart"],
 ["wordy","Wordy","#f9cf79","#e4a169","bow"],["lazy","Lazy","#c5e8a4","#76c5a1","leaf"],
 ["impressionate","Impressionate","#ffadcb","#ee7d96","heart"],["mindful","Mindful","#a0d9c7","#6ba4a9","shell"],
 ["wired","Wired","#c7a6ff","#f8db61","crown"]
];
export const TROPHIES=[
 ["hang-girl-mastery","Hang Girl Mastery","Win 1,000 Hanggirl games on any difficulty."],
 ["hang-girl-god","Hang Girl God","Win 100 Hard games in a row."]
];
const rare=new Set("jqxz"), uncommon=new Set("kvwfybgph");
const commonPairs=/th|he|in|er|an|re|on|at|en|nd|st|es|or|te|of|ed|is|it|al|ar|ng|ch|sh|oo|ee|ea|ou|ai|ie|tion/g;
export function difficultyScore(word,frequency=10){
 const unique=new Set(word), vowels=[...unique].filter(c=>"aeiou".includes(c)).length;
 const rarity=[...unique].reduce((n,c)=>n+(rare.has(c)?5:uncommon.has(c)?1:0),0)/unique.size;
 const familiarity=frequency>=40?0:frequency>=8?1:frequency>=1?2:3;
 return rarity*2 + (unique.size<=3?2:unique.size<=5?1:0) +
  (vowels===0?5:vowels===1?1.5:0)+familiarity -
  Math.min(2,(word.match(commonPairs)||[]).length*0.5);
}
export function difficultyOf(word,frequency){
 const score=difficultyScore(word,frequency);
 return score>=5.5?"hard":score>=2.5?"medium":"easy";
}
export function initialState(){return {totalWins:0,wins:{easy:0,medium:0,hard:0},streak:0,streakDifficulty:"",best:{easy:0,medium:0,hard:0},recent:[],round:null};}
export function begin(state,difficulty,word,id){
 if(!DIFFICULTIES.includes(difficulty)||!/^[a-z]{3,20}$/.test(word))throw Error("Invalid round");
 if(state.round?.status==="playing")throw Error("Finish or abandon the current round.");
 return {...state,recent:[...(state.recent||[]),word].slice(-40),round:{id,difficulty,word,letters:[],status:"playing",awarded:0,unlocks:[]}};
}
export function abandon(state){
 if(state.round?.status!=="playing")return state;
 return {...state,streak:0,streakDifficulty:"",round:{...state.round,status:"abandoned"}};
}
export function guess(state,letter){
 const r=state.round;
 if(!r||r.status!=="playing"||r.letters.includes(letter))return state;
 if(!/^[a-z]$/.test(letter))throw Error("Invalid letter");
 const letters=[...r.letters,letter],misses=letters.filter(c=>!r.word.includes(c)).length;
 const won=[...r.word].every(c=>letters.includes(c));
 const lost=!won&&misses>=MAX_MISSES;
 const round={...r,letters,status:won?"won":lost?"lost":"playing"};
 if(lost)return {...state,round,streak:0,streakDifficulty:""};
 if(!won)return {...state,round};
 const d=r.difficulty,totalWins=state.totalWins+1,wins={...state.wins,[d]:state.wins[d]+1};
 const streak=state.streakDifficulty===d?state.streak+1:1;
 const oldBest=state.best[d],best={...state.best,[d]:Math.max(oldBest,streak)};
 const unlocks=[];
 const add=(condition,type,id)=>{if(condition)unlocks.push({type,id});};
 add(totalWins===1,"axolotls","hangy");add(totalWins===25,"axolotls","flippy");add(totalWins===100,"axolotls","magica");
 add(totalWins===1000,"trophies","hang-girl-mastery");
 add(wins[d]===1,"axolotls",{easy:"sleepy",medium:"lazy",hard:"mindful"}[d]);
 add(oldBest<5&&streak>=5,"axolotls",{easy:"wordy",medium:"impressionate",hard:"wired"}[d]);
 add(d==="hard"&&oldBest<100&&streak>=100,"trophies","hang-girl-god");
 return {...state,totalWins,wins,streak,streakDifficulty:d,best,round:{...round,awarded:COINS[d],unlocks}};
}
export function publicState(s){
 const r=s.round;
 return {totalWins:s.totalWins,wins:s.wins,streak:s.streak,streakDifficulty:s.streakDifficulty,best:s.best,
 round:r?{id:r.id,difficulty:r.difficulty,letters:r.letters,status:r.status,awarded:r.awarded,unlocks:r.unlocks,
  mask:[...r.word].map(c=>r.letters.includes(c)||r.status!=="playing"?c:"_"),
  misses:r.letters.filter(c=>!r.word.includes(c)).length}:null};
}
