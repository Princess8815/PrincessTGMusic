
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";



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


const testingLocally = [
  "localhost",
  "127.0.0.1"
].includes(window.location.hostname);

// Match the demo project running in the emulator.
const app = initializeApp(
  testingLocally
    ? {
        ...firebaseConfig,
        projectId: "demo-princesstg",
        authDomain: "demo-princesstg.firebaseapp.com"
      }
    : firebaseConfig
);

const auth = getAuth(app);
const db = getFirestore(app);

if (testingLocally) {
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
  console.log("Using production Firebase");
}

export { app, auth, db };
