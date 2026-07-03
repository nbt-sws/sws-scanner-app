// /api/whoami.js — SCN62
// Lightweight identity probe. Returns { ok, uid, email, isAdmin }.
// Used by the SampleHero to decide whether to show the admin-only
// "Replace SAMPLE with my scan" button.

import { verifyUser } from './_firebase-admin.js';

export default async function handler(req, res) {
  const user = await verifyUser(req).catch(() => null);
  if (!user?.uid) return res.status(200).json({ ok: true, signedIn: false });

  const adminList = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = adminList.includes(String(user.email || '').toLowerCase());

  return res.status(200).json({
    ok: true,
    signedIn: true,
    uid: user.uid,
    email: user.email || null,
    isAdmin,
  });
}
