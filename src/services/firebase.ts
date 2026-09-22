// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
// IMPORTANT: It is recommended to move this configuration to environment variables
const firebaseConfig = {
  apiKey: "AIzaSyCEC7olZ4cxCEZKu_VbcKdEvyPD2ikHhXQ",
  authDomain: "travel-planner-cf0d4.firebaseapp.com",
  projectId: "travel-planner-cf0d4",
  storageBucket: "travel-planner-cf0d4.firebasestorage.app",
  messagingSenderId: "1004456579134",
  appId: "1:1004456579134:web:e3abc7a89717c1d302816f",
  measurementId: "G-4R1Z7K8Y46"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Firestore security rules can only test `request.auth`, so real sign-in is
// what makes them enforceable at all. Before this existed the rules had to be
// `allow read, write: if true` for the app to work, which meant anyone holding
// the apiKey above — it ships in the bundle — could read and delete everything.
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { db, auth, googleProvider };
