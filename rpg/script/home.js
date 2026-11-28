// Main menu: the audio engine is intentionally in its own module.
import { RpgAudio } from "./audio.js";

const SETTINGS_KEY = "axolotl-rpg:menu-settings";
const motionInput = document.getElementById("motion-setting");
const lightingInput = document.getElementById("lighting-setting");
const musicInput = document.getElementById("music-volume");
const soundInput = document.getElementById("sound-volume");
const audioStatus = document.getElementById("audio-status");
const audio = new RpgAudio();

function volume(value, fallback) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
}

function loadSettings() {
  const defaults = {
    motion: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    lighting: "day", musicVolume: 55, soundVolume: 70
  };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      motion: typeof saved.motion === "boolean" ? saved.motion : defaults.motion,
      lighting: saved.lighting === "evening" ? "evening" : "day",
      musicVolume: volume(saved.musicVolume, defaults.musicVolume),
      soundVolume: volume(saved.soundVolume, defaults.soundVolume)
    };
  } catch { return defaults; }
}

function applySettings(settings) {
  document.body.classList.toggle("motion-off", !settings.motion);
  document.body.classList.toggle("motion-on", settings.motion);
  document.body.classList.toggle("twilight", settings.lighting === "evening");
  motionInput.checked = settings.motion;
  lightingInput.value = settings.lighting;
  musicInput.value = settings.musicVolume;
  soundInput.value = settings.soundVolume;
  document.getElementById("music-volume-value").textContent = settings.musicVolume + "%";
  document.getElementById("sound-volume-value").textContent = settings.soundVolume + "%";
  audio.setVolumes(settings.musicVolume / 100, settings.soundVolume / 100);
}

function saveSettings() {
  const settings = {
    motion: motionInput.checked, lighting: lightingInput.value,
    musicVolume: Number(musicInput.value), soundVolume: Number(soundInput.value)
  };
  applySettings(settings);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
  catch { /* Menu remains usable if storage is blocked. */ }
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (!dialog.open) dialog.showModal();
}

async function loadMenuConfig() {
  try {
    const response = await fetch("json/menu.json");
    if (!response.ok) throw new Error("Menu config unavailable");
    const config = await response.json();
    if (typeof config.version === "string") document.getElementById("version-label").textContent = config.version;
    if (typeof config.playMessage === "string") document.getElementById("play-message").textContent = config.playMessage;
  } catch (error) { console.warn("Using built-in menu text.", error); }
}

// A real user gesture is required by browser autoplay policies.
// Retry on subsequent interactions if the browser initially blocks audio.
function activateAudio() {
  return audio.unlock().then(ready => {
    if (ready) audioStatus.textContent = "";
    else audioStatus.textContent = audio.supported ? "Interact again to enable audio." : "Audio is unavailable in this browser.";
    return ready;
  });
}

document.addEventListener("click", event => {
  const button = event.target.closest("button");
  const effect = button?.id === "play-button" ? "play"
    : button?.id === "options-button" ? "open"
    : button?.hasAttribute("data-close") ? "close" : null;
  activateAudio().then(ready => { if (ready && effect) audio.playEffect(effect); });
}, true);
document.addEventListener("keydown", event => {
  if (!event.repeat) activateAudio();
}, true);

document.getElementById("play-button").addEventListener("click", () => openDialog("play-dialog"));
document.getElementById("options-button").addEventListener("click", () => openDialog("options-dialog"));
document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => document.getElementById(button.dataset.close).close());
});
document.querySelectorAll("dialog").forEach(dialog => {
  dialog.addEventListener("cancel", () => audio.playEffect("close"));
});
motionInput.addEventListener("change", () => { saveSettings(); audio.playEffect("select"); });
lightingInput.addEventListener("change", () => { saveSettings(); audio.playEffect("select"); });
musicInput.addEventListener("input", saveSettings);
soundInput.addEventListener("input", saveSettings);
soundInput.addEventListener("change", () => audio.playEffect("select"));
document.addEventListener("visibilitychange", () => audio.setHidden(document.hidden));
window.addEventListener("pagehide", () => audio.setHidden(true));
window.addEventListener("pageshow", () => audio.setHidden(document.hidden));

applySettings(loadSettings());
loadMenuConfig();
