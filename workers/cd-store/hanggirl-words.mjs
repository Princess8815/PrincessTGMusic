
import {difficultyOf} from "./hanggirl-core.mjs";
// Datamuse supplies real English words plus corpus frequency, no paid subscription.
// Fallback words are manually selected; no third-party list is redistributed.
const curated={
 easy:"apple orange banana garden flower forest planet ocean river summer winter spring stone house paper music water table bread chair window animal yellow green purple school friend travel season story light heart beach dream cloud dance earth smile sweet train horse rabbit turtle butterfly mountain beautiful"
 .split(" "),
 medium:"bridge puzzle candle rocket lemon kitten marble velvet silver mushroom jungle pepper shadow blanket pencil keyboard castle glacier thunder lantern meadow pumpkin compass crystal dragon dolphin spiral island anchor rhythmical whisper squirrel necklace orchard bicycle cinnamon lavender strawberry waterfall"
 .split(" "),
 hard:"why cry try dry fly shy sky spy gym myth lynx crypt glyph rhythm nymph hymn shyly spry slyly tryst fizz buzz jazz zigzag quiz quizzical quartz queue xylophone zephyr sphinx jinx jazzy awkward knapsack twitch twitchy quirk quirky fuzzy dizzy wryly wry dryly shyest rhythmics syzygy zygote quokka jackal jackpot juxtapose jigsaw javelin jukebox zigzagging zipper zippy zealous azure oxygen oxygenate oxidize pixel pixels matrix vortex paradox waxwork waxing foxglove boxwood foxes xylem xenon gyroscope cryptic crypts glyphs nymphs hymns cyst cysts lynxes myrrh".split(" ")
};
// Approximate familiarity for manually selected words, then apply the same scoring
// as live dictionary results. The curated labels are not used as difficulty overrides.
const fallback={easy:[],medium:[],hard:[]};
for(const [group,words] of Object.entries(curated)){
 for(const word of words){
  const freq=group==="easy"?60:group==="medium"?6:0.7;
  const tier=difficultyOf(word,freq);
  if(!fallback[tier].includes(word))fallback[tier].push(word);
 }
}
const blocked=/^(?:fuck|shit|bitch|cunt|dick|pussy|porn|nigg|slut|whore|rape|fagg|asshole|cock|damn|sex|hitler|nazi)/i;
const cache=new Map();
function pick(items){
 const limit=4294967296-(4294967296%items.length),a=new Uint32Array(1);
 do{crypto.getRandomValues(a);}while(a[0]>=limit);
 return items[a[0]%items.length];
}
async function wordsFor(prefix,env){
 const old=cache.get(prefix);if(old&&old.until>Date.now())return old.items;
 const url=new URL("https://api.datamuse.com/words");
 url.searchParams.set("sp",prefix+"*");url.searchParams.set("md","fp");url.searchParams.set("max","500");
 if(env.DATAMUSE_API_KEY)url.searchParams.set("key",env.DATAMUSE_API_KEY);
 const res=await fetch(url,{signal:AbortSignal.timeout(3500)});
 if(!res.ok)throw Error("Dictionary unavailable");
 const result=await res.json();
 const items=Array.isArray(result)?result.flatMap(({word,tags})=>{
  if(typeof word!=="string"||!/^[a-z]{3,20}$/.test(word)||blocked.test(word)||!Array.isArray(tags)||!tags.some(t=>["n","v","adj","adv"].includes(t)))return [];
  const freq=Number(tags.find(t=>t.startsWith("f:"))?.slice(2));
  if(!Number.isFinite(freq)||freq<0.15)return [];
  return [{word,difficulty:difficultyOf(word,freq)}];
 }):[];
 cache.set(prefix,{until:Date.now()+86400000,items});return items;
}
export async function chooseWord(difficulty,recent=[],env={}){
 const prefixes="abcdefghijklmnopqrstuvwxyz".split("");
 try{
  const prefix=pick(prefixes),items=await wordsFor(prefix,env);
  const matches=items.filter(x=>x.difficulty===difficulty&&!recent.includes(x.word));
  if(matches.length)return pick(matches).word;
 }catch{} // Keep gameplay available without the upstream service.
 const options=fallback[difficulty].filter(w=>!recent.includes(w));
 return pick(options.length?options:fallback[difficulty]);
}
