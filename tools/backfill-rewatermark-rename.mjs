#!/usr/bin/env node
/**
 * SCN94 — One-shot migration script.
 *
 * For every verified_cards doc:
 *   1. Download the original unwatermarked sample (sampleImageUrl OR the
 *      first entry in `samples.{JP,EN,CN}`).
 *   2. Re-apply the canonical SAMPLE_WTM.png watermark (25% width, bottom-
 *      left, ~90% opacity) — same recipe as api/contribute-sample.js.
 *   3. Compute the new filename per the 6-step-workflow schema:
 *        {lang}_{set-code}_{rarity}_{cardname}_{type}.jpeg
 *      e.g. en_op07-051_sr-star_boa_char.jpeg
 *           jp_eb03_don_doflamingo_don.jpeg
 *           cn_st03_sec_zoro_char.jpeg
 *   4. Upload to verified_cards/samples/<newName> in Firebase Storage.
 *   5. Patch the Firestore doc's sampleImageUrl + watermarkedSampleUrl
 *      to point at the new blob.
 *   6. If --delete-old, remove the legacy blob.
 *
 * USAGE
 *   # Dry run (no writes, prints what would happen):
 *   node tools/backfill-rewatermark-rename.mjs --dry-run
 *
 *   # Real run, keeping legacy blobs as a safety net:
 *   node tools/backfill-rewatermark-rename.mjs
 *
 *   # Real run + delete legacy blobs after the new ones land:
 *   node tools/backfill-rewatermark-rename.mjs --delete-old
 *
 *   # Limit to one card for spot-checking:
 *   node tools/backfill-rewatermark-rename.mjs --only=OP13-051__R★
 *
 * REQUIREMENTS
 *   - FIREBASE_SERVICE_ACCOUNT_B64 in env (same value Vercel uses) OR
 *     GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account JSON.
 *   - FIREBASE_STORAGE_BUCKET in env (e.g. boboa-scanner.firebasestorage.app).
 *   - Run from the repo root.
 */

import admin from 'firebase-admin';
import sharp from 'sharp';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WATERMARK_PATH = join(ROOT, 'logos', 'SAMPLE_WTM.png');

// ─── CLI flags ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const DELETE_OLD  = args.includes('--delete-old');
const ONLY        = (args.find((a) => a.startsWith('--only=')) || '').slice('--only='.length) || null;
const VERBOSE     = args.includes('--verbose');

// ─── Firebase init ────────────────────────────────────────────────────────
function initFirebase() {
  if (admin.apps.length) return;
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (b64) {
    const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
    admin.initializeApp({
      credential: admin.credential.cert(json),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    return;
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    return;
  }
  throw new Error(
    'Set FIREBASE_SERVICE_ACCOUNT_B64 (or GOOGLE_APPLICATION_CREDENTIALS) ' +
    'and FIREBASE_STORAGE_BUCKET before running.'
  );
}
initFirebase();
const db = admin.firestore();
const bucket = admin.storage().bucket();

// ─── Filename schema helpers ──────────────────────────────────────────────
function slugifyPart(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[★★]/g, '-star')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function shortType(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('leader')) return 'leader';
  if (t.includes('character')) return 'char';
  if (t.includes('event')) return 'event';
  if (t.includes('stage')) return 'stage';
  if (t.includes('don')) return 'don';
  return slugifyPart(t) || 'card';
}

function setCodeFrom(code) {
  // Keep the full card code per the user's spec example "op07-051":
  //   OP07-051   → op07-051
  //   ST03-013   → st03-013
  //   PRB-02-017 → prb-02-017
  //   EB03-001   → eb03-001
  // Lowercase only, preserve dashes; collapse any other chars via slugify.
  return slugifyPart(code) || 'unknown';
}

function buildNewFilename({ lang, code, rarity, nameEn, type }) {
  const langPart   = slugifyPart(lang) || 'unknown';
  const setPart    = setCodeFrom(code);
  const rarityPart = slugifyPart(rarity) || 'unknown';
  const namePart   = slugifyPart(nameEn).slice(0, 24) || 'unknown';
  const typePart   = shortType(type);
  return `${langPart}_${setPart}_${rarityPart}_${namePart}_${typePart}.jpeg`;
}

// ─── Watermark recipe (mirrors api/contribute-sample.js) ──────────────────
async function applyLogoWatermark(buf) {
  if (!existsSync(WATERMARK_PATH)) {
    throw new Error(`Watermark file missing: ${WATERMARK_PATH}`);
  }
  const card = sharp(buf);
  const meta = await card.metadata();
  if (!meta.width || !meta.height) {
    throw new Error('Source image has no width/height');
  }
  const targetW = Math.max(80, Math.round(meta.width * 0.25));
  const wmBase = await sharp(readFileSync(WATERMARK_PATH))
    .resize({ width: targetW, withoutEnlargement: true })
    .ensureAlpha()
    .toBuffer();
  const wmMeta = await sharp(wmBase).metadata();
  // Knock 10% off alpha so the watermark reads at ~90% opacity.
  const wmFinal = await sharp(wmBase)
    .composite([{
      input: Buffer.from([0, 0, 0, 26]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
      blend: 'dest-out',
    }])
    .toBuffer();
  const pad = Math.round(meta.width * 0.025);
  return card
    .composite([{
      input: wmFinal,
      left: pad,
      top: meta.height - wmMeta.height - pad,
      blend: 'over',
    }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// ─── Helpers ──────────────────────────────────────────────────────────────
async function fetchSourceImage(doc) {
  // Prefer the original unwatermarked URL — that's the only one we can
  // safely re-watermark. If we only have the already-watermarked URL,
  // re-watermarking would stamp the logo twice — skip those docs.
  const original =
    doc.sampleImageUrl ||
    doc.officialImageUrl ||
    (doc.samples && (doc.samples[doc.lang] || doc.samples.JP || doc.samples.EN || doc.samples.CN)) ||
    null;
  if (!original) return null;
  // If `original` is a Firebase Storage URL pointing at a "_watermarked" or
  // "_user.png" blob, it's already stamped — re-watermarking would double-
  // stamp. Skip those for safety; manual review needed.
  if (/_watermarked\.|__user\.png/i.test(original)) {
    if (VERBOSE) console.log(`    (skip — only watermarked source available)`);
    return null;
  }
  const res = await fetch(original, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SwibSwap-Backfill/1)' },
  });
  if (!res.ok) {
    throw new Error(`fetch ${original} → ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function uploadNewBlob(buf, newName) {
  const newPath = `verified_cards/samples/${newName}`;
  const file = bucket.file(newPath);
  await file.save(buf, {
    metadata: {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { schemaVersion: 'v2-scn94', backfilledAt: new Date().toISOString() },
    },
    resumable: false,
  });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${newPath}`;
}

async function deleteLegacyBlobs(legacyUrls) {
  for (const url of legacyUrls) {
    if (!url) continue;
    // Strip the https://storage.googleapis.com/<bucket>/ prefix.
    const m = /^https:\/\/storage\.googleapis\.com\/[^/]+\/(.+)$/.exec(url);
    if (!m) continue;
    const objectPath = decodeURIComponent(m[1]);
    try {
      await bucket.file(objectPath).delete();
      if (VERBOSE) console.log(`    deleted ${objectPath}`);
    } catch (e) {
      console.warn(`    failed to delete ${objectPath}: ${e.message}`);
    }
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────
async function main() {
  console.log(`SCN94 — backfill-rewatermark-rename`);
  console.log(`  bucket:       ${bucket.name}`);
  console.log(`  watermark:    ${WATERMARK_PATH}`);
  console.log(`  dry-run:      ${DRY_RUN}`);
  console.log(`  delete-old:   ${DELETE_OLD}`);
  console.log(`  only:         ${ONLY || '(all)'}`);
  console.log();

  const snap = await db.collection('verified_cards').get();
  let processed = 0;
  let renamed   = 0;
  let skipped   = 0;
  let failed    = 0;

  for (const docRef of snap.docs) {
    const id = docRef.id;
    if (ONLY && id !== ONLY) continue;
    // Skip the per-code "__base" docs — they're aggregate pointers, not
    // first-class sample records.
    if (id.endsWith('__base')) { skipped += 1; continue; }

    const data = docRef.data();
    processed += 1;
    console.log(`[${processed}] ${id}`);

    const lang   = data.lang || 'JP';
    const code   = data.code;
    const rarity = data.rarity;
    const nameEn = data.nameEn || data.officialName || null;
    const type   = data.type || null;

    if (!code || !rarity || !nameEn) {
      console.log(`    skip — missing code/rarity/nameEn`);
      skipped += 1; continue;
    }

    const newName = buildNewFilename({ lang, code, rarity, nameEn, type });
    console.log(`    → ${newName}`);

    let srcBuf;
    try {
      srcBuf = await fetchSourceImage(data);
    } catch (e) {
      console.log(`    fail (fetch): ${e.message}`);
      failed += 1; continue;
    }
    if (!srcBuf) { skipped += 1; continue; }

    let watermarked;
    try {
      watermarked = await applyLogoWatermark(srcBuf);
    } catch (e) {
      console.log(`    fail (watermark): ${e.message}`);
      failed += 1; continue;
    }

    if (DRY_RUN) {
      console.log(`    DRY — would upload ${watermarked.length} bytes`);
      renamed += 1; continue;
    }

    let newUrl;
    try {
      newUrl = await uploadNewBlob(watermarked, newName);
    } catch (e) {
      console.log(`    fail (upload): ${e.message}`);
      failed += 1; continue;
    }

    const legacyUrls = [
      data.sampleImageUrl,
      data.watermarkedSampleUrl,
      ...(data.samples ? Object.values(data.samples) : []),
    ].filter(Boolean);

    try {
      await docRef.set({
        sampleImageUrl: newUrl,
        watermarkedSampleUrl: newUrl,
        samples: { ...(data.samples || {}), [lang]: newUrl },
        sampleSchemaVersion: 'v2-scn94',
        sampleBackfilledAt: admin.firestore.FieldValue.serverTimestamp(),
        // Keep a paper trail of what we replaced.
        sampleLegacyUrls: legacyUrls,
      }, { merge: true });
    } catch (e) {
      console.log(`    fail (firestore patch): ${e.message}`);
      failed += 1; continue;
    }

    if (DELETE_OLD) {
      await deleteLegacyBlobs(legacyUrls.filter((u) => u !== newUrl));
    }

    renamed += 1;
    console.log(`    ✓ done`);
  }

  console.log();
  console.log('───────── summary ─────────');
  console.log(`  processed: ${processed}`);
  console.log(`  renamed:   ${renamed}`);
  console.log(`  skipped:   ${skipped}`);
  console.log(`  failed:    ${failed}`);
}

main().then(
  () => process.exit(0),
  (err) => { console.error(err); process.exit(1); },
);
  () => process.exit(0),
  (err) => { console.error(err); process.exit(1); },
);
