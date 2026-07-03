#!/usr/bin/env node
// tools/backfill-cn-anniv.mjs — SCN57
// -----------------------------------------------------------------
// Walks api/_cn-anniv-catalog.json (33 items, generated from the
// Bandai CN Anniversary List PDF) and uploads each watermarked JPEG
// from public/cn-anniv/ to Firebase Storage + writes a verified_cards
// doc so the scanner can surface the SAMPLE when these cards are
// identified.
//
// Each manifest item has the shape:
//   { id, anniv, idx, page, imageUrl, setCode, lang, synthCode, bbox }
// Example: { synthCode: "CN-2ANV-005", setCode: "CN-2ANV",
//            imageUrl: "/cn-anniv/anniv2_05.jpeg" }
//
// Firebase writes:
//   Storage:    gs://<bucket>/verified_cards/samples/<synthCode>__base__CN.jpeg
//   Firestore:  verified_cards/<synthCode>__base
//     {
//       code: <synthCode>, rarity: 'base', anniv: '1ANV'|'2ANV'|'3ANV',
//       setCode: 'CN-1ANV', samples: { CN: <publicUrl> },
//       sampleSources: { CN: 'cn-anniv-pdf' },
//       sampleBackfilledAt: <serverTimestamp>,
//       sourcePage: <pdf-page>, sourceFile: <filename>,
//     }
//
// Usage (from project root):
//   node tools/backfill-cn-anniv.mjs                # full 33-item upload
//   node tools/backfill-cn-anniv.mjs --anniv=2ANV   # only one anniversary
//   node tools/backfill-cn-anniv.mjs --dry-run      # show what would happen
//
// Idempotent: skips items whose Firestore record already has samples.CN.
// The watermark is already baked into the PDF crops (see extract_cn_anniv.py).

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── Args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const hasArg = (n) => args.some((a) => a === n);
const argVal = (n) => {
  const a = args.find((x) => x.startsWith(`${n}=`));
  return a ? a.split('=')[1] : null;
};
const DRY_RUN  = hasArg('--dry-run');
const ONLY_ANNIV = (argVal('--anniv') || '').toUpperCase();

// ─── Load env ────────────────────────────────────────────────────────────
function loadEnv() {
  const envFile = join(ROOT, '.env.local');
  if (!existsSync(envFile)) return;
  const lines = readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]+?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();
if (!process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
  console.error('ERROR: FIREBASE_SERVICE_ACCOUNT_B64 missing (check .env.local)');
  process.exit(1);
}
if (!process.env.REACT_APP_FIREBASE_STORAGE_BUCKET && !process.env.FIREBASE_STORAGE_BUCKET) {
  console.error('ERROR: REACT_APP_FIREBASE_STORAGE_BUCKET missing');
  process.exit(1);
}

// ─── Firebase init ───────────────────────────────────────────────────────
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8')
);
const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.REACT_APP_FIREBASE_STORAGE_BUCKET;
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), storageBucket: bucketName });
const bucket = admin.storage().bucket();
const db = admin.firestore();

// ─── Load manifest ───────────────────────────────────────────────────────
const MANIFEST_PATH = join(ROOT, 'api', '_cn-anniv-catalog.json');
const ASSETS_DIR    = join(ROOT, 'public', 'cn-anniv');

if (!existsSync(MANIFEST_PATH)) {
  console.error(`ERROR: manifest not found at ${MANIFEST_PATH}`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const items = (manifest.items || []).filter((it) => {
  if (ONLY_ANNIV && it.anniv !== ONLY_ANNIV) return false;
  return true;
});
console.log(`Loaded ${items.length} items from ${MANIFEST_PATH}`);
if (DRY_RUN) console.log('(dry-run: no Firebase writes will happen)');

// ─── Per-item upload + Firestore record ──────────────────────────────────
async function alreadyHave(synthCode) {
  const snap = await db.collection('verified_cards').doc(`${synthCode}__base`).get();
  if (!snap.exists) return false;
  return !!snap.data()?.samples?.CN;
}

async function uploadOne(item) {
  const filename = item.imageUrl.split('/').pop();
  const local = join(ASSETS_DIR, filename);
  if (!existsSync(local)) {
    return { skipped: false, miss: true, reason: `local file missing: ${filename}` };
  }

  const synthCode = item.synthCode;
  if (!synthCode) {
    return { skipped: false, miss: true, reason: 'manifest item missing synthCode' };
  }

  if (await alreadyHave(synthCode)) {
    return { skipped: true, miss: false };
  }
  if (DRY_RUN) {
    return { skipped: false, miss: false, dryRun: true };
  }

  const bytes = readFileSync(local);
  const path = `verified_cards/samples/${synthCode}__base__CN.jpeg`;
  const file = bucket.file(path);
  await file.save(bytes, {
    metadata: {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable',
    },
    resumable: false,
  });
  await file.makePublic();
  const url = `https://storage.googleapis.com/${bucket.name}/${path}`;

  await db.collection('verified_cards').doc(`${synthCode}__base`).set({
    code: synthCode,
    rarity: 'base',
    anniv: item.anniv,
    setCode: item.setCode,
    samples: { CN: url },
    sampleSources: { CN: 'cn-anniv-pdf' },
    sampleBackfilledAt: admin.firestore.FieldValue.serverTimestamp(),
    sourcePage: item.page || null,
    sourceFile: filename,
  }, { merge: true });

  return { skipped: false, miss: false, url };
}

// ─── Main loop ──────────────────────────────────────────────────────────
const stats = { total: items.length, uploaded: 0, skipped: 0, miss: 0, errors: 0 };
const startTs = Date.now();

for (const item of items) {
  process.stdout.write(`[${item.synthCode}] ${item.imageUrl.split('/').pop()} ... `);
  try {
    const result = await uploadOne(item);
    if (result.dryRun)         { console.log('(dry-run) ok');           stats.uploaded++; }
    else if (result.skipped)   { console.log('skipped (already there)'); stats.skipped++; }
    else if (result.miss)      { console.log('MISS:', result.reason);    stats.miss++; }
    else                       { console.log('uploaded');                stats.uploaded++; }
  } catch (e) {
    console.log('ERROR:', e.message?.slice(0, 120));
    stats.errors++;
  }
}

const elapsed = Math.round((Date.now() - startTs) / 1000);
console.log(`\n— done in ${elapsed}s —`);
console.log(`  total:    ${stats.total}`);
console.log(`  uploaded: ${stats.uploaded}`);
console.log(`  skipped:  ${stats.skipped}`);
console.log(`  miss:     ${stats.miss}`);
console.log(`  errors:   ${stats.errors}`);
process.exit(0);
