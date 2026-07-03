// skills/image-preprocess.js — v14 (SCN5)
// Card-photo preprocessor. Three explicit stages so failures in any one
// stage don't sink the others:
//
//   STAGE 1 — auto-orient, then attempt smart card crop. We try `sharp.trim`
//             with a finer ladder of thresholds (12–55), validate each crop
//             is BOTH card-aspect AND retained ≥40% of the original area
//             (so over-trim into the art is rejected). Falls back to centered
//             85% crop. Then feathers with ~0.5" of inset padding (3% of the
//             long edge, never less than 24 px) so the corner zooms keep
//             card-edge detail and Vision has breathing room.
//   STAGE 2 — punchy auto-exposure: full-range normalize → light gamma
//             correction → modulate brightness/saturation → sharpen. Applied
//             AFTER the crop so card pixels (not background) drive the
//             histogram. v14 uses a slightly cooler/contrastier mix than v13.
//   STAGE 3 — emit full-card + 4 corner zooms. Corner crop is 40% of the
//             trimmed card. Corner outputs are 900-px long-edge so a 300%
//             on-screen zoom (SCN6) stays sharp.
//
// Returns { full, corners: { topLeft, topRight, bottomLeft, bottomRight } }
// as base-64 data URLs ready to drop into a Haiku image content block.

import sharp from 'sharp';

const CORNER_FRACTION = 0.40;
const FULL_LONG_EDGE = 1600;
const CORNER_LONG_EDGE = 900;
const JPEG_QUALITY = 90;
// Finer ladder so cards with varied backgrounds (white desk, dark mat,
// patterned binder pages) all find a working threshold. 12 catches subtle
// off-white backgrounds, 55 handles glare-heavy near-white cards.
const TRIM_THRESHOLDS = [12, 18, 24, 32, 42, 55];
// Card aspect bounds — accept anything reasonably close to 5:7 portrait.
// 0.55–0.95 covers landscape capture (1/aspect ≈ 0.65) and rotated phones.
const CARD_ASPECT_MIN = 0.55;
const CARD_ASPECT_MAX = 0.95;
// Reject a trim that ate more than 60% of the photo area — that's almost
// certainly over-trimming into the card art instead of background.
const MIN_AREA_RETAINED = 0.40;
// Feather as a fraction of long edge — 3% ≈ 0.5" on a standard card photo.
// Capped at a 24-px minimum so tiny test images still get visible padding.
const FEATHER_FRACTION = 0.03;
const FEATHER_PX_MIN = 24;

function dataUrlToBuffer(image) {
  const m = String(image).match(/^data:(image\/\w+);base64,(.+)$/);
  if (m) return Buffer.from(m[2], 'base64');
  return Buffer.from(String(image).replace(/^data:image\/\w+;base64,/, ''), 'base64');
}

function bufferToDataUrl(buf, mime = 'image/jpeg') {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// Try `sharp.trim` at increasing thresholds. Returns the first attempt that
// produced a card-aspect-ratio output AND retained ≥40% of the original area
// (so we don't over-crop into the card art). Returns null if every threshold
// fails so the caller can fall back to a centred crop.
async function tryTrim(srcBuf, W0, H0) {
  const sourceArea = W0 * H0;
  for (const threshold of TRIM_THRESHOLDS) {
    try {
      const buf = await sharp(srcBuf).rotate().trim({ threshold }).toBuffer();
      const meta = await sharp(buf).metadata();
      const aspect = meta.width / meta.height;
      const inverseAspect = meta.height / meta.width;
      const cardLike =
        (aspect > CARD_ASPECT_MIN && aspect < CARD_ASPECT_MAX) ||
        (inverseAspect > CARD_ASPECT_MIN && inverseAspect < CARD_ASPECT_MAX);
      const didTrim = meta.width < W0 * 0.95 || meta.height < H0 * 0.95;
      const areaRatio = (meta.width * meta.height) / sourceArea;
      const overTrimmed = areaRatio < MIN_AREA_RETAINED;
      if (cardLike && didTrim && !overTrimmed) {
        return { buf, threshold, meta, areaRatio };
      }
    } catch { /* try next threshold */ }
  }
  return null;
}

async function smartCardCrop(srcBuf) {
  try {
    const meta = await sharp(srcBuf).rotate().metadata();
    const W0 = meta.width, H0 = meta.height;

    // Stage 1a — multi-threshold trim.
    const trimmed = await tryTrim(srcBuf, W0, H0);

    let cardBuf;
    let how;
    if (trimmed) {
      cardBuf = trimmed.buf;
      how = `trim@${trimmed.threshold}`;
    } else {
      // Stage 1b — fallback: 85% center crop.
      const cropW = Math.round(W0 * 0.85);
      const cropH = Math.round(H0 * 0.85);
      const left = Math.round((W0 - cropW) / 2);
      const top  = Math.round((H0 - cropH) / 2);
      cardBuf = await sharp(srcBuf).rotate()
        .extract({ left, top, width: cropW, height: cropH })
        .toBuffer();
      how = 'center-crop-85';
    }

    // Stage 1c — feather: ~0.5" inset of navy padding (3% of long edge,
    // minimum 24 px). Keeps the card centered, gives Vision + Haiku a
    // clear border between subject and background, and keeps corner
    // zooms from cutting off card-edge detail like rarity stamps.
    const cardMetaPre = await sharp(cardBuf).metadata();
    const longEdge = Math.max(cardMetaPre.width, cardMetaPre.height);
    const featherPx = Math.max(FEATHER_PX_MIN, Math.round(longEdge * FEATHER_FRACTION));
    const feathered = await sharp(cardBuf)
      .extend({
        top: featherPx, bottom: featherPx, left: featherPx, right: featherPx,
        background: { r: 10, g: 15, b: 46, alpha: 1 },
      })
      .toBuffer();

    return { buf: feathered, how, featherPx };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[preprocess] smartCardCrop failed:', e.message);
    return { buf: srcBuf, how: 'no-op (error)' };
  }
}

// Punchy enhancement pipe — applied AFTER the smart crop so the histogram
// is computed against card pixels, not background.
//
// SCN5 (v14) updates vs v13:
//   - `gamma(1.15)` lifts shadows where rarity stamps + cost circles live
//   - normalize() retained for full-range stretch
//   - brightness up from 1.06 → 1.08 (very subtle but reads better)
//   - saturation up from 1.20 → 1.25 (helps blue/red rarity rings pop)
//   - sharpen sigma 1.0 → 1.1 with more aggressive m2 for crisper text
function enhance(pipe) {
  return pipe
    .gamma(1.15)
    .normalize()
    .modulate({ saturation: 1.25, brightness: 1.08 })
    .sharpen({ sigma: 1.1, m1: 0.5, m2: 2.0 });
}

export async function preprocessForScan(image) {
  const srcBuf = dataUrlToBuffer(image);

  // STAGE 1 — smart crop with feather.
  const { buf: cardBuf, how, featherPx } = await smartCardCrop(srcBuf);
  const cardMeta = await sharp(cardBuf).metadata();
  const W = cardMeta.width;
  const H = cardMeta.height;

  // STAGE 2 — full card view, enhanced + resized.
  const fullBuf = await enhance(sharp(cardBuf))
    .resize({ width: FULL_LONG_EDGE, height: FULL_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  // STAGE 3 — 40%-of-card corner zooms, also enhanced.
  const cw = Math.round(W * CORNER_FRACTION);
  const ch = Math.round(H * CORNER_FRACTION);
  const cropAt = async (left, top) => enhance(sharp(cardBuf))
    .extract({ left, top, width: cw, height: ch })
    .resize({ width: CORNER_LONG_EDGE, height: CORNER_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  const [tl, tr, bl, br] = await Promise.all([
    cropAt(0, 0),
    cropAt(W - cw, 0),
    cropAt(0, H - ch),
    cropAt(W - cw, H - ch),
  ]);

  return {
    full: bufferToDataUrl(fullBuf),
    corners: {
      topLeft: bufferToDataUrl(tl),
      topRight: bufferToDataUrl(tr),
      bottomLeft: bufferToDataUrl(bl),
      bottomRight: bufferToDataUrl(br),
    },
    diagnostics: { cropMethod: how, featherPx, cardW: W, cardH: H },
  };
}

export function imagesToContent({ full, corners }) {
  const blocks = [];
  const push = (label, dataUrl) => {
    const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return;
    blocks.push({ type: 'text', text: label });
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: m[1], data: m[2] },
    });
  };
  push('FULL CARD (smart-cropped + auto-exposed + +30 px feather):', full);
  push('TOP-LEFT corner zoom (cost circle, rarity hints, foil pattern start):', corners.topLeft);
  push('TOP-RIGHT corner zoom (YGO card code, attribute icon for OP):', corners.topRight);
  push('BOTTOM-LEFT corner zoom (CN 区BX region marker, attribute icon, set logo):', corners.bottomLeft);
  push('BOTTOM-RIGHT corner zoom (OP/CN card code + rarity stamp + ★ parallel mark + SP/TR sign):', corners.bottomRight);
  return blocks;
}
