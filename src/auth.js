// src/auth.js
// Sign-in / sign-up flows. Three providers: email/password, Google, Apple.
// Exposes a useAuth() hook for components and exportable verbs (signInWithGoogle, signOut, etc.).

import { useEffect, useState, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, googleProvider, appleProvider, lineProvider, firebaseEnabled } from './firebase';

// ------------------------------------------------------------
// Hook — subscribe to auth state, plus loading flag.
// ------------------------------------------------------------
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseEnabled || !auth) {
      setLoading(false);
      return undefined;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const getIdToken = useCallback(async () => {
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }, [user]);

  return { user, loading, getIdToken };
}

// Make sure a /users/{uid} doc exists after first sign-in.
async function ensureUserDoc(user) {
  if (!db || !user) return;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
      createdAt: serverTimestamp(),
      subscriptionTier: 'free',
      preferences: {
        currency: 'THB',
        defaultTcg: 'op',
      },
    });
  }
}

// ------------------------------------------------------------
// Email / password
// ------------------------------------------------------------
export async function signInEmail(email, password) {
  if (!auth) throw new Error('Firebase not configured');
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function signUpEmail(email, password, displayName) {
  if (!auth) throw new Error('Firebase not configured');
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  await ensureUserDoc(cred.user);
  return cred.user;
}

// ------------------------------------------------------------
// Google
// ------------------------------------------------------------
export async function signInWithGoogle() {
  if (!auth) throw new Error('Firebase not configured');
  const cred = await signInWithPopup(auth, googleProvider);
  await ensureUserDoc(cred.user);
  return cred.user;
}

// ------------------------------------------------------------
// Apple (works on web + Capacitor iOS via popup; native iOS can use a plugin later)
// ------------------------------------------------------------
export async function signInWithApple() {
  if (!auth) throw new Error('Firebase not configured');
  const cred = await signInWithPopup(auth, appleProvider);
  await ensureUserDoc(cred.user);
  return cred.user;
}

// ------------------------------------------------------------
// LINE — v14, C1
// Thai-market default sign-in. Requires the OIDC provider "oidc.line" to
// be configured in the Firebase Console + a matching LINE Login channel
// in LINE Developer Console (channel ID = OIDC client ID, channel secret
// = OIDC client secret). See AUTH-SETUP-LINE.md for the walkthrough.
//
// signInWithPopup is the canonical web flow. On RN we'll use the same
// provider with a redirect-style flow via expo-auth-session (lands with
// C0c in the mobile shell).
// ------------------------------------------------------------
export async function signInWithLine() {
  if (!auth) throw new Error('Firebase not configured');
  if (!lineProvider) throw new Error('LINE provider not initialized');
  const cred = await signInWithPopup(auth, lineProvider);
  await ensureUserDoc(cred.user);
  return cred.user;
}

// ------------------------------------------------------------
// Sign-out
// ------------------------------------------------------------
export async function signOut() {
  if (!auth) return;
  await fbSignOut(auth);
}
