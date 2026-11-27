import {watchOwnerRole} from "./staff-auth.js";
import {watchAdSettings,saveAdSettings,adConfigId} from "./ad-settings.js";
import {BANNER_PATHS} from "./banner-ads-core.mjs";
import {validateAdSettings} from "./ad-settings-core.mjs";
const $=id=>document.getElementById(id);
const form=$("ad-config-form"),fields=$("ad-config-fields"),status=$("ad-config-status");
const ids={testBanners:"ad-test-banners",realAdsRequested:"ad-real-requested",interstitialsRequested:"ad-interstitials-requested",rewardedRequested:"ad-rewarded-requested"};
const pageBoxes=new Map();let owner=false,ready=false,dirty=false,busy=false,server=null;
$("ad-config-environment").textContent=adConfigId()==="live"?"Production settings · owner write access only":"Preview settings · isolated from production · owner write access only";
for(const path of BANNER_PATHS){const label=document.createElement("label");label.className="ad-check";const input=document.createElement("input");input.type="checkbox";label.append(input,document.createTextNode(path==="/"?"Homepage":path));$("ad-page-controls").append(label);pageBoxes.set(path,input);}
function paint(s){if(!s)return;for(const [key,id] of Object.entries(ids))$(id).checked=s[key];$("ad-levels").value=s.levelsBetween;$("ad-minutes").value=s.minutesBetween;for(const [path,box] of pageBoxes)box.checked=!s.disabledPaths.includes(path);}
function sync(){fields.disabled=!owner||!ready||busy;$("ad-config-save").disabled=!dirty;$("ad-config-reset").disabled=!dirty;}
watchOwnerRole(allowed=>{owner=allowed===true;sync();if(ready&&!dirty&&!busy)status.textContent=owner?"Settings loaded.":"Read-only: only the active owner can change settings.";});
watchAdSettings(next=>{
 ready=next.ready;if(!ready){status.textContent=next.error||"Settings unavailable.";sync();return;}
 server=next.settings;if(!dirty&&!busy){paint(server);status.textContent=owner?"Settings loaded.":"Read-only: only the active owner can change settings.";}sync();
});
form.addEventListener("input",()=>{dirty=true;sync();});
$("ad-config-reset").onclick=()=>{dirty=false;paint(server);status.textContent="Unsaved edits discarded.";sync();};
form.addEventListener("submit",async event=>{
 event.preventDefault();if(!owner||!ready||busy||!dirty)return;
 let value;
 try{value=validateAdSettings({...Object.fromEntries(Object.entries(ids).map(([key,id])=>[key,$(id).checked])),levelsBetween:Number($("ad-levels").value),minutesBetween:Number($("ad-minutes").value),disabledPaths:[...pageBoxes].filter(([,box])=>!box.checked).map(([path])=>path)});}
 catch(error){status.textContent=error.message;return;}
 busy=true;sync();status.textContent="Saving…";
 try{await saveAdSettings(value);dirty=false;server=value;paint(value);status.textContent="Saved. Real ads remain locked off.";}
 catch(error){status.textContent=error.message||"Save failed."; }
 finally{busy=false;sync();}
});
