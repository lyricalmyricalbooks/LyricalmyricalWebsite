import { initializeApp } from "firebase/app";

import { initializeBrowserAppCheck } from "./appCheck";

const firebaseConfig = {
  apiKey: "AIzaSyB9V866zhYfSoXplpzK1oaK7dTuXV7yDxA",
  authDomain: "lyricalmyrical-web-v2.firebaseapp.com",
  projectId: "lyricalmyrical-web-v2",
  storageBucket: "lyricalmyrical-web-v2.firebasestorage.app",
  messagingSenderId: "248894589273",
  appId: "1:248894589273:web:8bf4b06399c0931f1b6448"
};

// The shopper bundle starts with just the app and App Check. Shopper reads/writes use Firestore Lite
// (./firestoreLite); the full Firestore SDK and Firebase Auth live in ./firebase and load only with
// admin, checkout, account or a saved sign-in. Both Firestore editions pick up the signed-in user's
// and App Check's tokens whenever those register, so nothing has to load in a fixed order.
export const app = initializeApp(firebaseConfig);

// One Enterprise provider; legacy v3 keys are no longer used. Must run before Firestore/Auth start.
export const appCheck = initializeBrowserAppCheck(app);

export { authState } from "./authState";
