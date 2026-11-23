// Local-only Firebase environment preference.
// Never allow a public website hostname to select emulator endpoints.
export const LOCAL_FIREBASE_MODE_KEY="princesstg-local-firebase-mode-v1";
export const DEMO_FIREBASE_PROJECT="demo-princesstg";

export function isLocalPreview(){
  return ["localhost","127.0.0.1"].includes(window.location.hostname);
}

export function getLocalFirebaseMode(){
  if(!isLocalPreview())return "production";
  try{
    // Safer default: keep existing localhost preview behavior isolated
    // from live accounts until the developer explicitly opts into live mode.
    return window.localStorage.getItem(LOCAL_FIREBASE_MODE_KEY)==="production"
      ? "production" : "emulator";
  }catch{
    return "emulator";
  }
}

export function setLocalFirebaseMode(nextMode){
  if(!isLocalPreview())
    throw Error("Firebase mode can only be changed on localhost or 127.0.0.1.");
  if(!["production","emulator"].includes(nextMode))
    throw Error("Choose Live Firebase or Local Emulators.");
  window.localStorage.setItem(LOCAL_FIREBASE_MODE_KEY,nextMode);
  // The active Firebase app cannot be safely swapped mid-session.
  // The caller must reload the page after saving this preference.
}
