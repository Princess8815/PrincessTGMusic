import {
  getSiteSettings,saveSiteSettings,applySiteSettings,
  DEFAULT_SETTINGS,DEFAULT_PALETTE,
  rgbFromHex,hexFromRgb,colorContrast
} from "./site-shell.js";
import {
  isLocalPreview,getLocalFirebaseMode,setLocalFirebaseMode,
  LOCAL_FIREBASE_MODE_KEY
} from "./firebase-mode.js";

const $=id=>document.getElementById(id);
const form=$("site-settings-form");
const status=$("settings-status");
const editor=$("settings-rgb-editor");
const FIELDS=[
  ["primary","Primary","Buttons, active controls and accents"],
  ["secondary","Secondary","Cards, panels and navigation"],
  ["tertiary","Tertiary","Page and input backgrounds"],
  ["textColor","Text","Main text and labels"],
  ["highlight","Highlights","Links, headings and focus outlines"]
];
let draft={...getSiteSettings()};
const controls={};

function buildEditor(){
  for(const [key,title,help] of FIELDS){
    const row=document.createElement("div");row.className="settings-color-row";
    const heading=document.createElement("div");heading.className="settings-color-heading";
    const label=document.createElement("label");
    label.htmlFor="settings-color-"+key;label.textContent=title;
    const note=document.createElement("small");note.textContent=help;
    heading.append(label,note);

    const picker=document.createElement("input");picker.type="color";
    picker.id="settings-color-"+key;
    picker.setAttribute("aria-label",title+" color picker");
    picker.title="Pick "+title.toLowerCase()+" color";
    const channels=document.createElement("div");channels.className="settings-rgb-channels";
    const numbers=[];
    ["R","G","B"].forEach((channel,index)=>{
      const wrapper=document.createElement("label");wrapper.className="settings-rgb-channel";
      wrapper.textContent=channel;
      const number=document.createElement("input");
      number.type="number";number.min="0";number.max="255";number.step="1";
      number.id="settings-"+channel.toLowerCase()+"-"+key;
      number.setAttribute("aria-label",title+" "+channel+" channel (0 to 255)");
      wrapper.append(number);channels.append(wrapper);numbers.push(number);
      const sync=()=>{
        if(numbers.some(box=>box.value.trim()===""))return;
        try{
          const value=hexFromRgb(...numbers.map(box=>Number(box.value)));
          setColor(key,value);
        }catch{
          status.textContent="RGB values must be whole numbers between 0 and 255.";
        }
      };
      number.addEventListener("input",sync);
      number.addEventListener("change",()=>{
        const n=Number(number.value);
        number.value=String(Math.max(0,Math.min(255,Number.isFinite(n)?Math.round(n):0)));
        sync();
      });
    });
    picker.addEventListener("input",()=>setColor(key,picker.value));
    const inputs=document.createElement("div");inputs.className="settings-color-inputs";
    inputs.append(picker,channels);
    row.append(heading,inputs);editor.append(row);
    controls[key]={picker,numbers};
  }
}
function fill(settings){
  draft={...settings};
  $("settings-text").value=settings.text;
  $("settings-contrast").checked=settings.contrast==="high";
  $("settings-motion").checked=settings.motion==="reduce";
  for(const [key] of FIELDS){
    controls[key].picker.value=draft[key];
    const rgb=rgbFromHex(draft[key]);
    controls[key].numbers.forEach((box,index)=>{box.value=String(rgb[index]);});
  }
  preview();
}
function collect(){
  return {
    ...draft,
    text:$("settings-text").value,
    contrast:$("settings-contrast").checked?"high":"normal",
    motion:$("settings-motion").checked?"reduce":"normal"
  };
}
function updateWarnings(){
  const sample=collect();
  const textOnPanel=colorContrast(sample.textColor,sample.secondary);
  const textOnPage=colorContrast(sample.textColor,sample.tertiary);
  const links=colorContrast(sample.highlight,sample.tertiary);
  const problems=[];
  if(textOnPanel<4.5||textOnPage<4.5)
    problems.push("Text may be difficult to read against your backgrounds.");
  if(links<3)problems.push("Highlights may be difficult to distinguish from your page background.");
  $("settings-contrast-warning").textContent=problems.length
    ? "Contrast note: "+problems.join(" ")+" You can still save these colors."
    : "Colors pass the basic text and highlight contrast checks.";
  $("settings-contrast-warning").dataset.warning=problems.length?"true":"false";
}
function preview(){
  applySiteSettings(collect());
  updateWarnings();
}
function setColor(key,value){
  draft[key]=value;
  controls[key].picker.value=value;
  const rgb=rgbFromHex(value);
  controls[key].numbers.forEach((box,i)=>{box.value=String(rgb[i]);});
  preview();
  status.textContent="Previewing changes. Save preferences to keep them.";
}
for(const id of ["settings-text","settings-contrast","settings-motion"])
  $(id).addEventListener("change",preview);
buildEditor();
fill(getSiteSettings());

form.addEventListener("submit",event=>{
  event.preventDefault();
  try{
    const saved=saveSiteSettings(collect());
    fill(saved);
    status.textContent="Your colors and preferences were saved in this browser.";
  }catch(error){status.textContent="Could not save settings: "+error.message;}
});
$("settings-reset-palette").addEventListener("click",()=>{
  for(const [key] of FIELDS)draft[key]=DEFAULT_PALETTE[key];
  fill(collect());
  status.textContent="Original PrincessTG violet palette previewed. Save to keep it.";
});
$("settings-cancel").addEventListener("click",()=>{
  fill(getSiteSettings());
  status.textContent="Unsaved changes discarded.";
});
$("settings-reset").addEventListener("click",()=>{
  try{
    const saved=saveSiteSettings({...DEFAULT_SETTINGS});
    fill(saved);
    status.textContent="All settings restored to PrincessTG defaults.";
  }catch(error){status.textContent="Could not reset settings: "+error.message;}
});
window.addEventListener("storage",event=>{
  if(event.key==="princesstg-site-preferences-v1"){
    fill(getSiteSettings());
    status.textContent="Theme updated from another tab.";
  }
});


// Developer-only Firebase connection switch. The public site never displays
// this section, and mode selection never changes the already-running SDK.
function initFirebaseModeSwitch(){
  if(!isLocalPreview())return;
  const section=$("local-firebase-settings");
  const toggle=$("settings-use-emulators");
  const current=$("settings-firebase-current");
  const warning=$("settings-firebase-warning");
  const outcome=$("settings-firebase-status");
  if(!section||!toggle)return;
  section.hidden=false;

  function render(){
    const mode=getLocalFirebaseMode();
    const emulator=mode==="emulator";
    toggle.checked=emulator;
    section.dataset.mode=mode;
    current.textContent=emulator
      ? "Current mode: LOCAL EMULATORS · demo-princesstg"
      : "Current mode: LIVE FIREBASE · music-and-poetry";
    warning.textContent=emulator
      ? "Test accounts and messages are isolated. Start the emulators on ports 9099 and 8080."
      : "Warning: this mode uses real user accounts and the live Firestore database. Tests can change or delete real data.";
  }
  render();
  toggle.addEventListener("change",()=>{
    const original=getLocalFirebaseMode();
    const requested=toggle.checked?"emulator":"production";
    if(original===requested)return;
    if(requested==="production" && !window.confirm(
      "Switch this local preview to LIVE Firebase?\n\n"+
      "Your next login, profile changes, bans, and messages will use REAL accounts and REAL database records. "+
      "Do not run destructive tests in this mode.\n\nContinue?"
    )){
      toggle.checked=true;
      return;
    }
    try{
      setLocalFirebaseMode(requested);
      outcome.textContent="Switching to "+(requested==="emulator"?"local emulators":"live Firebase")+
        ". Reloading to establish a separate Firebase session...";
      // Existing Firebase app instances and listeners must never be
      // repointed while active; the full navigation initializes fresh ones.
      window.location.reload();
    }catch(error){
      render();
      outcome.textContent="Could not change Firebase mode: "+error.message;
    }
  });
  window.addEventListener("storage",event=>{
    if(event.key===LOCAL_FIREBASE_MODE_KEY){
      // Another local tab switched the origin. Reload instead of showing a
      // mode label that disagrees with active Firebase instances.
      window.location.reload();
    }
  });
}
initFirebaseModeSwitch();
