// Menu interactions only; future world and combat systems belong in separate files.
"use strict";
const SETTINGS_KEY = "axolotl-rpg:menu-settings";
const motionInput = document.getElementById("motion-setting");
const lightingInput = document.getElementById("lighting-setting");

function loadSettings() {
  const defaults = { motion: !matchMedia("(prefers-reduced-motion: reduce)").matches, lighting: "day" };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return { motion: typeof saved.motion === "boolean" ? saved.motion : defaults.motion,
      lighting: saved.lighting === "evening" ? "evening" : "day" };
  } catch { return defaults; }
}

function applySettings(settings) {
  document.body.classList.toggle("motion-off", !settings.motion);
  document.body.classList.toggle("motion-on", settings.motion);
  document.body.classList.toggle("twilight", settings.lighting === "evening");
  motionInput.checked = settings.motion;
  lightingInput.value = settings.lighting;
}

function saveSettings() {
  const settings = { motion: motionInput.checked, lighting: lightingInput.value };
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

document.getElementById("play-button").addEventListener("click", () => openDialog("play-dialog"));
document.getElementById("options-button").addEventListener("click", () => openDialog("options-dialog"));
document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => document.getElementById(button.dataset.close).close());
});
motionInput.addEventListener("change", saveSettings);
lightingInput.addEventListener("change", saveSettings);
applySettings(loadSettings());
loadMenuConfig();
