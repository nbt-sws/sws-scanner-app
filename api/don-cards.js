// /api/don-cards.js — v14 SCN17
// ------------------------------------------------------------
// DON-card catalog endpoint. Returns the curated list of DON token variants
// for the DonVisualLookup variant picker.
//
// SCN17 change: replaced the optcgapi.com scrape (now blocked by their host
// allowlist + had no character labels) with a PDF-driven catalog extracted
// from the official Bandai "DON!! Card List" reference PDF dated Nov 2025.
// The catalog lives at api/_don-pdf-catalog.json and the matching SAMPLE
// images live in /public/don-pdf/ (served as static files at /don-pdf/*).
//
// Catalog item shape:
//   {
//     id:           'p10_c1',               // page + cell-on-page identifier
//     imageUrl:     '/don-pdf/p10_c1.jpeg', // public static asset URL
//     setCode:      'PRB-01',               // canonical set code
//     setName:      'ONE PIECE CARD THE BEST',
//     setLabelJp:   '...',                  // original JP label from PDF
//     variant:      'regular' | 'gold',
//     rarity:       'DON!!' | 'DON!! Gold',
//     character:    'Donquixote Doflamingo' | null,    // future: filled in by labeling pass
//   }
//
// API response shape (compatible with the previous endpoint):
//   { ok, source, count, items: [{ name, variant, rarity, synthCode,
//                                  setHint, imageUrl, ... }] }
// where `name` and `synthCode` derive from `character` when present,
// otherwise from `setName` (so symbol DONs identify by set).
//
// Filtering:
//   ?name=...      → substring match on character/set name
//   ?variant=gold  → only gold-parallel cards
//   ?setCode=PRB-01 → only cards from that set

import catalog from './_don-pdf-catalog.json';
import { getDb } from './_firebase-admin.js';

// SCN48: cross-reference a list of synthetic DON codes against the
// Firestore `verified_cards` collection. Returns a Set of synthCodes
// that have at least one verified record (any rarity). Failures fall
// through to "everything verified" so a Firestore outage doesn't
// blackhole the picker.
async function loadVerifiedDonCodes(synthCodes) {
  if (!synthCodes || synthCodes.length === 0) return new Set();
  try {
    const db = getDb();
    const verified = new Set();
    // Firestore IN-query is capped at 30 — chunk the lookups.
    // We match on `code` field which the contribute / backfill endpoints
    // populate per record (e.g. "Donquixote Doflamingo Don Card").
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
    // Firestore down or admin SDK unavailable — soft fail to "all verified"
    // by returning null (caller treats null as "skip filter").
    // eslint-disable-next-line no-console
    console.warn('[don-cards] verified lookup failed:', e.message);
    return null;
  }
}

function buildItem(entry) {
  // Synthetic identifier: prefer character name when known, fall back to
  // set name + cell so each PDF entry has a stable identity even when
  // it's an unnamed symbol DON.
  const displayName = entry.character || entry.setName || `DON ${entry.setCode || entry.id}`;
  const synthCode   = entry.character
    ? `${entry.character} Don Card`
    : `${entry.setName || entry.setCode || 'DON'} Don Card`;
  return {
    id: entry.id,
    name: displayName,
    character: entry.character || null,
    variant: entry.variant === 'gold' ? 'Gold' : (entry.variant || 'Regular'),
    rarity: entry.rarity,
    synthCode,
    setHint: entry.setCode || null,
    setName: entry.setName || null,
    setLabelJp: entry.setLabelJp || null,
    imageUrl: entry.imageUrl,
    page: entry.page,
    cell: entry.cell,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  const { name, variant, setCode, character, verified } = req.query;
  // SCN48: opt-in cross-reference against Firestore verified_cards. The
  // DonVisualLookup picker calls this with ?verified=true so users only
  // see DON variants we have a record for. Falls back to the unfiltered
  // catalog if Firestore lookup fails (admin SDK or quota outage).
  const requireVerified = String(verified || '').toLowerCase() === 'true';

  let items = (catalog.items || []).map(buildItem);

  if (name) {
    const q = String(name).toLowerCase();
    items = items.filter((it) =>
      (it.name || '').toLowerCase().includes(q) ||
      (it.character || '').toLowerCase().includes(q) ||
      (it.setName || '').toLowerCase().includes(q)
    );
  }
  if (character) {
    const q = String(character).toLowerCase();
    items = items.filter((it) => (it.character || '').toLowerCase().includes(q));
  }
  if (variant) {
    const v = String(variant).toLowerCase();
    items = items.filter((it) => (it.variant || '').toLowerCase().includes(v));
  }
  if (setCode) {
    const s = String(setCode).toUpperCase();
    items = items.filter((it) => (it.setHint || '').toUpperCase() === s);
  }

  let verifiedDiagnostic = null;
  if (requireVerified && items.length > 0) {
    const codes = Array.from(new Set(items.map((it) => it.synthCode).filter(Boolean)));
    const verifiedCodes = await loadVerifiedDonCodes(codes);
    if (verifiedCodes === null) {
      // Soft fail — return everything but flag in diagnostics.
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
    source: catalog.source || 'PDF catalog',
    count: items.length,
    items,
    verifiedFilter: requireVerified ? verifiedDiagnostic : null,
  });
}
