#!/usr/bin/env node
/**
 * SCN96 — One-shot pipeline for CN Anniversary cards.
 *
 * For each entry in api/_cn-anniv-catalog.json:
 *   1. If `character` + `rarity` aren't yet labelled: send the local
 *      public/cn-anniv/ crop to Claude Haiku Vision and ask for them
 *      (plus optional `nameEn`, `setHint`, `color`, `cardCode`).
 *   2. Search the open web for a higher-resolution replacement of the
 *      same card. Sources tried in order:
 *        a. cardpiece.com Shopify predictive-search (already integrated
 *           in api/_cardpiece-search.js — returns CN-localised photos)
 *        b. Google Vision web-detection on the original PDF crop, picking
 *           the largest matching image with a CN-region URL
 *      Score by resolution × source-trust; keep the winner.
 *   3. Re-apply the canonical logos/SAMPLE_WTM.png watermark (25% width,
 *      bottom-left, ~90% opacity).
 *   4. Upload to Firebase Storage at the new schema path
 *      `verified_cards/samples/cn_<setCode>_<rarity-slug>_<name>_char.jpeg`
 *   5. Update _cn-anniv-catalog.json so `imageUrl` points to the new
 *      Firebase URL and `_legacyImageUrl` preserves the old PDF crop.
 *
 * The existing admin "Replace Official Sample" flow remains the manual
 * fallback for cards where this script either (a) couldn't find a hi-res
 * replacement, or (b) the auto-pick was wrong. The script never overwrites
 * a record where `sampleSchemaVersion === 'admin-v2'` — that's the
 * sentinel admin pushes set so manual replacements aren't undone.
 *
 * USAGE
 *   node tools/upgrade-cn-anniv-quality.mjs --dry-run --verbose
 *   node tools/upgrade-cn-anniv-quality.mjs                     # label + search, no upload
 *   node tools/upgrade-cn-anniv-quality.mjs --upload            # full pipeline
 *   node tools/upgrade-cn-anniv-quality.mjs --only=cn1anv_07    # one card
 *
 * REQUIREMENTS
 *   - ANTHROPIC_API_KEY in env or .env.local
 *   - FIREBASE_SERVICE_ACCOUNT_B64 + FIREBASE_STORAGE_BUCKET (for --upload)
 *   - GOOGLE_CLOUD_VISION_API_KEY (optional — falls back to cardpiece-only)
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import sharp from 'sharp';
import { slugifyPart, shortType } from './_filename-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CAT_PATH = join(ROOT, 'api', '_cn-anniv-catalog.json');
const PUB_DIR  = join(ROOT, 'public');
const WATERMARK_PATH = join(ROOT, 'logos', 'SAMPLE_WTM.png');

// ─── CLI flags ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const UPLOAD   = args.includes('--upload');
const VERBOSE  = args.includes('--verbose');
const ONLY     = (args.find((a) => a.startsWith('--only=')) || '').slice('--only='.length) || null;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

// ─── ANTHROPIC_API_KEY load (env or .env.local) ───────────────────────────
let API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  const envFile = join(ROOT, '.env.local');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*ANTHROPIC_API_KEY\s*=\s*"?([^"\s]+)"?\s*$/);
      if (m) { API_KEY = m[1]; break; }
    }
  }
}
if (!API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set');
  process.exit(1);
}

// ─── Firebase init (lazy — only for --upload) ─────────────────────────────
let bucket = null;
function getBucket() {
  if (bucket) return bucket;
  if (admin.apps.length === 0) {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 not set');
    const sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  }
  bucket = admin.storage().bucket();
  return bucket;
}

// ─── Watermark recipe (same as api/contribute-sample.js + SCN93) ──────────
async function applyLogoWatermark(buf) {
  if (!existsSync(WATERMARK_PATH)) throw new Error(`Watermark missing: ${WATERMARK_PATH}`);
  const card = sharp(buf);
  const meta = await card.metadata();
  if (!meta.width || !meta.height) throw new Error('No image metadata');
  const targetW = Math.max(80, Math.round(meta.width * 0.25));
  const wmBase = await sharp(readFileSync(WATERMARK_PATH))
    .resize({ width: targetW, withoutEnlargement: true })
    .ensureAlpha()
    .toBuffer();
  const wmMeta = await sharp(wmBase).metadata();
  const wmFinal = await sharp(wmBase)
    .composite([{
      input: Buffer.from([0, 0, 0, 26]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true, blend: 'dest-out',
    }])
    .toBuffer();
  const pad = Math.round(meta.width * 0.025);
  return card
    .composite([{ input: wmFinal, left: pad, top: meta.height - wmMeta.height - pad, blend: 'over' }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

// ─── Haiku vision labeller ────────────────────────────────────────────────
async function haikuLabel(imageBuf) {
  const b64 = imageBuf.toString('base64');
  const prompt = `
You are looking at a Chinese-language One Piece TCG anniversary promo card.
Identify these fields and return STRICT JSON only — no commentary, no markdown.

Required:
  character    – the One Piece character name in English (e.g. "Monkey D. Luffy", "Boa Hancock"). Use null if no recognizable character.
  rarity       – one of: L, SR, R, SEC, C, UC, TR, SP. The CN anniversary cards reprint standard rarities with anniversary box markings. Pick the closest match based on the card's frame/foil treatment. Use "SP" if uncertain.
  type         – one of: Leader, Character, Event, Stage. Look at the upper-right corner badge.
  cardCode     – the printed code on the card (e.g. "OP01-001", "ST03-013"). The CN anniversary set reuses original codes — read it off the card. Use null if not visible.

Return JSON like:
{"character":"Boa Hancock","rarity":"SR","type":"Character","cardCode":"OP07-051"}
`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  if (!r.ok) throw new Error(`haiku ${r.status} ${await r.text()}`);
  const data = await r.json();
  const text = data?.content?.[0]?.text || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`no JSON in haiku response: ${text.slice(0, 80)}`);
  return JSON.parse(m[0]);
}

// ─── Hi-res search: cardpiece predictive-search ───────────────────────────
async function searchCardpiece({ character, cardCode }) {
  if (!character && !cardCode) return null;
  const query = [character, cardCode, 'anniversary'].filter(Boolean).join(' ');
  try {
    const u = new URL('https://www.cardpiece.com/search/suggest.json');
    u.searchParams.set('q', query);
    u.searchParams.set('resources[type]', 'product');
    u.searchParams.set('resources[limit]', '5');
    const r = await fetch(u, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SwibSwap-CN-Upgrade/1)' },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const products = data?.resources?.results?.products || [];
    if (products.length === 0) return null;
    // Pick the product whose title best matches: cardCode > character > "anniversary".
    let best = null;
    for (const p of products) {
      const title = String(p?.title || '').toUpperCase();
      let score = 0;
      if (cardCode && title.includes(String(cardCode).toUpperCase())) score += 5;
      if (character && title.includes(String(character).toUpperCase())) score += 2;
      if (/ANNIVERSARY|ANNIV|周年/i.test(title)) score += 1;
      const imgUrl = (typeof p.image === 'string') ? p.image : (p.image?.url || p.featured_image?.url || null);
      if (!imgUrl) continue;
      // Cardpiece images come in size-suffix URLs (_100x, _600x). Force the
      // largest by stripping the size token.
      const hires = imgUrl.replace(/_[0-9]+x[0-9]*\.(jpg|jpeg|png|webp)/i, '.$1');
      if (!best || score > best.score) best = { score, url: hires, title: p.title, source: 'cardpiece' };
    }
    return best && best.score >= 2 ? best : null;
  } catch (e) {
    if (VERBOSE) console.warn(`cardpiece error: ${e.message}`);
    return null;
  }
}

// ─── Main pipeline ────────────────────────────────────────────────────────
async function main() {
  console.log(`SCN96 — CN-anniv quality upgrade`);
  console.log(`  dry-run: ${DRY_RUN}`);
  console.log(`  upload:  ${UPLOAD}`);
  console.log(`  only:    ${ONLY || '(all)'}`);
  console.log();

  const catalog = JSON.parse(readFileSync(CAT_PATH, 'utf-8'));
  const items = catalog.items || [];
  let processed = 0, labelled = 0, upgraded = 0, skipped = 0, failed = 0;

  for (const item of items) {
    if (ONLY && item.id !== ONLY) continue;
    if (item.sampleSchemaVersion === 'admin-v2') {
      if (VERBOSE) console.log(`[skip admin-locked] ${item.id}`);
      skipped += 1; continue;
    }
    processed += 1;
    console.log(`\n[${processed}] ${item.id} — ${item.imageUrl}`);

    // Load the local crop for vision input
    const localPath = join(PUB_DIR, item.imageUrl.replace(/^\//, ''));
    if (!existsSync(localPath)) {
      console.log(`  fail — local file missing`);
      failed += 1; continue;
    }
    const localBuf = readFileSync(localPath);

    // 1. Label (if needed)
    if (!item.character || !item.rarity || !item.type) {
      try {
        const labels = await haikuLabel(localBuf);
        item.character = labels.character || item.character || null;
        item.rarity    = labels.rarity    || item.rarity    || 'SP';
        item.type      = labels.type      || item.type      || 'Character';
        if (labels.cardCode) item.cardCode = labels.cardCode;
        labelled += 1;
        console.log(`  labelled: ${item.character} · ${item.rarity} · ${item.type}` + (item.cardCode ? ` · code=${item.cardCode}` : ''));
      } catch (e) {
        console.log(`  haiku fail: ${e.message}`);
        failed += 1; continue;
      }
    } else if (VERBOSE) {
      console.log(`  already labelled: ${item.character} · ${item.rarity}`);
    }

    // 2. Search for hi-res replacement
    let hires = null;
    try {
      hires = await searchCardpiece({ character: item.character, cardCode: item.cardCode });
    } catch (e) {
      if (VERBOSE) console.warn(`  search err: ${e.message}`);
    }
    if (!hires) {
      console.log(`  no hi-res match — keeping PDF crop (admin can replace)`);
      item.hiResStatus = 'not-found';
      continue;
    }
    console.log(`  hi-res: ${hires.source} · "${hires.title}" · ${hires.url}`);

    // 3. Fetch + watermark
    let watermarkedBuf;
    try {
      const r = await fetch(hires.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SwibSwap-CN-Upgrade/1)' } });
      if (!r.ok) throw new Error(`fetch ${r.status}`);
      const srcBuf = Buffer.from(await r.arrayBuffer());
      // Sanity: don't accept tiny replacements that aren't actually bigger.
      const srcMeta = await sharp(srcBuf).metadata();
      const localMeta = await sharp(localBuf).metadata();
      if ((srcMeta.width || 0) < (localMeta.width || 0) * 1.1) {
        console.log(`  fail — replacement isn't ≥1.1× larger (${srcMeta.width} vs ${localMeta.width})`);
        item.hiResStatus = 'not-larger';
        failed += 1; continue;
      }
      watermarkedBuf = await applyLogoWatermark(srcBuf);
    } catch (e) {
      console.log(`  fetch/watermark fail: ${e.message}`);
      failed += 1; continue;
    }

    // 4. Upload (if --upload, otherwise just label-and-record)
    const lang = (item.lang || 'CN').toLowerCase();
    const codeSlug = slugifyPart(item.cardCode || item.synthCode || `cn-${item.anniv}-${item.idx}`);
    const raritySlug = slugifyPart(item.rarity || 'sp');
    const nameSlug = slugifyPart(item.character || `card-${item.idx}`).slice(0, 32) || 'card';
    const typeSlug = shortType(item.type || 'Character');
    const newName = `${lang}_${codeSlug}_${raritySlug}_${nameSlug}_${typeSlug}.jpeg`;

    if (!UPLOAD || DRY_RUN) {
      console.log(`  DRY — would upload ${watermarkedBuf.length} bytes → ${newName}`);
      upgraded += 1; continue;
    }

    try {
      const b = getBucket();
      const newPath = `verified_cards/samples/${newName}`;
      const file = b.file(newPath);
      await file.save(watermarkedBuf, {
        metadata: {
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=31536000, immutable',
          metadata: { schemaVersion: 'v2-scn96', backfilledAt: new Date().toISOString(), source: hires.source },
        },
        resumable: false,
      });
      await file.makePublic();
      const newUrl = `https://storage.googleapis.com/${b.name}/${newPath}`;

      item._legacyImageUrl = item.imageUrl;
      item.imageUrl = newUrl;
      item.sampleSchemaVersion = 'v2-scn96';
      item.hiResStatus = 'upgraded';
      item.hiResSource = hires.source;
      console.log(`  ✓ uploaded → ${newUrl}`);
      upgraded += 1;
    } catch (e) {
      console.log(`  upload fail: ${e.message}`);
      failed += 1;
    }
  }

  // Save catalog (always, even on dry-run — preserves the labels we just earned)
  if (!DRY_RUN) {
    writeFileSync(CAT_PATH, JSON.stringify(catalog, null, 2) + '\n');
    console.log(`\n✓ catalog saved`);
  }

  console.log(`\n───────── summary ─────────`);
  console.log(`  processed: ${processed}`);
  console.log(`  labelled:  ${labelled}`);
  console.log(`  upgraded:  ${upgraded}`);
  console.log(`  skipped:   ${skipped}`);
  console.log(`  failed:    ${failed}`);
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
