import {getSiteSettings, saveSiteSettings, DEFAULT_SETTINGS} from "./site-shell.js";
const $=id=>document.getElementById(id);
const form=$("site-settings-form");
const status=$("settings-status");
function fill(settings){
  $("settings-accent").value=settings.accent;
  $("settings-text").value=settings.text;
  $("settings-contrast").checked=settings.contrast==="high";
  $("settings-motion").checked=settings.motion==="reduce";
}
function collect(){
  return {
    accent:$("settings-accent").value,
    text:$("settings-text").value,
    contrast:$("settings-contrast").checked?"high":"normal",
    motion:$("settings-motion").checked?"reduce":"normal"
  };
}
fill(getSiteSettings());
form.addEventListener("submit",event=>{
  event.preventDefault();
  try{
    saveSiteSettings(collect());
    status.textContent="Preferences saved to this browser.";
  }catch(error){
    status.textContent="Could not save settings: "+error.message;
  }
});
$("settings-reset").addEventListener("click",()=>{
  try{
    saveSiteSettings({...DEFAULT_SETTINGS});
    fill(getSiteSettings());
    status.textContent="Preferences reset to defaults.";
  }catch(error){status.textContent="Could not reset settings: "+error.message;}
});
