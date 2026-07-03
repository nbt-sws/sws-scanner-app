// api/_firebase-admin.js
// Server-side Firebase Admin SDK init. Loaded by all /api/*.js routes that
// need Firestore writes or Storage uploads. The leading underscore makes
// Vercel skip this file when discovering serverless function entry points.

import admin from 'firebase-admin';

let initialized = false;

function decodeServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!b64) return null;
  try {
    const json = Buffer.from(b64, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[firebase-admin] Failed to decode FIREBASE_SERVICE_ACCOUNT_B64:', e.message);
    return null;
  }
}

export function getAdmin() {
  if (initialized) return admin;
  const serviceAccount = decodeServiceAccount();
  if (!serviceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 not set or malformed');
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
  initialized = true;
  return admin;
}

export function getDb() {
  return getAdmin().firestore();
}

export function getBucket() {
  return getAdmin().storage().bucket();
}

// Verify a Firebase ID token sent from the client.
// Returns the decoded token (with uid) or null if invalid/missing.
export async function verifyUser(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;
  try {
    return await getAdmin().auth().verifyIdToken(idToken);
  } catch (e) {
    return null;
  }
}
