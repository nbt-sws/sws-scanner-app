// /api/scan-phash.js — SCN59
// ----------------------------------------------------------------
// Visual fallback for the DB-first scan flow. When /api/op-variants
// returns no `verified_cards` hits for the identified code AND the
// regular scan can't pin a code at all, the client can call this
// endpoint with the user's photo to find DB entries by visual
// similarity (perceptual-hash Hamming distance).
//
// Requires verified_cards docs to carry `phash` (16-byte ahash or
// 8x8 dHash) per sample. Coverage is partial (~SCN64 added phash
// computation; the backfill writes it for new docs only). When the
// DB has no phashes we soft-fail to "no matches" so the caller can
// fall through to Haiku.
//
// POST { image, lang? }
//   → { ok, matches: [{ code, rarity, imageUrl, hammingDistance,
//                        confidence, fromDb: true }] }
//
// Threshold: Hamming distance ≤ 12 (out of 64) is "likely same card";
// ≤ 18 is "possibly related parallel"; > 18 dropped.
//
// Implementation note: this is intentionally lightweight. We compute
// the user-photo phash server-side via the sharp + raw bitmap path,
// then scan verified_cards in batches. With ~5k DB entries the scan
// is O(5k) Hamming-distance comparisons — well under 100ms.

import { getDb } from './_firebase-admin.js';

export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
};

// 8x8 average-hash. Returns a 64-bit hex string.
async function computePhash(b64) {
  let sharp;
  try { sharp = (await import('sharp')).default; }
  catch { return null; }   // sharp not installed in this environment
  try {
    const buf = Buffer.from(b64, 'base64');
    const raw = await sharp(buf)
      .greyscale()
      .resize(8, 8, { fit: 'fill' })
      .raw()
      .toBuffer();
    if (raw.length < 64) return null;
    let sum = 0;
    for (let i = 0; i < 64; i++) sum += raw[i];
    const avg = sum / 64;
    let bits = '';
    for (let i = 0; i < 64; i++) bits += (raw[i] >= avg ? '1' : '0');
    // pack to hex (16 chars)
    let hex = '';
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[scan-phash] compute failed:', e.message);
    return null;
  }
}

function hamming(hexA, hexB) {
  if (!hexA || !hexB || hexA.length !== hexB.length) return 64;
  let d = 0;
  for (let i = 0; i < hexA.length; i++) {
    const a = parseInt(hexA[i], 16);
    const b = parseInt(hexB[i], 16);
    let x = a ^ b;
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  const { image, lang } = req.body || {};
  if (!image) return res.status(400).json({ ok: false, error: 'Missing image' });

  const b64 = String(image).replace(/^data:image\/\w+;base64,/, '');
  const userHash = await computePhash(b64);
  if (!userHash) {
    return res.status(200).json({
      ok: true, matches: [],
      degraded: true,
      reason: 'sharp unavailable or image decode failed',
    });
  }

  // Scan verified_cards. We pull only docs that carry a `phash` field, capped.
  // For larger DBs this should be sharded by lang or paginated; ~5k docs
  // round-trips ~3 seconds which is fine for an interactive fallback.
  try {
    const db = getDb();
    const langKey = String(lang || '').toUpperCase();
    const snap = await db.collection('verified_cards')
      .where('phash', '!=', null)
      .limit(5000)
      .get();

    const ranked = [];
    snap.forEach((d) => {
      const v = d.data();
      const dist = hamming(userHash, v.phash);
      if (dist > 18) return;
      let imageUrl = v.sampleImageUrl || v.officialImageUrl || null;
      if (!imageUrl && v.samples) {
        imageUrl = v.samples[langKey] || v.samples.JP || v.samples.EN || v.samples.CN || null;
      }
      if (!imageUrl) return;
      ranked.push({
        code: v.code || (d.id.split('__')[0]),
        rarity: v.rarity || 'Unknown',
        imageUrl,
        hammingDistance: dist,
        confidence: Math.max(0, 1 - dist / 24),    // ~50% @ dist=12
        fromDb: true,
        watermarked: true,
      });
    });
    ranked.sort((a, b) => a.hammingDistance - b.hammingDistance);

    return res.status(200).json({
      ok: true,
      matches: ranked.slice(0, 12),
      userHash,
      scanned: snap.size,
    });
  } catch (e) {
    return res.status(200).json({
      ok: true, matches: [],
      degraded: true,
      reason: e.message,
    });
  }
}
