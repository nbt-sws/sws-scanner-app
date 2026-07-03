#!/usr/bin/env node
// tools/backfill-samples.mjs — SCN22 + SCN43 + SCN49
// ----------------------------------------------------------------
// Walks every set in src/lib/sets.js × every supported language and
// downloads the SAMPLE image for each card from:
//   1. Bandai official cardlist hosts (per-language)
//   2. cardpiece.com Shopify catalog (Mini Tin, CN promos, EN exclusives)
//   3. optcgapi.com community catalog (catch-all)
//
// Each image is watermarked with logos/SAMPLE_WTM.png at bottom-left
// then uploaded to Firebase Storage at:
//
//   gs://<bucket>/verified_cards/samples/{code}__base__{lang}.png
//
// The corresponding Firestore doc at /verified_cards/{code}__base gets:
//   { code, rarity: 'base', samples: { JP: <url>, EN: <url>, CN: <url> },
//     sampleSources: { JP: 'bandai', EN: 'cardpiece', ... } }
//
// Usage (from project root):
//   node tools/backfill-samples.mjs                  # full backfill (~45 min)
//   node tools/backfill-samples.mjs --set=OP-01      # one set only
//   node tools/backfill-samples.mjs --lang=CN        # one language only
//   node tools/backfill-samples.mjs --dry-run        # probe URLs only
//
// Idempotent: skips (code, lang) pairs whose Firebase URL is already
// populated in Firestore. Safe to ctrl-C and resume.
// ----------------------------------------------------------------

import admin from 'firebase-admin';
import sharp from 'sharp';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
const ONLY_SET  = argVal('--set');
const ONLY_LANG = (argVal('--lang') || '').toUpperCase();
const MAX_CODE  = parseInt(argVal('--max-code') || '160', 10);

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

// ─── Set catalog from src/lib/sets.js ────────────────────────────────────
// Windows ESM requires a file:// URL for absolute-path dynamic imports.
const setsModule = await import(pathToFileURL(join(ROOT, 'src', 'lib', 'sets.js')).href);
const OP_SETS_BY_LANG = setsModule.OP_SETS_BY_LANG;

const ALL_LANGS = ['JP', 'EN', 'CN'];
const LANGS = ONLY_LANG ? [ONLY_LANG] : ALL_LANGS;

// ─── Bandai host preferences per language ────────────────────────────────
const HOSTS = {
  JP: ['www.onepiece-cardgame.com'],
  EN: ['en.onepiece-cardgame.com', 'asia-en.onepiece-cardgame.com'],
  AE: ['asia-en.onepiece-cardgame.com', 'en.onepiece-cardgame.com'],
  CN: ['www.onepiece-cardgame.cn'],
};

// ─── Card-code generation per set ───────────────────────────────────────
function codePrefix(setCode) {
  const m = setCode.match(/^([A-Z]+)-?(\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}${m[2].padStart(2, '0')}`;
}

function* codesForSet(setCode) {
  if (setCode.startsWith('P-')) {
    for (let n = 1; n <= MAX_CODE; n++) yield `P-${String(n).padStart(3, '0')}`;
    return;
  }
  const prefix = codePrefix(setCode);
  if (!prefix) return;
  for (let n = 1; n <= MAX_CODE; n++) {
    yield `${prefix}-${String(n).padStart(3, '0')}`;
  }
}

// ─── Image probe ────────────────────────────────────────────────────────
async function probeImage(code, lang) {
  const bandai = await probeBandai(code, lang);
  if (bandai) return bandai;
  if (lang === 'JP' || lang === 'EN' || lang === 'CN') {
    const cp = await probeCardpiece(code);
    if (cp) return cp;
  }
  const oca = await probeOptcgapi(code);
  if (oca) return oca;
  return null;
}

async function probeBandai(code, lang) {
  const hosts = HOSTS[lang] || HOSTS.JP;
  for (const host of hosts) {
    const isCN = host.endsWith('.cn');
    const patterns = isCN
      ? ['images/cardlist/{code}.png', 'images/cardlist/card/{code}.png',
         'wp-content/uploads/cardlist/{code}.png']
      : ['images/cardlist/card/{code}.png', 'images/cardlist/card/{code}.jpg'];
    for (const pat of patterns) {
      const url = `https://${host}/${pat.replace('{code}', code)}`;
      try {
        const r = await fetchWithTimeout(url, 6000, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 SwibSwap-Backfill/14',
            Accept: 'image/png,image/*;q=0.9,*/*;q=0.8',
            Range: 'bytes=0-2048',
          },
        });
        const ct = r.headers.get('content-type') || '';
        if ((r.ok || r.status === 206) && ct.startsWith('image/')) {
          return { url, host, source: 'bandai' };
        }
      } catch { /* try next */ }
    }
  }
  return null;
}

async function probeCardpiece(code) {
  const queries = [code, code.replace('-', '')];
  for (const q of queries) {
    const url = `https://cardpiece.com/search/suggest.json?q=${encodeURIComponent(q)}` +
                `&resources[type]=product&resources[limit]=8&resources[options][unavailable_products]=show`;
    try {
      const r = await fetchWithTimeout(url, 8000, {
        headers: {
          'User-Agent': 'Mozilla/5.0 SwibSwap-Backfill/14',
          Accept: 'application/json,text/javascript;q=0.9,*/*;q=0.8',
        },
      });
      if (!r.ok) continue;
      const data = await r.json();
      const products = data?.resources?.results?.products || [];
      const want = code.toUpperCase();
      const noDash = want.replace('-', '');
      for (const p of products) {
        const t = `${p.title || ''} ${p.url || ''}`.toUpperCase();
        if (!t.includes(want) && !t.includes(noDash)) continue;
        let imgUrl = p.featured_image;
        if (imgUrl && typeof imgUrl === 'object') imgUrl = imgUrl.url || imgUrl.src;
        if (typeof imgUrl !== 'string') continue;
        if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
        imgUrl = imgUrl.replace(/_(\d+x\d*|\d*x\d+|grande|large|medium|small)\.(jpg|jpeg|png|webp)/i, '.$2');
        return { url: imgUrl, host: 'cardpiece.com', source: 'cardpiece' };
      }
    } catch { /* try next query */ }
  }
  return null;
}

async function probeOptcgapi(code) {
  const patterns = [
    'https://www.optcgapi.com/images/cardlist/{code}.png',
    'https://www.optcgapi.com/images/{code}.png',
    'https://www.optcgapi.com/static/cards/{code}.png',
    'https://en.onepiece-cardgame.com/images/cardlist/card/{code}.png',
  ];
  for (const pat of patterns) {
    const url = pat.replace('{code}', code);
    try {
      const r = await fetchWithTimeout(url, 6000, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 SwibSwap-Backfill/14',
          Accept: 'image/png,image/*;q=0.9,*/*;q=0.8',
          Range: 'bytes=0-2048',
        },
      });
      const ct = r.headers.get('content-type') || '';
      if ((r.ok || r.status === 206) && ct.startsWith('image/')) {
        return { url, host: 'optcgapi.com', source: 'optcgapi' };
      }
    } catch { /* try next */ }
  }
  return null;
}

async function fetchWithTimeout(url, timeoutMs, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}

async function downloadImage(url) {
  const r = await fetchWithTimeout(url, 15000, {
    headers: { 'User-Agent': 'Mozilla/5.0 SwibSwap-Backfill/14' },
  });
  if (!r.ok) throw new Error(`download ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// ─── SCN43 — Watermark with logos/SAMPLE_WTM.png ─────────────────────────
const WATERMARK_PATH = join(ROOT, 'logos', 'SAMPLE_WTM.png');
const WATERMARK_WIDTH_PCT = 0.25;
const WATERMARK_PAD_PCT = 0.025;
const WATERMARK_OPACITY = 0.9;

let watermarkBytes = null;
function loadWatermark() {
  if (watermarkBytes) return watermarkBytes;
  if (!existsSync(WATERMARK_PATH)) {
    throw new Error(`Watermark not found at ${WATERMARK_PATH}`);
  }
  watermarkBytes = readFileSync(WATERMARK_PATH);
  return watermarkBytes;
}

const wmCache = new Map();
async function getResizedWatermark(cardWidth) {
  const targetW = Math.max(80, Math.round(cardWidth * WATERMARK_WIDTH_PCT));
  if (wmCache.has(targetW)) return wmCache.get(targetW);
  const base = await sharp(loadWatermark())
    .resize({ width: targetW, withoutEnlargement: true })
    .ensureAlpha()
    .toBuffer();
  const meta = await sharp(base).metadata();
  const finalBuf = await sharp(base)
    .composite([{
      input: Buffer.from([0, 0, 0, Math.round(255 * (1 - WATERMARK_OPACITY))]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
      blend: 'dest-out',
    }])
    .toBuffer();
  const cached = { buffer: finalBuf, width: meta.width, height: meta.height };
  wmCache.set(targetW, cached);
  return cached;
}

async function watermarkImage(imgBytes) {
  try {
    const card = sharp(imgBytes);
    const meta = await card.metadata();
    if (!meta.width || !meta.height) return imgBytes;
    const wm = await getResizedWatermark(meta.width);
    const pad = Math.round(meta.width * WATERMARK_PAD_PCT);
    const left = pad;
    const top = meta.height - wm.height - pad;
    return await card
      .composite([{ input: wm.buffer, left, top, blend: 'over' }])
      .png({ compressionLevel: 8 })
      .toBuffer();
  } catch (e) {
    console.warn(`  watermark failed: ${e.message?.slice(0, 80)}`);
    return imgBytes;
  }
}

// ─── Storage + Firestore writes ─────────────────────────────────────────
async function uploadSample(code, lang, imgBytes) {
  const stamped = await watermarkImage(imgBytes);
  const path = `verified_cards/samples/${code}__base__${lang}.png`;
  const file = bucket.file(path);
  await file.save(stamped, {
    metadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    },
    resumable: false,
  });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

async function recordSample(code, lang, url, source = 'bandai') {
  const docId = `${code}__base`;
  const ref = db.collection('verified_cards').doc(docId);
  await ref.set({
    code,
    rarity: 'base',
    samples: { [lang]: url },
    sampleSources: { [lang]: source },
    sampleBackfilledAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function alreadyHave(code, lang) {
  const docId = `${code}__base`;
  const snap = await db.collection('verified_cards').doc(docId).get();
  if (!snap.exists) return false;
  return !!snap.data()?.samples?.[lang];
}

// ─── Main loop ──────────────────────────────────────────────────────────
const stats = { probed: 0, hit: 0, miss: 0, uploaded: 0, skipped: 0, errors: 0 };
const startTs = Date.now();

for (const lang of LANGS) {
  const sets = OP_SETS_BY_LANG[lang] || [];
  for (const set of sets) {
    if (ONLY_SET && set.code !== ONLY_SET) continue;
    console.log(`\n[${lang}] ${set.code} — ${set.name}`);
    let setHits = 0;
    let consecutiveMisses = 0;
    for (const code of codesForSet(set.code)) {
      if (consecutiveMisses >= 8) break;
      stats.probed++;
      try {
        if (await alreadyHave(code, lang)) {
          stats.skipped++;
          consecutiveMisses = 0;
          continue;
        }
        const probe = await probeImage(code, lang);
        if (!probe) {
          stats.miss++;
          consecutiveMisses++;
          continue;
        }
        stats.hit++;
        consecutiveMisses = 0;
        setHits++;
        if (DRY_RUN) {
          console.log(`  ${code} -> ${probe.url} [${probe.source}]`);
          continue;
        }
        const bytes = await downloadImage(probe.url);
        const publicUrl = await uploadSample(code, lang, bytes);
        await recordSample(code, lang, publicUrl, probe.source || 'bandai');
        stats.uploaded++;
        if (stats.uploaded % 25 === 0) {
          const elapsed = ((Date.now() - startTs) / 1000).toFixed(0);
          console.log(`  . ${stats.uploaded} uploaded, ${stats.skipped} skipped, ${stats.miss} miss, ${elapsed}s`);
        }
      } catch (e) {
        stats.errors++;
        console.log(`  ${code} ERR ${e.message?.slice(0, 100)}`);
      }
      await new Promise((res) => setTimeout(res, 150));
    }
    console.log(`  ${set.code} done — ${setHits} cards found`);
  }
}

const totalSec = ((Date.now() - startTs) / 1000).toFixed(0);
console.log(`\n${'-'.repeat(60)}`);
console.log(`DONE in ${totalSec}s`);
console.log(`probed:   ${stats.probed}`);
console.log(`hit:      ${stats.hit}`);
console.log(`miss:     ${stats.miss}`);
console.log(`uploaded: ${stats.uploaded}${DRY_RUN ? ' (dry-run: 0 actual)' : ''}`);
console.log(`skipped:  ${stats.skipped}`);
console.log(`errors:   ${stats.errors}`);
process.exit(0);
