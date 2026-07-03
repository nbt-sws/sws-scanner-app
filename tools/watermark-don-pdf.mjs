#!/usr/bin/env node
// tools/watermark-don-pdf.mjs — SCN19 (logo-PNG variant)
// ----------------------------------------------------------------
// Generates SwibSwap-watermarked versions of every DON card image in
// public/don-pdf/*.jpeg into public/don-pdf-wm/*.jpeg, then updates the
// catalog so don-cards API serves the watermarked URLs.
//
// Watermark style:
//   - logos/Swibswap-wtm-all.png (chameleon mascot + wordmark) composited
//     in the bottom-left corner at ~22% of the card width, semi-transparent.
//   - No diagonal text overlay anymore (clean look matching the SwibSwap
//     SAMPLE reference in /logos/SAMPLE-with-wtm.png).
//
// Run from project root:
//   node tools/watermark-don-pdf.mjs
//
// Idempotent: re-running regenerates from /don-pdf/ (the originals).
// ----------------------------------------------------------------

import sharp from 'sharp';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC_DIR  = join(ROOT, 'public', 'don-pdf');
const OUT_DIR  = join(ROOT, 'public', 'don-pdf-wm');
const CAT_PATH = join(ROOT, 'api', '_don-pdf-catalog.json');
const LOGO_PATH = join(ROOT, 'logos', 'Swibswap-wtm-all.png');

// ─── Tunables ──────────────────────────────────────────────────────────────
// Logo width as a fraction of card width. 0.22 = 22% — large enough to be
// legible, small enough to leave most of the artwork visible.
const LOGO_WIDTH_PCT = 0.22;
// Padding from card edge, also as a fraction of card width.
const PAD_PCT = 0.025;
// Logo opacity (1.0 = full, 0.85 = subtly transparent to let card art show through).
const LOGO_OPACITY = 0.85;

// ─── Pre-check inputs ─────────────────────────────────────────────────────
if (!existsSync(SRC_DIR)) {
  console.error(`ERROR: source dir not found: ${SRC_DIR}`);
  console.error('Run tools/extract-don-pdf.py first.');
  process.exit(1);
}
if (!existsSync(LOGO_PATH)) {
  console.error(`ERROR: logo not found at ${LOGO_PATH}`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

// ─── Pre-load logo once ───────────────────────────────────────────────────
// We'll lazy-resize per card based on each card's actual width, but read the
// file bytes once into memory.
const logoBytes = readFileSync(LOGO_PATH);
const logoMeta = await sharp(logoBytes).metadata();
console.log(`Logo: ${logoMeta.width}×${logoMeta.height} (${logoMeta.channels} channel${logoMeta.channels !== 1 ? 's' : ''})`);

// Pre-cache a single resized logo at a few common card-width buckets so we
// don't re-resize 247 times.
async function getResizedLogo(cardWidth) {
  const targetW = Math.round(cardWidth * LOGO_WIDTH_PCT);
  // Resize + apply opacity. The logo is RGBA; we multiply alpha by LOGO_OPACITY.
  const opacityBuf = Buffer.from(
    [0, 0, 0, Math.round(255 * LOGO_OPACITY)]
  );
  // Trick: blend the logo against a transparent canvas with reduced alpha
  // by extracting + recomposing the alpha channel.
  const resized = await sharp(logoBytes)
    .resize({ width: targetW, withoutEnlargement: true })
    .ensureAlpha()
    .toBuffer();
  // Re-blend alpha = original_alpha * LOGO_OPACITY
  const meta = await sharp(resized).metadata();
  // Use linear() to scale just the alpha channel via composite multiply
  const reducedOpacity = await sharp(resized)
    .composite([{
      input: Buffer.from([0, 0, 0, Math.round(255 * (1 - LOGO_OPACITY))]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
      blend: 'dest-out',
    }])
    .toBuffer();
  return { buffer: reducedOpacity, width: meta.width, height: meta.height };
}

// Cache by card width so we don't resize for every card (most cards have
// identical 376 px source widths from the PDF).
const logoCache = new Map();
async function logoFor(cardWidth) {
  const key = cardWidth;
  if (!logoCache.has(key)) {
    logoCache.set(key, await getResizedLogo(cardWidth));
  }
  return logoCache.get(key);
}

// ─── Watermark a single card image ────────────────────────────────────────
async function watermarkOne(srcPath, outPath) {
  const img = sharp(srcPath);
  const meta = await img.metadata();
  const logo = await logoFor(meta.width);
  const pad = Math.round(meta.width * PAD_PCT);
  // Bottom-left corner placement.
  const left = pad;
  const top = meta.height - logo.height - pad;
  await img
    .composite([{ input: logo.buffer, left, top, blend: 'over' }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(outPath);
}

// ─── Run ──────────────────────────────────────────────────────────────────
const files = readdirSync(SRC_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f));
console.log(`watermarking ${files.length} images → ${OUT_DIR}`);
const startTs = Date.now();
let done = 0;

const BATCH = 8;
for (let i = 0; i < files.length; i += BATCH) {
  const chunk = files.slice(i, i + BATCH);
  await Promise.all(chunk.map(async (f) => {
    const outName = f.replace(/\.(jpe?g|png)$/i, '.jpeg');
    await watermarkOne(join(SRC_DIR, f), join(OUT_DIR, outName));
    done++;
  }));
  if (done % 40 === 0 || done === files.length) {
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
    console.log(`  ${done}/${files.length} [${elapsed}s]`);
  }
}

// ─── Update catalog to point at watermarked URLs ──────────────────────────
const catalog = JSON.parse(readFileSync(CAT_PATH, 'utf8'));
for (const item of catalog.items) {
  if (item.imageUrl?.startsWith('/don-pdf/')) {
    if (!item._originalImageUrl) item._originalImageUrl = item.imageUrl;
    item.imageUrl = item._originalImageUrl
      .replace(/^\/don-pdf\//, '/don-pdf-wm/')
      .replace(/\.(jpe?g|png)$/i, '.jpeg');
  } else if (item.imageUrl?.startsWith('/don-pdf-wm/')) {
    // Already pointing at watermarked — keep as-is, just touch timestamp.
  }
}
catalog.watermarkedAt = new Date().toISOString();
catalog.watermarkStyle = 'logo-png';
writeFileSync(CAT_PATH, JSON.stringify(catalog, null, 2), 'utf8');
console.log(`\nDONE. ${done} watermarked, catalog updated.`);
console.log(`  Style: logo PNG (Swibswap-wtm-all.png), bottom-left @ ${(LOGO_WIDTH_PCT * 100).toFixed(0)}% width, ${(LOGO_OPACITY * 100).toFixed(0)}% opacity`);
