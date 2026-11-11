// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
const analytics = getAnalytics(app);