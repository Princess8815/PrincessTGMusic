
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {isLocalPreview,getLocalFirebaseMode,DEMO_FIREBASE_PROJECT} from "./firebase-mode.js";



// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCwvrTr8JBvk1YC9uTNeXjGLZmH9G1zKig",
  authDomain: "music-and-poetry.firebaseapp.com",
  projectId: "music-and-poetry",
  storageBucket: "music-and-poetry.firebasestorage.app",
  messagingSenderId: "169753727453",
  appId: "1:169753727453:web:aad66695a3fc7f77732634",
  measurementId: "G-XYNRZ5WWXR"
};


// Local previews default to the emulator, but Settings can explicitly
// switch this browser origin to live Firebase. Public sites are always live.
const testingLocally=isLocalPreview();
export const usingLocalFirebaseEmulators=
  testingLocally&&getLocalFirebaseMode()==="emulator";

// Give the emulator a separate Firebase app name. Firebase Auth persistence
// uses the app name, keeping local test login state separate from live login.
const app = usingLocalFirebaseEmulators
  ? initializeApp({
      ...firebaseConfig,
      projectId:DEMO_FIREBASE_PROJECT,
      authDomain:DEMO_FIREBASE_PROJECT+".firebaseapp.com"
    },"princesstg-local-emulator")
  : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

// Keep local-only diagnostics separate from production services. The demo
// project ID must match the CLI flag --project demo-princesstg.
const localFirestoreURL = "http://127.0.0.1:8080";
let lastEmulatorProbe = null;

export async function checkLocalFirestoreEmulator() {
  if (!usingLocalFirebaseEmulators) return {connected:true,local:false};
  // An HTTP response, even 404, proves a service is listening on port 8080.
  // Use no-cors to avoid depending on an emulator-only CORS header.
  const now=Date.now();
  if(lastEmulatorProbe && now-lastEmulatorProbe.checkedAt<2500)
    return lastEmulatorProbe.value;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),3000);
  let value;
  try {
    await fetch(localFirestoreURL+"/", {
      method:"GET",mode:"no-cors",cache:"no-store",signal:controller.signal
    });
    value={connected:true,local:true,projectId:DEMO_FIREBASE_PROJECT};
  } catch(error) {
    value={
      connected:false,local:true,projectId:DEMO_FIREBASE_PROJECT,
      cause:error?.name==="AbortError"?"timeout":"connection"
    };
  } finally {
    clearTimeout(timeout);
  }
  lastEmulatorProbe={value,checkedAt:Date.now()};
  return value;
}

if (usingLocalFirebaseEmulators) {
  connectAuthEmulator(
    auth,
    "http://127.0.0.1:9099"
  );

  connectFirestoreEmulator(
    db,
    "127.0.0.1",
    8080
  );

  console.log("Using LOCAL Firebase emulators");
} else {
  console.log(testingLocally
    ? "Local preview is explicitly using LIVE Firebase. Changes affect real accounts."
    : "Using production Firebase");
}

export { app, auth, db };
