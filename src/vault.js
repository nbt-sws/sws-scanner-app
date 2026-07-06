// src/vault.js
// SwibsVault data layer — backed by Firestore /vault collection.
// Each doc has a userId field; security rules enforce ownership.
// Components consume via the useVault() hook which subscribes to live updates.

import { apiUrl } from './api';
import { compressImageSafe } from './lib/image';
import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db, firebaseEnabled } from './firebase';

const VAULT = 'vault';

// ------------------------------------------------------------
// Mock fallback — used when Firebase isn't configured (offline dev).
// Mirrors v12 shape so the UI works either way.
// ------------------------------------------------------------
const OFFLINE_VAULT = [
  {
    id: 'v1', code: 'LOCH-JP003', nameEn: "Magician's Curtain", nameJp: '黒魔導のカーテン',
    tcg: 'ygo', lang: 'JP', condition: 'Raw', rarity: 'Overframe PSE', type: null,
    promo: false, paid: 12400, current: 18440, sold: null,
    purchaseDate: '2026-04-15',
  },
  {
    id: 'v2', code: 'OP07-051', nameEn: 'Boa Hancock', nameJp: null,
    tcg: 'op', lang: 'JP', condition: 'Raw', rarity: 'SR', type: 'Character',
    promo: true, paid: 3200, current: 14000, sold: 14000, soldDate: '2026-04-23',
    purchaseDate: '2026-04-10',
  },
];

// ------------------------------------------------------------
// Local-storage offline fallback when Firebase is not configured.
const VAULT_STORAGE_KEY = 'sws_vault';

function readLocalVault() {
  if (typeof window === 'undefined') return OFFLINE_VAULT;
  try {
    const raw = window.localStorage.getItem(VAULT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return OFFLINE_VAULT;
}

function writeLocalVault(items) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(items));
  } catch { /* ignore */ }
}

// Subscribe to a user's vault. Returns { items, loading, error }.
// ------------------------------------------------------------
export function useVault(uid) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!firebaseEnabled || !db) {
      const vault = readLocalVault();
      setItems(vault);
      setLoading(false);

      const onStorage = () => setItems(readLocalVault());
      const onChange = () => setItems(readLocalVault());
      window.addEventListener('storage', onStorage);
      window.addEventListener('sws-vault-change', onChange);
      return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener('sws-vault-change', onChange);
      };
    }
    if (!uid) {
      setItems([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const q = query(
      collection(db, VAULT),
      where('userId', '==', uid),
      orderBy('purchaseDate', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = snap.docs.map((d) => fromDoc(d.id, d.data()));
        setItems(arr);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [uid]);

  return { items, loading, error };
}

function fromDoc(id, data) {
  return {
    id,
    ...data,
    // Firestore Timestamps → ISO strings for the UI.
    purchaseDate: data.purchaseDate instanceof Timestamp
      ? data.purchaseDate.toDate().toISOString().slice(0, 10)
      : data.purchaseDate || null,
    soldDate: data.soldDate instanceof Timestamp
      ? data.soldDate.toDate().toISOString().slice(0, 10)
      : data.soldDate || null,
  };
}

// ------------------------------------------------------------
// Verbs
// ------------------------------------------------------------
export async function addVaultItem(uid, item) {
  const payload = {
    ...item,
    userId: uid || item.userId || 'offline',
    createdAt: new Date().toISOString(),
    purchaseDate: item.purchaseDate || new Date().toISOString().slice(0, 10),
  };

  // Keep stored images small — Firestore has a ~1 MiB string limit and
  // localStorage also benefits from smaller payloads.
  if (payload.image) {
    payload.image = await compressImageSafe(payload.image, {
      maxWidth: 800,
      maxHeight: 800,
      quality: 0.7,
    });
  }

  if (!firebaseEnabled || !db) {
    const vault = readLocalVault();
    const next = [{ id: `local-${Date.now()}`, ...payload }, ...vault];
    writeLocalVault(next);
    window.dispatchEvent(new Event('sws-vault-change'));
    return next[0].id;
  }

  if (!uid) throw new Error('uid required');
  const ref = await addDoc(collection(db, VAULT), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateVaultItem(itemId, patch) {
  if (!firebaseEnabled || !db) throw new Error('Firebase not configured');
  await updateDoc(doc(db, VAULT, itemId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteVaultItem(itemId) {
  if (!firebaseEnabled || !db) throw new Error('Firebase not configured');
  await deleteDoc(doc(db, VAULT, itemId));
}

export async function markSold(itemId, soldPrice, soldVia = 'SwibSwap', extra = {}) {
  return updateVaultItem(itemId, {
    sold: soldPrice,
    soldVia,
    soldDate: new Date().toISOString().slice(0, 10),
    ...extra,
  });
}

// Log a market sale event to /api/transactions. Fire-and-forget; non-fatal.
export async function logSale({ code, rarity, lang, tcg, amount, currency, getIdToken }) {
  if (!code || !rarity || !amount) return;
  try {
    const token = getIdToken ? await getIdToken() : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    await fetch(apiUrl('/transactions'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ code, rarity, lang, tcg, kind: 'sale', amount: Number(amount), currency: currency || 'THB' }),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('logSale failed:', e?.message);
  }
}
