// /api/contribute.js — SCN104
// Saves a user-verified card record to the community database.
// Doc id = `${code}__${rarity}` (no slashes) so parallel-art variants
// (e.g. OP09-001 L vs OP09-001 L★) live in separate records.
//
// Pipeline (SCN104 — sharp-free):
//   1. Require signed-in user (Firebase ID token).
//   2. Receive client-processed user scan (already cropped + watermarked +
//      JPEG-encoded via Scanner.prepareCardImage).
//   3. Upload that JPEG to Firebase Storage at the SCN95 schema path
//        verified_cards/samples/{lang}_{code}_{rarity}_{name}_{type}.jpeg
//   4. Optionally mirror the official Bandai sample URL as raw bytes (no
//      sharp watermarking — that was the source of the Vercel binary fail).
//   5. Upsert Firestore /verified_cards/{code}__{rarity}.

import { getDb, getBucket, verifyUser } from './_firebase-admin.js';
import { perceptualHash } from './_cache.js';

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

const COLLECTION = 'verified_cards';

async function fetchOptcgapi(code) {
  try {
    const r = await fetch(`https://optcgapi.com/api/cards/code/${encodeURIComponent(code)}`);
    if (!r.ok) return null;
    const data = await r.json();
    const card = Array.isArray(data) ? data[0] : (data?.cards?.[0] || data);
    if (!card) return null;
    return {
      name: card.name || null,
      setName: card.set?.name || card.setName || null,
      releaseDate: card.release_date || null,
      source: 'optcgapi.com',
      imageUrl: card.images?.large || card.images?.small || card.image_url || card.image || null,
    };
  } catch { return null; }
}
async function fetchApitcg(code) {
  try {
    const r = await fetch(`https://www.apitcg.com/api/one-piece/cards?code=${encodeURIComponent(code)}`);
    if (!r.ok) return null;
    const data = await r.json();
    const card = (data?.data?.[0]) || (Array.isArray(data) ? data[0] : null);
    if (!card) return null;
    return {
      name: card.name || null,
      setName: card.set || null,
      releaseDate: card.release_date || null,
      source: 'apitcg.com',
      imageUrl: card.images?.large || card.images?.small || card.image || null,
    };
  } catch { return null; }
}
async function lookupOfficialDetails(code) {
  return (await fetchOptcgapi(code)) || (await fetchApitcg(code));
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

// Mirror a remote URL (Bandai/optcgapi) into Firebase Storage as raw bytes.
// No sharp processing — we just want to own the asset. If the fetch fails
// we return null; the caller will keep the remote URL.
async function mirrorRemoteSample(remoteUrl, docKey) {
  if (!remoteUrl) return null;
  try {
    const r = await fetch(remoteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SwibSwap/14)' },
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const ext = remoteUrl.includes('.png') ? 'png' : 'jpg';
    const path = `verified_cards/${docKey}_official.${ext}`;
    const file = getBucket().file(path);
    await file.save(buf, {
      metadata: {
        contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { mirrored: 'true', source: remoteUrl, schemaVersion: 'v3-scn104' },
      },
      resumable: false,
    });
    await file.makePublic();
    return `https://storage.googleapis.com/${getBucket().name}/${path}`;
  } catch (e) {
    console.warn('[contribute] mirror failed:', e?.message);
    return null;
  }
}

async function _handlerImpl(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  const user = await verifyUser(req);
  if (!user?.uid) return res.status(401).json({ ok: false, error: 'Sign in to contribute' });

  const { card = {}, tcg = 'op', lang = 'JP', image, sampleImageUrl, scanHash } = req.body || {};
  const code = card.code;
  const rarity = card.rarity;
  if (!code || !rarity) return res.status(400).json({ ok: false, error: 'Missing code or rarity' });

  const langKey = String(lang || card.lang || 'JP').toUpperCase();
  const rarityKey = String(rarity).replace(/[\s/]+/g, '');
  const docKey = `${code}__${rarityKey}`;

  // 1. Upload the user's prepared (client-watermarked) scan, if provided.
  let userScanUrl = null;
  let userScanHash = null;
  if (image) {
    try {
      const { mime, buf } = dataUrlToBuffer(image);
      if (buf.length >= 100) {
        const langPart = slugifyPart(langKey) || 'unknown';
        const codePart = slugifyPart(code) || 'unknown';
        const rPart    = slugifyPart(rarity) || 'unknown';
        const nPart    = slugifyPart(card.nameEn || card.nameJp).slice(0, 32) || 'unknown';
        const tPart    = shortType(card.type);
        const path = `verified_cards/samples/${langPart}_${codePart}_${rPart}_${nPart}_${tPart}.jpeg`;
        const file = getBucket().file(path);
        await file.save(buf, {
          metadata: {
            contentType: mime || 'image/jpeg',
            cacheControl: 'public, max-age=31536000, immutable',
            metadata: { schemaVersion: 'v3-scn104', clientWatermarked: 'true' },
          },
          resumable: false,
        });
        await file.makePublic();
        userScanUrl = `https://storage.googleapis.com/${getBucket().name}/${path}`;
        userScanHash = perceptualHash ? await perceptualHash(buf).catch(() => null) : null;
      }
    } catch (e) {
      console.warn('[contribute] user scan upload failed:', e?.message);
    }
  }

  // 2. Look up + mirror the official sample (best-effort, no sharp).
  let mirrorUrl = null;
  let official = null;
  try {
    official = await lookupOfficialDetails(code);
    const remote = sampleImageUrl || official?.imageUrl;
    if (remote) {
      mirrorUrl = await mirrorRemoteSample(remote, docKey);
    }
  } catch (e) {
    console.warn('[contribute] official lookup failed:', e?.message);
  }

  // 3. Upsert Firestore.
  const db = getDb();
  const admin = (await import('firebase-admin')).default;
  const record = {
    code, rarity, lang: langKey, tcg,
    nameEn:  card.nameEn || null,
    nameJp:  card.nameJp || null,
    type:    card.type || null,
    promo:   !!card.promo,
    setCode: card.setCode || null,
    sampleImageUrl: userScanUrl || mirrorUrl || null,
    samples: { [langKey]: userScanUrl || mirrorUrl || null },
    officialImageUrl: mirrorUrl,
    officialName: official?.name || null,
    officialSetName: official?.setName || null,
    officialReleaseDate: official?.releaseDate || null,
    officialSource: official?.source || null,
    verifiedBy: admin.firestore.FieldValue.arrayUnion(user.uid),
    verificationCount: admin.firestore.FieldValue.increment(1),
    lastVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (userScanHash) record.perceptualHash = userScanHash;

  try {
    await db.collection(COLLECTION).doc(docKey).set(record, { merge: true });
  } catch (e) {
    console.error('[contribute] firestore write failed:', e?.message);
    return res.status(500).json({ ok: false, error: 'Firestore write failed: ' + e.message, stage: 'firestore' });
  }

  // 4. Patch /scans cache so subsequent scans get the corrected record.
  if (scanHash) {
    try {
      await db.collection('scans').doc(scanHash).set({
        card: { ...card, lang: langKey },
        correctedBy: user.uid,
        correctedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.warn('[contribute] /scans patch failed:', e?.message);
    }
  }

  return res.status(200).json({
    ok: true,
    docKey,
    record: {
      code, rarity,
      nameEn: card.nameEn || null,
      nameJp: card.nameJp || null,
      sampleImageUrl: userScanUrl || mirrorUrl || null,
      watermarkedSampleUrl: userScanUrl,    // SCN92 — UI reads this preferentially
      officialImageUrl: mirrorUrl,
      verificationCount: 1,
      officialSource: official?.source || null,
    },
  });
}

// SCN100 + SCN104 — Top-level safety net.
export default async function handler(req, res) {
  try {
    return await _handlerImpl(req, res);
  } catch (e) {
    console.error('[contribute] UNCAUGHT', e?.message, e?.stack?.slice(0, 500));
    if (res.headersSent) return;
    return res.status(500).json({
      ok: false,
      error: 'Uncaught handler error: ' + (e?.message || String(e)),
      stage: 'uncaught',
    });
  }
}
