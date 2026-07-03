// /api/quality.js — v13
// Hybrid card-quality scoring.
//   Stage 1 (CV): use sharp to extract pixel-level signals — centering,
//                 edge/corner darkness (proxy for whitening), surface roughness.
//   Stage 2 (AI): feed the metrics + image to Claude Haiku for a final 1–10
//                 grade with subscores and a one-line explanation.
//
// We cache by image hash just like /api/scan.js so re-grading the same photo
// doesn't burn a fresh Haiku call.

import sharp from 'sharp';
import { hashImage, getCachedScan, putCachedScan } from './_cache.js';
import { verifyUser } from './_firebase-admin.js';

export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
};

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const QUALITY_CACHE_PREFIX = 'q_'; // keep quality cache distinct from scan cache

// ------------------------------------------------------------
// Stage 1 — Computer Vision metrics via sharp
// ------------------------------------------------------------
async function computeCvMetrics(b64) {
  const buf = Buffer.from(b64, 'base64');

  // Resize down for speed but keep enough detail for edge analysis.
  const target = 600;
  const meta = await sharp(buf).metadata();
  const img = sharp(buf).resize({ width: target, withoutEnlargement: true });

  // Greyscale raw pixel matrix.
  const { data, info } = await img
    .clone()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;

  // --- centering: compare brightness of the four border strips (5% wide).
  const strip = Math.max(4, Math.round(Math.min(w, h) * 0.05));
  const avg = (xStart, yStart, xEnd, yEnd) => {
    let sum = 0;
    let count = 0;
    for (let y = yStart; y < yEnd; y++) {
      for (let x = xStart; x < xEnd; x++) {
        sum += data[y * w + x];
        count++;
      }
    }
    return count ? sum / count : 0;
  };
  const topAvg    = avg(0, 0, w, strip);
  const bottomAvg = avg(0, h - strip, w, h);
  const leftAvg   = avg(0, 0, strip, h);
  const rightAvg  = avg(w - strip, 0, w, h);

  // Centering ratio — vertical & horizontal. 1.0 = perfect; >1 = off-center.
  const vRatio = Math.max(topAvg, bottomAvg) / Math.max(1, Math.min(topAvg, bottomAvg));
  const hRatio = Math.max(leftAvg, rightAvg) / Math.max(1, Math.min(leftAvg, rightAvg));
  const centeringScore = Math.max(0, 10 - ((vRatio - 1) + (hRatio - 1)) * 12);

  // --- corner darkness — proxy for whitening (lighter = more wear).
  const cornerBox = Math.max(8, Math.round(Math.min(w, h) * 0.04));
  const tlAvg = avg(0, 0, cornerBox, cornerBox);
  const trAvg = avg(w - cornerBox, 0, w, cornerBox);
  const blAvg = avg(0, h - cornerBox, cornerBox, h);
  const brAvg = avg(w - cornerBox, h - cornerBox, w, h);
  const cornerAvg = (tlAvg + trAvg + blAvg + brAvg) / 4;
  // Higher cornerAvg (brighter corners) = more whitening = lower score.
  const cornerScore = Math.max(0, Math.min(10, 10 - (cornerAvg / 255) * 12));

  // --- surface roughness — stdev of pixel deltas in the centre 60% region.
  const cx0 = Math.round(w * 0.2);
  const cx1 = Math.round(w * 0.8);
  const cy0 = Math.round(h * 0.2);
  const cy1 = Math.round(h * 0.8);
  let prev = data[cy0 * w + cx0];
  let sumDelta = 0;
  let n = 0;
  for (let y = cy0; y < cy1; y += 4) {
    for (let x = cx0; x < cx1; x += 4) {
      const v = data[y * w + x];
      sumDelta += Math.abs(v - prev);
      prev = v;
      n++;
    }
  }
  const avgDelta = sumDelta / Math.max(1, n);
  // Cards have natural surface texture — extreme values either way are bad.
  // Sweet spot ~10–25. Map to a 0–10 surface score.
  const surfaceScore = Math.max(0, 10 - Math.abs(avgDelta - 17) * 0.3);

  return {
    width: w,
    height: h,
    sourceWidth: meta.width,
    sourceHeight: meta.height,
    centeringScore: round1(centeringScore),
    cornerScore: round1(cornerScore),
    surfaceScore: round1(surfaceScore),
    raw: {
      vRatio: round2(vRatio),
      hRatio: round2(hRatio),
      cornerAvg: round1(cornerAvg),
      surfaceDelta: round1(avgDelta),
    },
  };
}

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }

// ------------------------------------------------------------
// Stage 2 — Haiku final judgement
// ------------------------------------------------------------
async function judgeWithHaiku({ apiKey, image, metrics, tcg }) {
  const b64 = image.replace(/^data:image\/\w+;base64,/, '');
  const mediaType = image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

  const prompt = `You are a TCG card-grading assistant. The user has photographed a ${tcg === 'ygo' ? 'Yu-Gi-Oh!' : 'One Piece'} card. A computer-vision preprocessor has produced these objective metrics:

- Centering score (0-10, higher = better): ${metrics.centeringScore}
  (vertical border ratio ${metrics.raw.vRatio}, horizontal ${metrics.raw.hRatio})
- Corner score (0-10): ${metrics.cornerScore}
  (corner avg brightness ${metrics.raw.cornerAvg} — higher means more whitening)
- Surface score (0-10): ${metrics.surfaceScore}
  (delta ${metrics.raw.surfaceDelta} — sweet spot ~17)

Visually inspect the image too. Look for: scratches, print lines, edge nicks, ink defects, foil scratches, fingerprints. CV metrics can miss focused defects — your eyes are the final word.

Return ONLY this JSON:
{
  "grade": 8.5,
  "subscores": {
    "centering": 8,
    "corners": 9,
    "edges": 8,
    "surface": 8
  },
  "estimatedTier": "PSA 8-9 candidate",
  "issues": ["light edge whitening on bottom-left", "minor surface texture in artwork"],
  "confidence": 78
}
The grade is on a 1-10 PSA-style scale (1=poor, 10=gem mint).
estimatedTier should be one of: "PSA 10 candidate", "PSA 9 candidate", "PSA 8-9 candidate", "PSA 7-8 candidate", "Playable raw", "Damaged".
Keep issues to 0-3 short bullets. confidence is your certainty about the grade, 0-100.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Quality AI call failed: ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Quality AI response not parseable');
  return JSON.parse(match[0]);
}

// ------------------------------------------------------------
// Handler
// ------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  const { image, tcg = 'ygo' } = req.body || {};
  if (!image) {
    return res.status(400).json({ ok: false, error: 'Missing image' });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' });
  }

  const hash = QUALITY_CACHE_PREFIX + hashImage(image);
  const user = await verifyUser(req).catch(() => null);

  // Cache hit?
  const cached = await getCachedScan(hash);
  if (cached && cached.quality) {
    return res.status(200).json({
      ok: true,
      quality: cached.quality,
      metrics: cached.metrics,
      cached: true,
      cachedAt: cached.cachedAt,
      hash,
    });
  }

  const b64 = image.replace(/^data:image\/\w+;base64,/, '');

  // Stage 1
  let metrics;
  try {
    metrics = await computeCvMetrics(b64);
  } catch (e) {
    return res.status(500).json({ ok: false, error: `CV failed: ${e.message}` });
  }

  // Stage 2
  let quality;
  try {
    quality = await judgeWithHaiku({ apiKey, image, metrics, tcg });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, metrics });
  }

  // Persist (best effort).
  if (user?.uid) {
    await putCachedScan(hash, { quality, metrics, tcg, userId: user.uid }).catch(() => {});
  }

  return res.status(200).json({
    ok: true,
    quality,
    metrics,
    cached: false,
    hash,
  });
}
