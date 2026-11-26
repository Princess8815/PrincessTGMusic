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
