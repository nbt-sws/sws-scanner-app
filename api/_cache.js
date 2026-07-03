// api/_cache.js
// Image-content-addressed cache for AI scan results.
// Key = SHA-256 of the raw image bytes. Stored in Firestore /scans/{hash}.
// Same physical card → same hash → Haiku is only called once across all users.

import crypto from 'crypto';
import sharp from 'sharp';
import { getDb, getBucket } from './_firebase-admin.js';

const COLLECTION = 'scans';

// Compute a stable hash of base64 image data (strips data URL prefix first).
export function hashImage(b64OrDataUrl) {
  const b64 = String(b64OrDataUrl || '').replace(/^data:image\/\w+;base64,/, '');
  return crypto.createHash('sha256').update(b64).digest('hex');
}

// ------------------------------------------------------------------
// Perceptual hash (pHash) — 64-bit visual fingerprint of an image.
// Same physical card photographed slightly differently produces the
// same or nearly-identical pHash. Exact match = visually identical;
// Hamming distance ≤ 6 = visually similar.
// Returns a 16-character hex string.
// ------------------------------------------------------------------
export async function perceptualHash(b64OrDataUrl) {
  try {
    const b64 = String(b64OrDataUrl || '').replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(b64, 'base64');
    const { data } = await sharp(buf)
      .greyscale()
      .resize(8, 8, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    let hex = '';
    let nibble = 0;
    for (let i = 0; i < 64; i++) {
      nibble = (nibble << 1) | (data[i] > mean ? 1 : 0);
      if ((i + 1) % 4 === 0) {
        hex += nibble.toString(16);
        nibble = 0;
      }
    }
    return hex;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cache] perceptualHash failed:', e.message);
    return null;
  }
}

// Exact pHash lookup against verified_cards/contributions across all docs.
// Returns the matching verified_cards record (parent), or null.
export async function lookupByPHash(pHash) {
  if (!pHash) return null;
  try {
    // Use collectionGroup to query all contributions subcollections in one go.
    const snap = await getDb().collectionGroup('contributions')
      .where('pHash', '==', pHash).limit(1).get();
    if (snap.empty) return null;
    const contribDoc = snap.docs[0];
    const parent = contribDoc.ref.parent.parent;
    if (!parent) return null;
    const parentSnap = await parent.get();
    return parentSnap.exists ? { ...parentSnap.data(), docKey: parent.id } : null;
  } catch {
    return null;
  }
}

// Look up a cached scan by hash. Returns null on miss or any error.
export async function getCachedScan(hash) {
  if (!hash) return null;
  try {
    const db = getDb();
    const snap = await db.collection(COLLECTION).doc(hash).get();
    if (!snap.exists) return null;
    const data = snap.data();
    return {
      ...data,
      cached: true,
      cachedAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cache] getCachedScan failed:', e.message);
    return null;
  }
}

// Write a fresh scan result to the cache. Idempotent — uses doc(hash).set.
export async function putCachedScan(hash, payload) {
  if (!hash) return;
  try {
    const db = getDb();
    const admin = (await import('firebase-admin')).default;
    await db.collection(COLLECTION).doc(hash).set({
      ...payload,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cache] putCachedScan failed:', e.message);
  }
}

// Upload the original image bytes to Storage at scans/{hash}.{ext}.
// Returns the public URL or null on failure. Safe to call repeatedly —
// Storage overwrite is fine since the content hash matches.
export async function uploadScanImage(hash, b64OrDataUrl) {
  if (!hash) return null;
  try {
    const dataUrlMatch = String(b64OrDataUrl || '').match(/^data:(image\/\w+);base64,(.+)$/);
    const contentType = dataUrlMatch ? dataUrlMatch[1] : 'image/jpeg';
    const ext = contentType.split('/')[1] || 'jpg';
    const b64 = dataUrlMatch ? dataUrlMatch[2] : String(b64OrDataUrl).replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(b64, 'base64');

    const bucket = getBucket();
    const file = bucket.file(`scans/${hash}.${ext}`);
    await file.save(buf, {
      contentType,
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
      resumable: false,
    });
    // Best-effort public URL. Storage rules above keep reads behind auth,
    // so we return a getDownloadURL-style token URL.
    await file.makePublic().catch(() => { /* if rules block, fall back to signed URL on read */ });
    return `https://storage.googleapis.com/${bucket.name}/scans/${hash}.${ext}`;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cache] uploadScanImage failed:', e.message);
    return null;
  }
}
