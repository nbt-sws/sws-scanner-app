// /api/op-variants.js
// Returns every printed variant of a One Piece card code, including SAMPLE
// image URLs for each. Powers the Scanner's variant-selection grid:
// the user picks the one matching their physical card and that selection
// becomes the canonical rarity used in pricing + community DB.
//
// Sources merged in this order (earlier wins on duplicates):
//   1. /verified_cards (community DB — what we've seen ourselves)
//   2. optcgapi.com
//   3. apitcg.com
//   4. Bandai direct URLs — code + _p1 / _p2 / _p3 suffix probing for known parallels
//
// Each variant has: { rarity, label, imageUrl, source, fromDb }

import { getDb } from './_firebase-admin.js';
import { searchCardpiece } from './_cardpiece-search.js';

const TIMEOUT = 6000;

async function fetchWithTimeout(url, ms = TIMEOUT, opts = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(id);
    return r;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// ---------- adapters ----------
async function fromVerified(code, lang = null) {
  try {
    const snap = await getDb().collection('verified_cards')
      .where('code', '==', code).get();
    if (snap.empty) return [];
    const langKey = String(lang || '').toUpperCase();
    const out = [];
    snap.forEach((d) => {
      const v = d.data();
      // SCN59: backfill writes per-rarity docs (sampleImageUrl) AND a per-code
      // `__base` doc with `samples: { JP, EN, CN }`. Project the right sample
      // into imageUrl so the variant grid shows a watermarked picture.
      // SCN92 — prefer the watermarked URL when present so variant tiles
      // and SampleHero show the watermarked SAMPLE, not the raw Bandai/
      // cardpiece image. Falls back to sampleImageUrl/officialImageUrl.
      let imageUrl = v.watermarkedSampleUrl || v.sampleImageUrl || v.officialImageUrl || null;
      if (!imageUrl && v.samples) {
        imageUrl = v.samples[langKey]
                || v.samples.JP || v.samples.EN || v.samples.CN || null;
      }
      // The `__base` doc represents "we have a SAMPLE but no per-rarity
      // entry yet" — surface it as a generic 'Base' rarity tile so the
      // user can still tap through.
      const isBase = (v.rarity === 'base') || (d.id || '').endsWith('__base');
      out.push({
        rarity: isBase ? 'Base' : (v.rarity || 'Unknown'),
        label: v.officialName || v.nameEn || code,
        imageUrl,
        source: isBase ? 'verified_cards (backfill)' : 'verified_cards',
        fromDb: true,
        watermarked: true,
        verificationCount: v.verificationCount || 0,
      });
    });
    return out.filter((v) => v.imageUrl);
  } catch { return []; }
}

async function fromOptcgapi(code) {
  try {
    const r = await fetchWithTimeout(`https://optcgapi.com/api/cards/code/${encodeURIComponent(code)}`);
    if (!r.ok) return [];
    const data = await r.json();
    const arr = Array.isArray(data) ? data : (data?.cards || [data]);
    return arr
      .filter((c) => c && (c.rarity || c.images || c.image_url))
      .map((c) => ({
        rarity: c.rarity || 'Unknown',
        label: c.name || c.card_name || code,
        imageUrl: c.images?.large || c.images?.small || c.image_url || c.image,
        source: 'optcgapi.com',
        fromDb: false,
      }));
  } catch { return []; }
}

async function fromApitcg(code) {
  try {
    const r = await fetchWithTimeout(`https://www.apitcg.com/api/one-piece/cards?code=${encodeURIComponent(code)}`);
    if (!r.ok) return [];
    const data = await r.json();
    const arr = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    return arr
      .filter((c) => c && (c.rarity || c.images || c.image))
      .map((c) => ({
        rarity: c.rarity || 'Unknown',
        label: c.name || code,
        imageUrl: c.images?.large || c.images?.small || c.image,
        source: 'apitcg.com',
        fromDb: false,
      }));
  } catch { return []; }
}

// Language → ordered Bandai host preference. The first hostname is what we
// expect to hit; the rest are fallbacks in case the language flavor isn't
// published at that host yet.
// Traditional Chinese (tw.) is intentionally NOT in the catalog — SwibSwap
// supports Simplified Chinese only via onepiece-cardgame.cn + cardpiece.com.
const HOSTS_BY_LANG = {
  JP: ['www.onepiece-cardgame.com', 'asia-en.onepiece-cardgame.com', 'en.onepiece-cardgame.com'],
  EN: ['en.onepiece-cardgame.com', 'asia-en.onepiece-cardgame.com', 'www.onepiece-cardgame.com'],
  AE: ['asia-en.onepiece-cardgame.com', 'en.onepiece-cardgame.com', 'www.onepiece-cardgame.com'],
  CN: ['www.onepiece-cardgame.cn', 'asia-en.onepiece-cardgame.com', 'en.onepiece-cardgame.com'],
};

// Bandai direct URLs — probes for base + every known parallel/promo suffix.
// We hit each candidate with a real GET (a few bytes) using the standard
// browser-like headers proxy-image uses, then accept it if upstream returns
// OK with an image content-type. HEAD requests are unreliable on Bandai's CDN.
async function fromBandai(code, lang = 'JP') {
  const hosts = HOSTS_BY_LANG[String(lang).toUpperCase()] || HOSTS_BY_LANG.JP;
  // Parallel suffixes seen in the wild across OP01–OP10 + ST + EB sets.
  // _p1.._p5 = standard parallel passes
  // _r       = reprint
  // _alt     = alternate art
  // _aa      = all-art (rare 2025+ promo)
  // _f       = foiled card variant
  const suffixes = ['', '_p1', '_p2', '_p3', '_p4', '_p5', '_alt', '_aa', '_f', '_r'];
  const found = [];
  // Try each host until we get any hit at all; once one host responds for the
  // base code, use that host for all suffix probes.
  let workingHost = null;
  for (const host of hosts) {
    try {
      const base = `https://${host}/images/cardlist/card/${code}.png`;
      const r = await fetchWithTimeout(base, 4500, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SwibSwap/13.6)',
          Accept: 'image/png,image/*;q=0.9,*/*;q=0.8',
          Range: 'bytes=0-512',  // tiny range probe
        },
      });
      const ct = r.headers.get('content-type') || '';
      if ((r.ok || r.status === 206) && ct.startsWith('image/')) {
        workingHost = host;
        break;
      }
    } catch { /* try next */ }
  }
  if (!workingHost) return [];

  // Different Bandai sites use different path conventions for card images.
  // We try the most common patterns until one returns an image content-type.
  const pathPatterns = workingHost.endsWith('.cn')
    ? [
        // onepiece-cardgame.cn observed layouts
        `images/cardlist/{code}.png`,
        `images/cardlist/card/{code}.png`,
        `wp-content/uploads/cardlist/{code}.png`,
        `wp-content/uploads/cardlist/images/{code}.png`,
        `assets/cardlist/{code}.png`,
      ]
    : [
        // www / en / asia-en / tw all use this canonical path
        `images/cardlist/card/{code}.png`,
        `images/cardlist/card/{code}.jpg`,
        `images/cardlist/{code}.png`,
      ];

  // Probe every (suffix × pathPattern) at the working host in parallel.
  await Promise.all(suffixes.flatMap((s) =>
    pathPatterns.map(async (pathTpl) => {
      const path = pathTpl.replace('{code}', code + s);
      const url = `https://${workingHost}/${path}`;
      try {
        const r = await fetchWithTimeout(url, 4500, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SwibSwap/13.9)',
            Accept: 'image/png,image/*;q=0.9,*/*;q=0.8',
            Range: 'bytes=0-512',
          },
        });
        const ct = r.headers.get('content-type') || '';
        if ((r.ok || r.status === 206) && ct.startsWith('image/')) {
          found.push({
            rarity: s === '' ? null
                  : s === '_alt' ? 'Alt Art'
                  : s === '_aa'  ? 'All Art'
                  : s === '_f'   ? 'Foiled'
                  : s === '_r'   ? 'Reprint'
                  : 'Parallel',
            label: code + (s || ''),
            imageUrl: url,
            source: workingHost.endsWith('.cn')
              ? 'onepiece-cardgame.cn'
              : `onepiece-cardgame.com (${workingHost.split('.')[0]})`,
            fromDb: false,
            variantSuffix: s || null,
          });
        }
      } catch { /* skip */ }
    })
  ));
  // Deduplicate by URL (same image found via two pathPatterns).
  const seen = new Set();
  return found.filter((v) => {
    if (seen.has(v.imageUrl)) return false;
    seen.add(v.imageUrl);
    return true;
  });
}

// Merge variants — dedupe by imageUrl, fill in missing rarity from later
// sources, keep stable ordering. Bandai entries with null rarity get
// hydrated by optcgapi/apitcg entries with matching variantSuffix-like
// patterns when possible.
function merge(...lists) {
  const byUrl = new Map();
  for (const list of lists) {
    for (const v of list) {
      if (!v?.imageUrl) continue;
      const existing = byUrl.get(v.imageUrl);
      if (!existing) {
        byUrl.set(v.imageUrl, { ...v });
      } else {
        // Fill in fields the first source didn't have.
        if (!existing.rarity && v.rarity) existing.rarity = v.rarity;
        if (!existing.label && v.label) existing.label = v.label;
        if (!existing.fromDb && v.fromDb) existing.fromDb = true;
      }
    }
  }
  const all = Array.from(byUrl.values());

  // SCN74 — drop the catch-all 'Base' tile when at least one real-rarity
  // tile is present. `__base` is a backfill marker meaning "we have a
  // SAMPLE for this code somewhere", not an actual printed rarity. If the
  // user can see SR / SR★ tiles, the 'Base' tile is just noise.
  // Also drop tiles whose rarity is null/empty when real-rarity tiles exist.
  const hasRealRarity = all.some((v) => v.rarity && v.rarity !== 'Base' && v.rarity !== 'Unknown');
  let filtered = hasRealRarity
    ? all.filter((v) => v.rarity && v.rarity !== 'Base' && v.rarity !== 'Unknown')
    : all;

  // SCN79 + SCN82 — Always surface the base/star companion of any rarity
  // that has one. One Piece TCG ships most rares as a pair: a base printing
  // (SR / SEC / L / R / UC / C) and a starred Alt-Art parallel (SR★ / SEC★).
  // External sources sometimes return only one half of the pair, OR label
  // the parallel as "Parallel" / "Alt Art" rather than "SR★". Normalize
  // both shapes and synthesize the missing companion.
  const STAR_RARITIES = ['L', 'SR', 'SEC', 'R', 'UC', 'C'];
  const STAR_RE = new RegExp(`^(${STAR_RARITIES.join('|')})(★?)$`);
  const PARALLEL_RE = /^(parallel|alt[\s-]?art|alternate[\s-]?art)$/i;
  const byRarity = new Map();
  for (const v of filtered) if (v.rarity) byRarity.set(v.rarity, v);
  const pairs = [];
  for (const v of filtered) {
    if (!v.rarity) continue;
    const r = v.rarity.trim();
    const starMatch = r.match(STAR_RE);
    const parallelMatch = PARALLEL_RE.test(r);
    if (starMatch) {
      const base = starMatch[1];
      const hadStar = starMatch[2] === '★';
      const companion = hadStar ? base : `${base}★`;
      if (!byRarity.has(companion)) {
        pairs.push({
          ...v,
          rarity: companion,
          label: hadStar ? v.label : `${v.label || base} (Alt Art ★)`,
          source: `${v.source || 'pair-synth'} (synthetic)`,
          synthetic: true,
        });
        byRarity.set(companion, true);
      }
    } else if (parallelMatch) {
      // SCN82 — generic "Parallel" with no specific base rarity. Synthesize
      // a base tile for each common rarity that isn't already present, so
      // the user has at least SOMETHING to pick if their card is the base.
      // The picker uses the first un-taken base rarity inferred from any
      // sibling tile, falling back to 'SR' if none.
      const baseCandidates = ['SR', 'SEC', 'L', 'R', 'UC', 'C'];
      const inferredBase = baseCandidates.find((b) => byRarity.has(b)) || 'SR';
      if (!byRarity.has(inferredBase)) {
        pairs.push({
          ...v,
          rarity: inferredBase,
          label: `${v.label || inferredBase} (Base printing)`,
          source: `${v.source || 'pair-synth'} (synthetic from Parallel)`,
          synthetic: true,
        });
        byRarity.set(inferredBase, true);
      }
    }
  }
  filtered = [...filtered, ...pairs];

  return filtered;
}

// cardpiece.com — used as a CN-priority source. Maps their product entries
// into our standard variant shape.
async function fromCardpiece(code, name) {
  try {
    const { items, tried } = await searchCardpiece(code, { name });
    return {
      variants: (items || []).map((it) => ({
        // Use the rarity hint extracted from the product title (e.g.
        // "Manga Alt Art", "SR★", "Gold") instead of leaving it null.
        rarity: it.rarityHint || null,
        label: it.title || code,
        imageUrl: it.imageUrl,
        productUrl: it.productUrl,
        source: 'cardpiece.com',
        fromDb: false,
      })),
      tried,
    };
  } catch {
    return { variants: [], tried: [] };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });
  const { code, lang, name, lightweight } = req.query;
  if (!code) return res.status(400).json({ ok: false, error: 'Missing code' });

  // Lightweight mode (formerly /api/code-variants) — returns only the set
  // of rarities seen for this code across our sources. Used by EditPanel
  // to filter the rarity dropdown.
  if (lightweight === '1' || lightweight === 'true') {
    const [verified, optcg, apit] = await Promise.all([
      fromVerified(code, lang),
      fromOptcgapi(code),
      fromApitcg(code),
    ]);
    const all = new Set();
    for (const v of [...verified, ...optcg, ...apit]) {
      if (v?.rarity) all.add(v.rarity);
    }
    return res.status(200).json({
      ok: true, code,
      rarities: Array.from(all),
      sources: { verified: verified.length, optcgapi: optcg.length, apitcg: apit.length },
    });
  }

  const isCN = String(lang || '').toUpperCase() === 'CN';

  // SCN66 — DB-FIRST MERGE (not short-circuit). Always probe external
  // sources in parallel so the picker shows ALL printed rarities of this
  // code, not just whatever happens to be in verified_cards.
  const [verified, optcg, apit, bandai, cardpieceResult] = await Promise.all([
    fromVerified(code, lang),
    fromOptcgapi(code),
    fromApitcg(code),
    fromBandai(code, lang),
    isCN ? fromCardpiece(code, name) : Promise.resolve({ variants: [], tried: [] }),
  ]);

  const cardpiece = cardpieceResult.variants || [];

  const variants = isCN
    ? merge(verified, cardpiece, optcg, apit, bandai)
    : merge(verified, optcg, apit, bandai, cardpiece);

  return res.status(200).json({
    ok: true,
    code,
    lang: lang || null,
    variants,
    counts: {
      verified:  verified.length,
      optcgapi:  optcg.length,
      apitcg:    apit.length,
      bandai:    bandai.length,
      cardpiece: cardpiece.length,
      total:     variants.length,
    },
    source: verified.length > 0 ? 'db-first-merged' : 'external-probe',
    cardpieceTried: cardpieceResult.tried || null,
  });
}
