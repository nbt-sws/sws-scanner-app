// src/vault.js
// SwibsVault data layer — backed by Firestore /vault collection.
// Each doc has a userId field; security rules enforce ownership.
// Components consume via the useVault() hook which subscribes to live updates.

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
// Subscribe to a user's vault. Returns { items, loading, error }.
// ------------------------------------------------------------
export function useVault(uid) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!firebaseEnabled || !db) {
      setItems(OFFLINE_VAULT);
      setLoading(false);
      return undefined;
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
  if (!firebaseEnabled || !db) {
    throw new Error('Firebase not configured');
  }
  if (!uid) throw new Error('uid required');
  const payload = {
    ...item,
    userId: uid,
    createdAt: serverTimestamp(),
    purchaseDate: item.purchaseDate || new Date().toISOString().slice(0, 10),
  };
  const ref = await addDoc(collection(db, VAULT), payload);
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
    await fetch('/api/transactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ code, rarity, lang, tcg, kind: 'sale', amount: Number(amount), currency: currency || 'THB' }),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('logSale failed:', e?.message);
  }
}
