// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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

export { db };
