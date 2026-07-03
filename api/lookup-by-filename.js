// api/lookup-by-filename.js — SCN88
// Search the on-disk + Firebase Storage SAMPLE catalogs by filename pattern.
//
// Filename schema (lowercase + underscores):
//   {lang}_{setCode}_{rarity}_{cardname}_{type}.jpeg
//   e.g. en_op07-051_sr-star_boa_char.jpeg
//        cn_st03_sec_zoro_char.jpeg
//        jp_eb03_don_doflamingo_don.jpeg
//
// The endpoint is forgiving: any missing field is wildcarded. We search:
//   1. public/don-pdf-wm/     (DON cards, watermarked)
//   2. public/cn-anniv/       (CN 1st/2nd/3rd anniversary)
//   3. public/don-pdf/        (DON cards, raw)
//   4. Firebase Storage verified_cards/samples/  (community contributions)
//
// Used by step 4 of the SCN88 6-step workflow: when the user clicks Edit
// Field + APPLY, we search the DB by the resulting filename to see if a
// verified SAMPLE already exists before falling back to external probes.

import fs from 'node:fs';
import path from 'node:path';

let firebaseAdmin = null;
try {
  // eslint-disable-next-line global-require
  firebaseAdmin = require('./_firebase-admin.js');
} catch {
  firebaseAdmin = null;
}

// ---- filename helpers ---------------------------------------------------

function slugifyPart(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[★★]/g, '-star')      // star → -star
    .replace(/[^a-z0-9-]+/g, '-')         // any non-alphanum → -
    .replace(/-+/g, '-')                  // collapse repeats
    .replace(/^-|-$/g, '');               // trim
}

function shortType(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('leader')) return 'leader';
  if (t.includes('character')) return 'char';
  if (t.includes('event')) return 'event';
  if (t.includes('stage')) return 'stage';
  if (t.includes('don')) return 'don';
  return slugifyPart(t) || null;
}

function buildPattern({ lang, setCode, rarity, cardName, type }) {
  const parts = [
    slugifyPart(lang),
    slugifyPart(setCode),
    slugifyPart(rarity),
    slugifyPart(cardName),
    shortType(type),
  ];
  return parts.map(p => p || '*');
}

function matchesPattern(filename, pattern) {
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase();
  const segs = base.split('_');
  // Pattern has 5 segments — but legacy filenames may have fewer.
  // Score = number of non-wildcard pattern parts that appear in any segment.
  let score = 0;
  let required = 0;
  for (const p of pattern) {
    if (!p || p === '*') continue;
    required += 1;
    const hit = segs.some(s => s === p) || base.includes(p);
    if (hit) score += 1;
  }
  if (required === 0) return null;
  // Require >= 60% of supplied fields to match.
  const ratio = score / required;
  if (ratio < 0.6) return null;
  return { score, ratio };
}

// ---- file-system scanners ----------------------------------------------

function scanDir(absDir, urlPrefix, pattern) {
  if (!fs.existsSync(absDir)) return [];
  const out = [];
  for (const f of fs.readdirSync(absDir)) {
    if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
    const m = matchesPattern(f, pattern);
    if (!m) continue;
    out.push({
      filename: f,
      url: `${urlPrefix}/${encodeURIComponent(f)}`,
      source: urlPrefix.includes('cn-anniv') ? 'cn-anniv-pdf'
            : urlPrefix.includes('don-pdf-wm') ? 'don-pdf-wm'
            : 'don-pdf',
      score: m.score,
      ratio: m.ratio,
    });
  }
  return out;
}

// ---- Firebase Storage scanner ------------------------------------------

async function scanFirebase(pattern) {
  if (!firebaseAdmin || !firebaseAdmin.storage) return [];
  try {
    const bucket = firebaseAdmin.storage().bucket();
    const [files] = await bucket.getFiles({ prefix: 'verified_cards/samples/' });
    const out = [];
    for (const f of files) {
      const base = path.basename(f.name);
      const m = matchesPattern(base, pattern);
      if (!m) continue;
      // Build a public download URL via getSignedUrl (long-lived).
      const [url] = await f.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      out.push({
        filename: base,
        url,
        source: 'firebase-verified-samples',
        score: m.score,
        ratio: m.ratio,
      });
    }
    return out;
  } catch (e) {
    console.warn('[lookup-by-filename] Firebase scan failed:', e?.message || e);
    return [];
  }
}

// ---- handler -----------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method-not-allowed' });
  }
  const params = req.method === 'GET' ? (req.query || {}) : (req.body || {});
  const { lang, setCode, rarity, cardName, type } = params;

  const pattern = buildPattern({ lang, setCode, rarity, cardName, type });
  console.log('[lookup-by-filename] pattern:', pattern.join('_'));

  const publicRoot = path.join(process.cwd(), 'public');
  const fsResults = [
    ...scanDir(path.join(publicRoot, 'don-pdf-wm'), '/don-pdf-wm', pattern),
    ...scanDir(path.join(publicRoot, 'cn-anniv'),   '/cn-anniv',   pattern),
    ...scanDir(path.join(publicRoot, 'don-pdf'),    '/don-pdf',    pattern),
  ];

  const fbResults = await scanFirebase(pattern);

  const all = [...fsResults, ...fbResults].sort((a, b) => b.ratio - a.ratio || b.score - a.score);

  // Cap to top 12 to keep payload small.
  const top = all.slice(0, 12);

  return res.status(200).json({
    ok: true,
    pattern: pattern.join('_'),
    count: top.length,
    totalScanned: all.length,
    matches: top,
  });
}
