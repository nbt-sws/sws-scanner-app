// src/storage.js
// Client-side photo upload helpers. Card photos land at /cards/{uid}/{filename}
// in Firebase Storage. Returns the public URL on success.

import { ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
import { storage, firebaseEnabled } from './firebase';

function newCardFilename(ext = 'jpg') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${stamp}_${rand}.${ext}`;
}

// Upload a Blob or File to /cards/{uid}/{filename}. Returns download URL.
export async function uploadCardBlob(uid, blob, ext = 'jpg') {
  if (!firebaseEnabled || !storage) {
    throw new Error('Firebase storage not configured');
  }
  if (!uid) throw new Error('uid required for upload');
  const filename = newCardFilename(ext);
  const path = `cards/${uid}/${filename}`;
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: blob.type || `image/${ext}` });
  const url = await getDownloadURL(r);
  return { url, path };
}

// Upload a data-URL string (what canvas.toDataURL() returns).
export async function uploadCardDataUrl(uid, dataUrl) {
  if (!firebaseEnabled || !storage) {
    throw new Error('Firebase storage not configured');
  }
  if (!uid) throw new Error('uid required for upload');
  const match = String(dataUrl).match(/^data:(image\/\w+);base64,/);
  const contentType = match ? match[1] : 'image/jpeg';
  const ext = contentType.split('/')[1] || 'jpg';
  const filename = newCardFilename(ext);
  const path = `cards/${uid}/${filename}`;
  const r = ref(storage, path);
  await uploadString(r, dataUrl, 'data_url', { contentType });
  const url = await getDownloadURL(r);
  return { url, path };
}

// Convert a data URL into a Blob for cases where we want to use Blob APIs.
export function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',');
  const mime = (header.match(/data:(.*?);/) || [null, 'image/jpeg'])[1];
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
