// /api/contribute-sample.js — SCN104
// Thin upload endpoint. Client (Scanner.js prepareCardImage) does all the
// heavy lifting: smart-crop, watermark, JPEG-encode. We just receive the
// ready-to-store bytes and:
//   1. Verify Firebase Auth ID token
//   2. Upload to Firebase Storage at the SCN95 schema path
//      verified_cards/samples/{lang}_{code}_{rarity}_{name}_{type}.jpeg
//   3. Upsert Firestore /verified_cards/{code}__{rarity}
// No sharp, no fs reads, no node:url. Removes the Vercel sharp-linux-x64
// binary failure mode entirely.

import admin from 'firebase-admin';
import { getDb, getBucket, verifyUser } from './_firebase-admin.js';

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

const COLLECTION = 'verified_cards';

function isAdminUser(user) {
  if (!user) return false;
  const list = String(process.env.ADMIN_EMAILS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(String(user.email || '').toLowerCase());
}

function slugifyPart(s) {
  return String(s || '').toLowerCase()
    .replace(/[★★]/g, '-star')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
function shortType(t) {
  const x = String(t || '').toLowerCase();
  if (x.includes('leader')) return 'leader';
  if (x.includes('character')) return 'char';
  if (x.includes('event')) return 'event';
  if (x.includes('stage')) return 'stage';
  if (x.includes('don')) return 'don';
  return slugifyPart(x) || 'card';
}
function dataUrlToBuffer(d) {
  const m = String(d).match(/^data:(image\/\w+);base64,(.+)$/);
  if (m) return { mime: m[1], buf: Buffer.from(m[2], 'base64') };
  return { mime: 'image/jpeg', buf: Buffer.from(String(d).replace(/^data:image\/\w+;base64,/, ''), 'base64') };
}

async function _handlerImpl(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const user = await verifyUser(req);
  if (!user?.uid) return res.status(401).json({ ok: false, error: 'Sign in to contribute' });

  const { image, code, rarity, lang, nameEn, nameJp, replaceExisting, scanHash, tcg, type, promo } = req.body || {};
  if (!image)  return res.status(400).json({ ok: false, error: 'Missing image' });
  if (!code)   return res.status(400).json({ ok: false, error: 'Missing code' });
  if (!rarity) return res.status(400).json({ ok: false, error: 'Missing rarity' });

  const langKey = String(lang || '').toUpperCase() || 'JP';
  const isAdmin = isAdminUser(user);
  const rarityKey = String(rarity).replace(/[\s/]+/g, '');

  // SCN104 — image is already watermarked + cropped by Scanner.prepareCardImage.
  const { mime, buf } = dataUrlToBuffer(image);
  if (buf.length < 100) return res.status(400).json({ ok: false, error: 'Image payload too small' });

  // SCN97 schema path when nameEn provided, else legacy.
  let path;
  if (nameEn) {
    const langPart = slugifyPart(langKey) || 'unknown';
    const codePart = slugifyPart(code) || 'unknown';
    const rPart    = slugifyPart(rarity) || 'unknown';
    const nPart    = slugifyPart(nameEn).slice(0, 32) || 'unknown';
    const tPart    = shortType(type);
    path = `verified_cards/samples/${langPart}_${codePart}_${rPart}_${nPart}_${tPart}.jpeg`;
  } else {
    const safeRarityPath = rarityKey.replace(/[^\w\-★]/g, '_');
    path = `verified_cards/samples/${code}__${safeRarityPath}__${langKey}__user.jpeg`;
  }

  // (Optional) block non-admin overwrite when a sample already exists.
  if (!replaceExisting) {
    try {
      const [exists] = await getBucket().file(path).exists();
      if (exists) {
        return res.status(409).json({
          ok: false,
          error: 'SAMPLE already exists. Pass replaceExisting:true (admin) to overwrite.',
        });
      }
    } catch { /* fall through; on read error we let the write attempt */ }
  } else if (!isAdmin) {
    return res.status(403).json({ ok: false, error: 'Admin-only operation' });
  }

  // Upload.
  let url;
  try {
    const bucket = getBucket();
    const file = bucket.file(path);
    await file.save(buf, {
      metadata: {
        contentType: mime || 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { schemaVersion: nameEn ? 'v3-scn104' : 'legacy', clientWatermarked: 'true' },
      },
      resumable: false,
    });
    await file.makePublic();
    url = `https://storage.googleapis.com/${bucket.name}/${path}`;
  } catch (e) {
    console.error('[contribute-sample] storage upload failed:', e?.message);
    return res.status(500).json({ ok: false, error: 'Storage upload failed: ' + e.message, stage: 'storage-upload' });
  }

  // Firestore upsert.
  const db = getDb();
  const perRarityKey = `${code}__${rarityKey}`;
  const baseKey      = `${code}__base`;
  try {
    await Promise.all([
      db.collection(COLLECTION).doc(perRarityKey).set({
        code, rarity, lang: langKey,
        sampleImageUrl: url,
        samples: { [langKey]: url },
        sampleSources: { [langKey]: isAdmin ? 'admin-replace' : 'user-contributed' },
        nameEn: nameEn || null,
        nameJp: nameJp || null,
        contributedBy: admin.firestore.FieldValue.arrayUnion(user.uid),
        sampleBackfilledAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
      db.collection(COLLECTION).doc(baseKey).set({
        code, rarity: 'base',
        samples: { [langKey]: url },
        sampleSources: { [langKey]: isAdmin ? 'admin-replace' : 'user-contributed' },
        sampleBackfilledAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
    ]);
  } catch (e) {
    console.error('[contribute-sample] firestore write failed:', e?.message);
    return res.status(500).json({ ok: false, error: 'Firestore write failed: ' + e.message, stage: 'firestore' });
  }

  // /scans cache patch (best-effort).
  if (scanHash) {
    try {
      await db.collection('scans').doc(scanHash).set({
        card: {
          code, rarity,
          nameEn: nameEn || null, nameJp: nameJp || null,
          type: type || null, promo: !!promo,
          lang: langKey, tcg: tcg || 'op',
          confidence: 99,
          reasoning: isAdmin ? 'Admin REPLACE correction' : 'User-confirmed SAMPLE contribution',
        },
        correctedBy: user.uid,
        correctedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.warn('[contribute-sample] /scans cache patch failed:', e?.message);
    }
  }

  return res.status(200).json({
    ok: true,
    code, rarity, lang: langKey,
    sampleImageUrl: url,
    docs: [perRarityKey, baseKey],
    replaceExisting: !!replaceExisting,
    admin: isAdmin,
    scanCachePatched: !!scanHash,
  });
}

// SCN91 + SCN104 — Top-level safety net.
export default async function handler(req, res) {
  try {
    return await _handlerImpl(req, res);
  } catch (e) {
    console.error('[contribute-sample] UNCAUGHT', e?.message, e?.stack?.slice(0, 500));
    if (res.headersSent) return;
    return res.status(500).json({
      ok: false,
      error: 'Uncaught handler error: ' + (e?.message || String(e)),
      stage: 'uncaught',
    });
  }
}
