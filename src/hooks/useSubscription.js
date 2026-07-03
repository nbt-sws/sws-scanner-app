// src/hooks/useSubscription.js — v14, A2 + E3
// Reads the current user's tier from /users/{uid}.subscriptionTier in
// Firestore. Real-time listener so a tier upgrade applied server-side
// (RevenueCat / Stripe webhook → Firestore write) reflects immediately
// without a sign-out / sign-in.
//
// Returns: { tier, loading, isAtLeast(t), isUser, isSilverPlus, isGoldPlus, isPlatinum }
//
// Until E1 (RevenueCat) ships, the field defaults to 'user' for everyone.
// Admin-set tiers via Firebase Console work today though — useful for testing.

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, firebaseEnabled } from '../firebase';
import { TIERS, tierIndex } from '../lib/tiers';

export function useSubscription(uid) {
  const [tier, setTier] = useState('user');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseEnabled || !db || !uid) {
      setTier('user');
      setLoading(false);
      return undefined;
    }
    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        // Normalize legacy 'free' value (set on initial user doc) → 'user'.
        let t = String(data?.subscriptionTier || 'user').toLowerCase();
        if (t === 'free') t = 'user';
        if (!TIERS.includes(t)) t = 'user';
        setTier(t);
        setLoading(false);
      },
      () => {
        // Read failure — degrade gracefully to free tier.
        setTier('user');
        setLoading(false);
      }
    );
    return unsub;
  }, [uid]);

  const idx = tierIndex(tier);

  return {
    tier,
    loading,
    isAtLeast: (t) => idx >= tierIndex(t),
    isUser:       idx === 0,
    isSilverPlus: idx >= 1,
    isGoldPlus:   idx >= 2,
    isPlatinum:   idx === 3,
  };
}
