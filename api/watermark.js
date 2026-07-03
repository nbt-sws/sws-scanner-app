// /api/watermark.js — v14 (SCN7 + SCN8)
// Vault-scan watermark — applied to the user's own photo of the card,
// stored as proof in the vault.
//
// SCN8 design — match Vaultscan-wtm.png reference:
//   - Photo passes through largely untouched (no overlay on the card art)
//   - At the BOTTOM MARGIN of the image, a single line of text:
//       "{User} – {Date} – {Time} – SwibSwap"
//   - Subtle, light color, sized to read but not dominate
//   - Same line applied to all 4 corner crops
//   - No card-name / rarity / condition in the text (those were causing
//     empty-square glyphs because the JP chars don't render in DejaVu Sans)
//
// SCN7 — font fix. Vercel's Lambda has DejaVu Sans + Liberation Sans only;
// any Orbitron/SF Pro reference falls back to "missing-glyph squares" when
// the requested face isn't installed. We use the generic CSS family
// `sans-serif` so librsvg/Pango pick DejaVu Sans cleanly.

import sharp from 'sharp';

export const config = { api: { bodyParser: { sizeLimit: '12mb' } } };

const CORNER_FRACTION  = 0.40;
const FULL_LONG_EDGE   = 1600;
const CORNER_LONG_EDGE = 900;
const JPEG_QUALITY     = 88;

function dataUrlToBuffer(d) {
  const m = String(d).match(/^data:(image\/\w+);base64,(.+)$/);
  if (m) return Buffer.from(m[2], 'base64');
  return Buffer.from(String(d).replace(/^data:image\/\w+;base64,/, ''), 'base64');
}

function bufToDataUrl(buf) {
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Strip any non-Latin characters so DejaVu Sans always has a glyph for
// everything in the watermark. Cardholder names with diacritics (é, ñ,
// etc.) are kept — DejaVu covers Latin Extended.
function toAsciiSafe(s) {
  return String(s || '').replace(/[^ -ÿ·–—]/g, '').trim();
}

function formatStamp({ userId, date }) {
  const now = new Date();
  const d   = date || now.toISOString().slice(0, 10);   // "2026-05-19"
  const dateFmt = formatDateHuman(d);                   // "19-May-2026"
  const timeFmt = now.toTimeString().slice(0, 5);        // "00:44"
  const who = toAsciiSafe(userId) || 'user';
  return `${who} – ${dateFmt} – ${timeFmt} – SwibSwap`;
}

// "2026-05-19" → "19-May-2026" (matches the user's Vaultscan-wtm.png).
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDateHuman(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return iso;
  const [, y, mm, dd] = m;
  return `${dd}-${MONTHS[Math.max(0, Math.min(11, parseInt(mm, 10) - 1))]}-${y}`;
}

// ─── Single bottom-margin text overlay ───────────────────────────────────────
// Mirrors the Vaultscan-wtm.png reference: text sits in the bottom margin of
// the photo (where the user's surface/binder shows around the card), in a
// soft white at low opacity. No background pill — relies on the natural
// photo background for contrast.
function buildOverlaySvg({ stamp, width, height }) {
  const shortEdge = Math.min(width, height);
  const fontSize  = Math.max(14, Math.round(shortEdge / 36));
  // Sit the text ~3.5% above the bottom edge so it's in the margin but
  // never touches the canvas boundary.
  const yPx = Math.round(height * 0.965);

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <text x="${Math.round(width * 0.04)}" y="${yPx}"
        font-family="sans-serif"
        font-size="${fontSize}" font-weight="500"
        fill="rgba(255,255,255,0.92)"
        stroke="rgba(0,0,0,0.55)" stroke-width="${Math.max(1, Math.round(fontSize * 0.06))}"
        paint-order="stroke fill"
        text-anchor="start" dominant-baseline="alphabetic">${escapeXml(stamp)}</text>
</svg>`);
}

async function watermark(buf, stamp) {
  const meta = await sharp(buf).metadata();
  const svg = buildOverlaySvg({ stamp, width: meta.width, height: meta.height });
  return sharp(buf)
    .composite([{ input: svg, blend: 'over' }])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const { image, userId, date, mode = 'preview' } = req.body || {};
  if (!image) return res.status(400).json({ ok: false, error: 'Missing image' });

  // mode:
  //   'preview' (default) — scan-time intermediates: full card + 4 corners,
  //                         auto-rotated + resized, NO watermark overlay.
  //                         Used by the scanner-result UI so the user sees
  //                         clean exposure-enhanced previews.
  //   'vault'             — final vault-bound image with the bottom-margin
  //                         metadata stamp baked in. Stored to Firebase
  //                         alongside the vault doc.
  const isVault = String(mode).toLowerCase() === 'vault';

  try {
    const srcBuf = dataUrlToBuffer(image);
    const meta = await sharp(srcBuf).rotate().metadata();
    const W = meta.width, H = meta.height;
    const stamp = isVault ? formatStamp({ userId, date }) : null;

    // Full card — always resized, optionally stamped.
    const fullResized = await sharp(srcBuf)
      .rotate()
      .resize({ width: FULL_LONG_EDGE, height: FULL_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    const full = isVault ? await watermark(fullResized, stamp) : fullResized;

    // Corner crops — auto-exposed via image-preprocess pipeline. For
    // vault-mode the corner gets the stamp too; for preview-mode the
    // corner is bare (user can zoom in and inspect grading detail without
    // a watermark covering it).
    const cw = Math.round(W * CORNER_FRACTION);
    const ch = Math.round(H * CORNER_FRACTION);
    const cornerAt = async (left, top) => {
      const cropped = await sharp(srcBuf)
        .rotate()
        .extract({ left, top, width: cw, height: ch })
        .resize({ width: CORNER_LONG_EDGE, height: CORNER_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();
      return isVault ? watermark(cropped, stamp) : cropped;
    };
    const [tl, tr, bl, br] = await Promise.all([
      cornerAt(0, 0),
      cornerAt(W - cw, 0),
      cornerAt(0, H - ch),
      cornerAt(W - cw, H - ch),
    ]);

    return res.status(200).json({
      ok: true,
      mode: isVault ? 'vault' : 'preview',
      watermarkText: stamp,             // null in preview mode
      full: bufToDataUrl(full),
      corners: {
        topLeft:    bufToDataUrl(tl),
        topRight:   bufToDataUrl(tr),
        bottomLeft: bufToDataUrl(bl),
        bottomRight: bufToDataUrl(br),
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
