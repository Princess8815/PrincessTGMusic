
let audio=null,lastSound=-Infinity,pending=false;
const seen=new WeakMap();
const selector=".toast,.ptg-toast,.site-toast,.notification-toast,[data-toast],[data-ptg-toast],[id$='-toast']";
function unlock(){
 try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;if(!audio)audio=new C();if(audio.state!=="running")audio.resume().then(()=>{if(pending){pending=false;playToastSound();}}).catch(()=>{});else if(pending){pending=false;playToastSound();}}catch{}
}
export function playToastSound(){
 if(!audio||audio.state!=="running"){pending=true;return;}
 const now=performance.now();if(now-lastSound<100)return;lastSound=now;
 try{const t=audio.currentTime;for(const [hz,offset] of [[660,0],[880,.09]]){const o=audio.createOscillator(),g=audio.createGain();o.type="sine";o.frequency.value=hz;g.gain.setValueAtTime(.0001,t+offset);g.gain.exponentialRampToValueAtTime(.065,t+offset+.015);g.gain.exponentialRampToValueAtTime(.0001,t+offset+.15);o.connect(g).connect(audio.destination);o.start(t+offset);o.stop(t+offset+.16);}}catch{}
}
function inspect(node){
 if(!(node instanceof Element))return;
 const nodes=[...(node.matches(selector)?[node]:[]),...node.querySelectorAll(selector)];
 for(const el of nodes){
  const message=el.textContent.trim(),visible=!!message&&!el.hidden&&el.getAttribute("aria-hidden")!=="true"&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=="hidden"&&getComputedStyle(el).opacity!=="0";
  const previous=seen.get(el);if(visible&&(!previous?.visible||previous.message!==message))playToastSound();seen.set(el,{visible,message});
 }
}
export function showToast(message){
 let stack=document.getElementById("ptg-toast-stack");
 if(!stack){stack=document.createElement("div");stack.id="ptg-toast-stack";stack.className="ptg-toast-stack";stack.setAttribute("aria-live","polite");(document.fullscreenElement||document.querySelector(".ac-expanded,.ce-expanded,.pp-expanded")||document.body).append(stack);}
 const node=document.createElement("div");node.className="ptg-toast";node.textContent=message;stack.append(node);setTimeout(()=>node.remove(),6500);
}
if(typeof document!=="undefined"){
 document.addEventListener("pointerdown",unlock,{passive:true});document.addEventListener("keydown",unlock);
 const start=()=>{
  const observer=new MutationObserver(records=>{for(const r of records){const el=r.target.nodeType===1?r.target:r.target.parentElement;if(el){const toast=el.closest(selector);if(toast)inspect(toast);else if(r.type==="attributes")inspect(el);}for(const node of r.addedNodes)inspect(node);}});
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["hidden","class","style","aria-hidden"]});
 };
 if(document.body)start();else document.addEventListener("DOMContentLoaded",start,{once:true});
}
