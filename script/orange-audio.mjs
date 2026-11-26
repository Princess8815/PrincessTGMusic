// Original orchard theme and synthesized effects. No assets, requests or
// copyrighted recordings. Audio starts only after a browser user gesture.
export function createOrangeAudio({doc=document,storage=localStorage,Audio=globalThis.AudioContext||globalThis.webkitAudioContext}={}){
 const KEY="ptg-orange-audio-v1";
 let pref={music:true,sound:true};
 try{const saved=JSON.parse(storage.getItem(KEY)||"null");for(const k of ["music","sound"])if(typeof saved?.[k]==="boolean")pref[k]=saved[k];}catch{}
 const buttons=[...doc.querySelectorAll("[data-ok-audio]")];
 let ctx=null,music=null,sound=null,timer=null,next=0,index=0,unlocked=false,dead=false;
 const last=new Map();
 const melody=[72,76,79,76,74,77,81,77,76,79,83,79,74,77,79,77,72,76,79,84,81,79,76,74,77,81,84,81,79,77,74,72];
 const bass=[48,53,52,55,48,57,53,55];
 function update(){for(const b of buttons){const key=b.dataset.okAudio,on=pref[key];b.setAttribute("aria-pressed",String(on));b.textContent=(key==="music"?"Music":"Sound")+": "+(on?"On":"Off");}}
 function note(bus,hz,at,length,volume=.035,type="sine",endHz=hz){
  if(!ctx||ctx.state!=="running")return;
  const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(hz,at);if(endHz!==hz)o.frequency.exponentialRampToValueAtTime(Math.max(20,endHz),at+length);
  g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(volume,at+.008);g.gain.exponentialRampToValueAtTime(.0001,at+length);o.connect(g);g.connect(bus);o.start(at);o.stop(at+length+.01);
 }
 const hz=n=>440*2**((n-69)/12);
 function schedule(){
  if(!ctx||ctx.state!=="running"||!pref.music||doc.hidden)return;
  if(next<ctx.currentTime)next=ctx.currentTime+.025;
  while(next<ctx.currentTime+.18){
   const n=melody[index%melody.length];note(music,hz(n),next,.20,.048,"sine");note(music,hz(n+12),next,.09,.009,"triangle");
   if(index%4===0)note(music,hz(bass[Math.floor(index/4)%bass.length]),next,.68,.035,"triangle");
   if(index%4===2)note(music,hz(bass[Math.floor(index/4)%bass.length]+7),next,.38,.022,"sine");
   index=(index+1)%melody.length;next+=.255;
  }
 }
 function stopMusic(){if(timer!==null){clearInterval(timer);timer=null;}}
 function sync(){
  update();if(!ctx)return;
  music.gain.setValueAtTime(pref.music&&!doc.hidden?1:0,ctx.currentTime);sound.gain.setValueAtTime(pref.sound&&!doc.hidden?1:0,ctx.currentTime);
  if(pref.music&&!doc.hidden&&ctx.state==="running"&&!dead){if(timer===null){next=ctx.currentTime+.03;timer=setInterval(schedule,75);schedule();}}
  else stopMusic();
 }
 async function unlock(){
  if(dead||!Audio||doc.hidden||!pref.music&&!pref.sound)return;
  try{if(!ctx){ctx=new Audio();music=ctx.createGain();sound=ctx.createGain();music.connect(ctx.destination);sound.connect(ctx.destination);}
   if(ctx.state!=="running")await ctx.resume();unlocked=ctx.state==="running";sync();
  }catch{}
 }
 function effect(name){
  if(!pref.sound||doc.hidden||!ctx||ctx.state!=="running")return;
  const at=ctx.currentTime,previous=last.get(name)??-Infinity;if(at-previous<.075)return;last.set(name,at);
  try{
   const play=(f,delay,length,vol,type="sine",end=f)=>note(sound,f,at+delay,length,vol,type,end);
   switch(name){
    case "launch":play(250,0,.18,.095,"triangle",810);break;
    case "glass":for(let i=0;i<5;i++)play([2450,1720,3180,2110,1320][i],i*.023,.09+i*.015,.022,"triangle",900+i*140);break;
    case "wood":play(195,0,.10,.10,"triangle",65);play(480,.015,.045,.035,"square",120);break;
    case "impact":play(180,0,.09,.075,"triangle",82);break;
    case "bounce":play(440,0,.11,.075,"sine",720);break;
    case "fruit":play(350,0,.13,.08,"sine",190);break;
    case "clear":play(740,0,.10,.055);play(990,.065,.12,.046);break;
    case "blast":play(88,0,.32,.12,"triangle",35);play(180,.01,.12,.035,"square",40);break;
    case "win":[72,76,79,84].forEach((n,i)=>play(hz(n),i*.095,.24,.075,"triangle"));break;
    case "lose":[67,64,60].forEach((n,i)=>play(hz(n),i*.12,.24,.065,"sine"));break;
   }
  }catch{}
 }
 function event(e,material){
  if(e.kind==="glassShatter")effect("glass");
  else if(e.kind==="branch"&&material!=="glass")effect("wood");
  else if(e.kind==="impactBounce")effect("impact");
  else if(e.kind==="bounce"||e.kind==="pushThrough")effect("bounce");
  else if(e.kind==="fruitImpact")effect("fruit");
  else if(e.kind==="orange")effect("clear");
  else if(e.kind==="blast")effect("blast");
 }
 function toggle(key){if(!Object.hasOwn(pref,key))return;pref[key]=!pref[key];try{storage.setItem(KEY,JSON.stringify(pref));}catch{}sync();void unlock();}
 for(const b of buttons)b.addEventListener("click",()=>toggle(b.dataset.okAudio));
 doc.addEventListener("pointerdown",()=>void unlock(),{passive:true});
 doc.addEventListener("keydown",()=>void unlock());
 doc.addEventListener("visibilitychange",()=>{sync();if(!doc.hidden&&unlocked)void unlock();});
 function dispose(){dead=true;stopMusic();try{ctx?.close();}catch{}}
 globalThis.addEventListener?.("pagehide",e=>{if(!e.persisted)dispose();else stopMusic();});
 globalThis.addEventListener?.("pageshow",e=>{if(e.persisted&&unlocked)void unlock();});
 update();
 return {effect,event,toggle,preferences:()=>({...pref}),dispose};
}
