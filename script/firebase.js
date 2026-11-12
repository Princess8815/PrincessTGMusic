
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Authentication
const auth = getAuth(app);

// Initialize Firestore
const db = getFirestore(app);

// Export Firebase services
export { app, auth, db };
