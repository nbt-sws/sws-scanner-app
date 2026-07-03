// /api/cn-anniv-cards.js — SCN58
// ------------------------------------------------------------
// CN Anniversary Box visual catalog endpoint. Returns the 33 cards
// extracted from the Bandai CN Anniversary List PDF (1st / 2nd / 3rd
// anniversary), watermarked and stored under /public/cn-anniv/. The
// CnAnnivVisualLookup picker calls this endpoint to populate its grid.
//
// Built on the same shape as /api/don-cards.js so the existing
// /api/visual-match candidate-ranking endpoint can score these as well.
//
// Catalog entry shape (from api/_cn-anniv-catalog.json):
//   {
//     id:         'cn1anv_03',           // canonical id
//     anniv:      '1ANV' | '2ANV' | '3ANV',
//     idx:        3,                     // index within the anniversary
//     page:       1,                     // PDF page the crop came from
//     imageUrl:   '/cn-anniv/anniv1_03.jpeg',
//     setCode:    'CN-1ANV',
//     lang:       'CN',
//     synthCode:  'CN-1ANV-003',         // stable Firestore key
//     bbox:       [l, t, r, b],
//   }
//
// API response (compatible with don-cards.js consumers):
//   { ok, source, count, items: [{ name, variant, rarity, synthCode,
//                                  setHint, imageUrl, anniv, ... }] }
//
// Filtering:
//   ?anniv=2ANV       → only that anniversary's cards
//   ?setCode=CN-2ANV  → same effect, set-code form
//   ?verified=true    → cross-reference against verified_cards (Firestore)
//                       and drop entries with no record. Soft-fails to
//                       unfiltered catalog on Firestore outage.

import catalog from './_cn-anniv-catalog.json';
import { getDb } from './_firebase-admin.js';

async function loadVerifiedSynthCodes(synthCodes) {
  if (!synthCodes || synthCodes.length === 0) return new Set();
  try {
    const db = getDb();
    const verified = new Set();
    const CHUNK = 30;
    for (let i = 0; i < synthCodes.length; i += CHUNK) {
      const slice = synthCodes.slice(i, i + CHUNK);
      const snap = await db.collection('verified_cards')
        .where('code', 'in', slice)
        .select('code')
        .get();
      snap.forEach((doc) => {
        const c = doc.get('code');
        if (c) verified.add(c);
      });
    }
    return verified;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cn-anniv-cards] verified lookup failed:', e.message);
    return null;   // null = "skip the filter, return everything"
  }
}

function buildItem(entry) {
  // Display name: anniversary + index. Once Haiku/OCR resolves the actual
  // character, the contribute flow can update this. For now we show a
  // human-readable placeholder.
  const annivLabel = {
    '1ANV': '1st Anniversary',
    '2ANV': '2nd Anniversary',
    '3ANV': '3rd Anniversary',
  }[entry.anniv] || entry.anniv;

  const displayName = `CN ${annivLabel} #${String(entry.idx).padStart(3, '0')}`;

  return {
    id: entry.id,
    name: displayName,
    character: null,                         // unresolved — Haiku confirm fills this in
    variant: entry.anniv,                    // anniversary slot acts as the variant
    rarity: 'Anniversary Promo',
    synthCode: entry.synthCode,
    setHint: entry.setCode,
    setCode: entry.setCode,
    setName: annivLabel,
    imageUrl: entry.imageUrl,
    anniv: entry.anniv,
    page: entry.page,
    sourceFile: entry.imageUrl.split('/').pop(),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  const { anniv, setCode, verified } = req.query;
  const requireVerified = String(verified || '').toLowerCase() === 'true';

  let items = (catalog.items || []).map(buildItem);

  if (anniv) {
    const a = String(anniv).toUpperCase();
    items = items.filter((it) => (it.anniv || '').toUpperCase() === a);
  }
  if (setCode) {
    const s = String(setCode).toUpperCase();
    items = items.filter((it) => (it.setCode || '').toUpperCase() === s);
  }

  let verifiedDiagnostic = null;
  if (requireVerified && items.length > 0) {
    const codes = Array.from(new Set(items.map((it) => it.synthCode).filter(Boolean)));
    const verifiedCodes = await loadVerifiedSynthCodes(codes);
    if (verifiedCodes === null) {
      verifiedDiagnostic = { verifiedLookup: 'failed', kept: items.length };
    } else {
      const before = items.length;
      items = items.filter((it) => verifiedCodes.has(it.synthCode));
      verifiedDiagnostic = {
        verifiedLookup: 'ok',
        scanned: before,
        kept: items.length,
        unverifiedDropped: before - items.length,
      };
    }
  }

  return res.status(200).json({
    ok: true,
    source: catalog.source || 'CN Anniversary List PDF',
    count: items.length,
    items,
    verifiedFilter: requireVerified ? verifiedDiagnostic : null,
  });
}
