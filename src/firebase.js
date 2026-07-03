// src/firebase.js
// Client-side Firebase SDK init. Used by auth, vault, and storage modules.
// All values read from REACT_APP_* env vars (public — embedded in the JS bundle).

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

// Guard against missing config in local dev so the app still boots.
const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const firebaseEnabled = isConfigured;

export const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = isConfigured ? getAuth(app) : null;
export const db = isConfigured ? getFirestore(app) : null;
export const storage = isConfigured ? getStorage(app) : null;

export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

// LINE OAuth (v14, C1) — Thai-market default sign-in.
// Configured as a CUSTOM OIDC PROVIDER in the Firebase Console (Auth →
// Sign-in method → Add new provider → OpenID Connect, with provider ID
// "oidc.line"). See AUTH-SETUP-LINE.md for the full Firebase + LINE
// Developer Console setup walkthrough.
export const lineProvider = new OAuthProvider('oidc.line');
lineProvider.addScope('profile');
lineProvider.addScope('openid');
lineProvider.addScope('email');

if (!isConfigured && typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.warn(
    '[firebase] No client config detected. Set REACT_APP_FIREBASE_* in .env.local. ' +
    'App will run in OFFLINE mode (mock vault, no sign-in, no cloud storage).'
  );
}
