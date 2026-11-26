import test from "node:test";
import assert from "node:assert/strict";
import {createOrangeAudio} from "../../../script/orange-audio.mjs";
test("audio preferences persist independently and synchronize normal/fullscreen controls",()=>{
 const buttons=["music","sound","music","sound"].map(key=>({dataset:{okAudio:key},setAttribute(k,v){this[k]=v},addEventListener(k,v){this.click=v}}));
 const doc={hidden:false,querySelectorAll:()=>buttons,addEventListener(){}},data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const audio=createOrangeAudio({doc,storage,Audio:null});assert.deepEqual(audio.preferences(),{music:true,sound:true});
 buttons[0].click();assert.equal(buttons[0].textContent,"Music: Off");assert.equal(buttons[2].textContent,"Music: Off");assert.equal(buttons[1].textContent,"Sound: On");
 buttons[3].click();assert.deepEqual(audio.preferences(),{music:false,sound:false});audio.effect("glass");audio.dispose();
 const restored=createOrangeAudio({doc,storage,Audio:null});assert.deepEqual(restored.preferences(),{music:false,sound:false});restored.dispose();
});

test("glass shatter uses a non-silent decaying PCM sample and obeys sound mute",async()=>{
 const handlers={},buffers=[],played=[];
 const gain=()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}});
 class FakeAudio{
  state="running";sampleRate=16000;currentTime=1;destination={};
  createGain(){return gain();}
  createBuffer(ch,n,rate){const samples=new Float32Array(n);const b={getChannelData:()=>samples};buffers.push(samples);return b;}
  createBufferSource(){return {connect(){},start(){played.push(this.buffer);}};}
  close(){}
 }
 const doc={hidden:false,querySelectorAll:()=>[],addEventListener:(k,v)=>handlers[k]=v};
 const storage={getItem:()=>JSON.stringify({music:false,sound:true}),setItem(){}};
 const audio=createOrangeAudio({doc,storage,Audio:FakeAudio});handlers.pointerdown();await Promise.resolve();
 audio.event({kind:"glassShatter",x:600,strength:12},"glass");
 assert.equal(played.length,1);assert.equal(buffers.length,3);
 const pcm=buffers[0];assert.equal(pcm.length,10400);assert.ok(pcm.some(v=>Math.abs(v)>.05));assert.ok(pcm.every(Number.isFinite));assert.ok(Math.abs(pcm.at(-1))<.001);
 audio.toggle("sound");audio.event({kind:"glassShatter",x:200,strength:10},"glass");assert.equal(played.length,1);audio.dispose();
});
