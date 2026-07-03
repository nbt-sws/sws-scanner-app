// /api/prices.js — v14 (SCN2: vision-image-first)
//
// TWO search modes, picked at request time:
//
// ── Mode A · keyword search (legacy)
//   Used when no `sampleImageUrl` query param is provided.
//   Query format: "{Card Name} {Code} {English Rarity} {Set} {Type} - One piece {Lang}"
//   Falls through Finding API → HTML scrape → Browse API active.
//
// ── Mode B · vision reverse-image search (NEW — SCN2)
//   Used when `sampleImageUrl` IS provided.
//   1. Google Vision WEB_DETECTION on the SAMPLE image →
//      pagesWithMatchingImages → eBay item IDs.
//   2. For each ID, hydrate via eBay Browse API getItemByLegacyId.
//   3. These are the AUTHORITATIVE listings — the exact same SAMPLE image
//      is on those listings, so the card is guaranteed to match.
//   4. Keyword search still runs in parallel for cross-check + fallback.
//
// Why two modes? Keyword search returns lookalike cards (different rarity,
// different language, even different characters with the same English name).
// Reverse-image is byte-exact. The SAMPLE-image flow eliminates the
// "5 listings shown, all wrong card" problem.
//
// Each item still goes through groupByCondition() so PSA/BGS slabs land in
// the Graded tab regardless of which mode pulled them in.

import { scrapeSold, SOLD_URL } from './_ebay-sold-scrape.js';
import { callVisionWebDetection, extractEbayItemIds } from './_vision.js';

const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_CERT_ID = process.env.EBAY_CERT_ID;
const FINDING_ENDPOINT = 'https://svcs.ebay.com/services/search/FindingService/v1';
const TCG_CATEGORY = '183454'; // eBay → Trading Card Singles

// Map rarity acronyms to the English label used in eBay listings.
// Listings on eBay almost always say the English rarity name in the title,
// so searching by acronym alone (e.g. "L★") returns no hits.
const RARITY_ENGLISH = {
  // ─── SCN95: synced with tools/_filename-schema.mjs ────────────────────
  // Adjustments from user spec:
  //   sr-star → 'Super Rare Alt Art' (was 'Super Rare Alternate Art')
  //   sp      → 'Special SP'          (was 'Special Card')
  //   manga   → 'Manga Alt Art'
  // The filename slug is the single source of truth — both this map and
  // tools/_filename-schema.mjs return the same eBay keyword for any rarity.
  C: 'Common', UC: 'Uncommon', R: 'Rare', SR: 'Super Rare', SEC: 'Secret Rare',
  L: 'Leader', TR: 'Treasure Rare', SP: 'Special SP', P: 'Promo',
  'DON!!': 'DON', 'DON!! Gold': 'Don Gold Parallel', 'DON!! R': 'Don Foil',
  MR: 'Manga Alt Art',
  // ★ parallel cards — sellers consistently use "Alt Art" not "Alternate
  // Art" in titles, matching SNKRDUNK + Yuyutei conventions.
  'L★':   'Leader Alt Art',
  'SR★':  'Super Rare Alt Art',
  'SEC★': 'Secret Rare Alt Art',
  'R★':   'Rare Alt Art',
  'UC★':  'Uncommon Alt Art',
  'C★':   'Common Alt Art',
  // CN-anniv promo (SCN58)
  'Anniversary Promo': 'Anniversary',
  // YGO
  N: 'Common', UR: 'Ultra Rare', UL: 'Ultimate Rare', SE: 'Secret Rare',
  HR: 'Holographic Rare', PSE: 'Prismatic Secret Rare', '20TH': '20th Secret Rare',
  QCSE: 'Quarter Century Secret Rare', QCUR: 'Quarter Century Ultra Rare',
  CR: 'Collectors Rare', PGR: 'Premium Gold Rare',
  'OF-PSE': 'Overframe Prismatic Secret', 'OF-UR': 'Overframe Ultra Rare',
  UPR: 'Ultra Parallel Rare', EXSE: 'Extra Secret Rare',
};

const LANG_ENGLISH = {
  JP: 'Japanese', EN: 'English', CN: 'Chinese', AE: 'Asian English',
};

function rarityToEnglish(r) {
  if (!r) return '';
  if (RARITY_ENGLISH[r]) return RARITY_ENGLISH[r];
  // Fallback — strip star and try
  const stripped = String(r).replace('★', '').trim();
  return RARITY_ENGLISH[stripped] || stripped;
}
function langToEnglish(l) {
  return LANG_ENGLISH[String(l || '').toUpperCase()] || l || '';
}

// Browse API OAuth token (used as fallback when Finding API returns empty).
let browseToken = null;
let browseTokenExpiry = 0;
async function getBrowseToken() {
  if (browseToken && Date.now() < browseTokenExpiry) return browseToken;
  if (!EBAY_APP_ID || !EBAY_CERT_ID) return null;
  const creds = Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString('base64');
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${creds}`,
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) return null;
  browseToken = data.access_token;
  browseTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return browseToken;
}

// Hydrate a specific eBay item ID via Browse API getItemByLegacyId.
// Used by the vision-image flow (SCN2) to convert a list of eBay item IDs
// into the same shape as the keyword-search items, so the UI can render
// both sources identically.
async function browseGetItemByLegacyId(legacyId) {
  if (!legacyId) return null;
  const token = await getBrowseToken();
  if (!token) return null;
  try {
    const url = `https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id` +
                `?legacy_item_id=${encodeURIComponent(legacyId)}`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });
    if (!r.ok) return null;
    const it = await r.json();
    if (!it || !it.title) return null;
    return {
      title:    it.title,
      url:      it.itemWebUrl,
      priceUSD: parseFloat(it.price?.value || 0),
      currency: it.price?.currency || 'USD',
      soldDate: null,
      thumbnail: it.image?.imageUrl || (it.additionalImages?.[0]?.imageUrl) || null,
      condition: it.condition || null,
      country:   it.itemLocation?.country || null,
      legacyId,
    };
  } catch {
    return null;
  }
}

// Concurrency-limited hydration. eBay's Browse API is rate-limited per-app;
// 4 in-flight calls keeps us comfortably under the per-second cap while
// still finishing 20 hydrations in ~5 batches.
async function hydrateEbayIds(ids, concurrency = 4) {
  const out = [];
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= ids.length) return;
      const itemId = ids[idx]?.itemId || ids[idx];
      const hyd = await browseGetItemByLegacyId(itemId);
      if (hyd && hyd.priceUSD > 0) out.push(hyd);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, ids.length) }, worker);
  await Promise.all(workers);
  return out;
}

// ─── Vision reverse-image search → eBay items (SCN2 + SCN9) ──────────────────
// Given a SAMPLE imageUrl, return verified eBay listings whose product photo
// matches the SAMPLE. SCN9 layers a STRICT TITLE FILTER on top of the raw
// Vision match — Vision will happily return lookalike-variant listings
// (e.g. OP13-051 when the user picked P-066) because the character art is
// shared between printings. The title filter rejects those.
//
// Filter logic — KEEP a candidate listing only if:
//   - Its title contains the EXACT user-selected card code, OR
//   - Its title contains the user's English name + the rarity tag
// Items that match neither are dropped as "wrong-variant lookalikes".
// ─── Title-match filter (SCN16) ─────────────────────────────────────────────
//
// Applied to every keyword-search path before returning items to the client.
// Reasoning: keyword searches against eBay return lookalike variants and
// completely-different cards that happen to share a few title words. Showing
// those to users as "listings for your card" is misleading. We require:
//
//   strict pass — title contains the card's code (e.g. "OP13-051"), OR
//   loose pass — title contains the English name AND either the rarity
//                  (for raw listings) OR a graded-condition tier (PSA 10
//                  / BGS 10 / BGS 10 BL / CGC 10 / ARS 10)
//
// Synthetic DON-card "codes" like "Donquixote Doflamingo Don Card" are
// stripped to just the character name for matching, because eBay sellers
// never put the literal string "Don Card" in titles — they write "DON!!"
// or "DON Card" or "DON Card Gold Parallel". For DON tokens we require
// the character name AND the "don" substring in the title.
const TITLE_NORM = (s) => String(s || '').toLowerCase().replace(/[\s\-_/]+/g, '');
const GRADED_TITLE_PATTERNS = [
  /psa\s*1?0/i, /bgs\s*1?0/i, /cgc\s*1?0/i, /ars\s*1?0/i, /sgc\s*1?0/i,
];

function passesTitleMatch(title, { code, englishName, rarityEN, isGradedTier = false }) {
  const titleNorm = TITLE_NORM(title);
  if (!titleNorm) return false;

  // Synthetic DON codes: match by character name + "don" token.
  const isSyntheticDon = /^[\w\s.-]+\s+Don\s+Card$/i.test(String(code || ''));
  if (isSyntheticDon) {
    const charName = String(code).replace(/\s+Don\s+Card\s*$/i, '');
    const nameNorm = TITLE_NORM(charName);
    return !!nameNorm && titleNorm.includes(nameNorm) && /don/.test(title.toLowerCase());
  }

  // Strict: code in title.
  const codeNorm = TITLE_NORM(code);
  if (codeNorm && titleNorm.includes(codeNorm)) return true;

  // Loose: name + rarity OR name + graded-tier.
  const nameNorm = TITLE_NORM(englishName);
  if (!nameNorm || !titleNorm.includes(nameNorm)) return false;

  if (isGradedTier) {
    // For graded queries, accept if any graded pattern appears in the raw
    // title (not the normalized form, since spaces matter for "psa 10").
    return GRADED_TITLE_PATTERNS.some((re) => re.test(title));
  }

  const rarityNorm = TITLE_NORM(rarityEN);
  return !!rarityNorm && titleNorm.includes(rarityNorm);
}

async function visionImageListings(sampleImageUrl, { code, englishName, rarityEN, langEN }) {
  if (!sampleImageUrl) return { items: [], diagnostics: { reason: 'no sampleImageUrl' } };
  const visionRes = await callVisionWebDetection({ imageUrl: sampleImageUrl, maxResults: 50 });
  if (!visionRes.ok) {
    return { items: [], diagnostics: { reason: visionRes.reason || visionRes.error || 'Vision call failed' } };
  }
  const ids = extractEbayItemIds(visionRes.web, { maxItems: 25 });
  if (ids.length === 0) {
    return { items: [], diagnostics: { reason: 'No eBay item IDs in Vision web detection' } };
  }
  const hydrated = await hydrateEbayIds(ids, 4);
  const confMap = new Map(ids.map((x) => [x.itemId, x.confidence]));

  // SCN9 — title cross-check via shared passesTitleMatch helper.
  const filtered = [];
  const rejected = [];
  for (const h of hydrated) {
    if (passesTitleMatch(h.title, { code, englishName, rarityEN })) {
      const titleNorm = TITLE_NORM(h.title);
      const matchByCode = TITLE_NORM(code) && titleNorm.includes(TITLE_NORM(code));
      filtered.push({
        ...h,
        visionConfidence: confMap.get(h.legacyId) || 0.7,
        source: 'vision-image',
        matchedBy: matchByCode ? 'code' : 'name+rarity',
      });
    } else {
      rejected.push({ legacyId: h.legacyId, title: h.title.slice(0, 80) });
    }
  }

  filtered.sort((a, b) => (b.visionConfidence || 0) - (a.visionConfidence || 0));

  return {
    items: filtered,
    diagnostics: {
      visionIdsFound: ids.length,
      hydrated: hydrated.length,
      passedTitleFilter: filtered.length,
      rejectedLookalikes: rejected.length,
      rejectedSample: rejected.slice(0, 5),
      filterCriteria: { code, englishName, rarityEN, langEN },
    },
  };
}

// Active-listing search (Browse API) — used when Finding API returns no
// sold items. Listings are asking-prices not sold-prices, so the response
// flags them as `source: 'active'` so the UI can label appropriately.
async function browseActive(query) {
  if (!query) return { items: [] };
  const token = await getBrowseToken();
  if (!token) return { items: [], note: 'No Browse token' };
  try {
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search` +
                `?q=${encodeURIComponent(query)}&category_ids=${TCG_CATEGORY}&limit=25`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
    });
    if (!r.ok) return { items: [], error: `Browse ${r.status}` };
    const data = await r.json();
    const items = (data.itemSummaries || []).map((it) => ({
      title: it.title,
      url: it.itemWebUrl,
      priceUSD: parseFloat(it.price?.value || 0),
      currency: it.price?.currency || 'USD',
      soldDate: null,                  // active listings have no sold date
      thumbnail: it.image?.imageUrl,
      condition: it.condition || null,
      country: it.itemLocation?.country || null,
    })).filter((x) => x.priceUSD > 0);
    return { items };
  } catch (e) {
    return { items: [], error: e.message };
  }
}

// ----------------------------------------------------------
// Finding API call
// ----------------------------------------------------------
async function findSoldItems(query) {
  if (!EBAY_APP_ID) return { items: [], note: 'EBAY_APP_ID not configured' };
  if (!query) return { items: [] };

  const url = new URL(FINDING_ENDPOINT);
  url.searchParams.set('OPERATION-NAME', 'findCompletedItems');
  url.searchParams.set('SERVICE-VERSION', '1.0.0');
  url.searchParams.set('SECURITY-APPNAME', EBAY_APP_ID);
  url.searchParams.set('RESPONSE-DATA-FORMAT', 'JSON');
  url.searchParams.set('REST-PAYLOAD', '');
  url.searchParams.set('keywords', query);
  url.searchParams.set('categoryId', TCG_CATEGORY);
  url.searchParams.set('paginationInput.entriesPerPage', '50');
  url.searchParams.set('sortOrder', 'EndTimeSoonest');
  url.searchParams.set('itemFilter(0).name', 'SoldItemsOnly');
  url.searchParams.set('itemFilter(0).value', 'true');

  try {
    const r = await fetch(url.toString());
    if (!r.ok) return { items: [], error: `eBay HTTP ${r.status}` };
    const data = await r.json();
    const raw = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
    const items = raw.map(parseFindingItem).filter((x) => x && x.priceUSD > 0);
    return { items };
  } catch (e) {
    return { items: [], error: e.message };
  }
}

function parseFindingItem(it) {
  try {
    const sellingStatus = it.sellingStatus?.[0] || {};
    const cp = sellingStatus.convertedCurrentPrice?.[0] || sellingStatus.currentPrice?.[0];
    return {
      title: it.title?.[0] || '',
      url: it.viewItemURL?.[0] || '',
      priceUSD: parseFloat(cp?.['__value__'] || 0),
      currency: cp?.['@currencyId'] || 'USD',
      soldDate: it.listingInfo?.[0]?.endTime?.[0] || null,
      thumbnail: it.galleryURL?.[0] || null,
      condition: it.condition?.[0]?.conditionDisplayName?.[0] || null,
      country: it.country?.[0] || null,
    };
  } catch {
    return null;
  }
}

// ----------------------------------------------------------
// Condition classifier — reads grading hints from the listing title.
// ----------------------------------------------------------
function classifyCondition(title) {
  const t = ` ${String(title || '').toUpperCase()} `;
  // Top-tier grades only — anything lower buckets into "Lower grades" or "Raw".
  if (/[^A-Z]PSA[\s.-]*10[^0-9]/.test(t)) return 'PSA 10';
  if (/[^A-Z]BGS[\s.-]*10\s*BL/.test(t))  return 'BGS 10 BL';
  if (/[^A-Z]BGS[\s.-]*10[^0-9]/.test(t)) return 'BGS 10';
  if (/[^A-Z]CGC[\s.-]*10[^0-9]/.test(t)) return 'CGC 10';
  if (/[^A-Z]ARS[\s.-]*10[^0-9]/.test(t)) return 'ARS 10';
  // Anything else PSA/BGS/CGC/ARS at grade 9 or lower → "Lower grades" bucket.
  if (/\b(PSA|BGS|CGC|ARS)\b[\s.-]*\d/.test(t)) return 'Lower grades';
  if (/\b(GMA|AGS|TAG|HGA|SGC)\b[\s.-]*\d/.test(t)) return 'Lower grades';
  return 'Raw';
}

const KNOWN_TIERS_ORDER = [
  'PSA 10',
  'BGS 10 BL',
  'BGS 10',
  'CGC 10',
  'ARS 10',
  'Lower grades',
  'Raw',
];

// SCN72 — Drop listings whose price differs from the tier median by more
// than 30%. Keyword search drags in lookalike-rarity listings (e.g. a search
// for "OP07-051 SR raw" can return SR★ Alt Art listings priced 5–10× the SR
// median). Outlier filtering ensures each tier reflects the going price for
// the exact rarity being searched. Skips filtering when <3 samples — too
// little data for a reliable median.

// SCN112 — Haiku vision validation pass. After all keyword + code + rarity
// filters, send the official SAMPLE image + each remaining listing's
// thumbnail to Haiku in one batched call. Ask Haiku to mark which thumbnails
// show the SAME card (same code + same rarity art) as the SAMPLE. Drop the
// ones Haiku says no to.
//
// One Haiku call per scan (batched), not one per listing. ~$0.005 per scan.
// Skipped silently when ANTHROPIC_API_KEY isn't set or when there are <2
// listings (no point — keyword already narrowed it).
const HAIKU_API = 'https://api.anthropic.com/v1/messages';
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

async function haikuValidateListings(items, sampleImageUrl, card) {
  if (!process.env.ANTHROPIC_API_KEY) return items;
  if (!sampleImageUrl) return items;
  if (!items || items.length < 2) return items;
  // Cap to top 12 listings to bound Haiku cost.
  const top = items.slice(0, 12);
  const sources = [];
  // Convert SAMPLE URL → base64 once.
  try {
    const r = await fetch(sampleImageUrl);
    if (!r.ok) throw new Error('sample fetch ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    sources.push({ role: 'sample', b64: buf.toString('base64'), mime: r.headers.get('content-type') || 'image/jpeg' });
  } catch (e) {
    console.warn('[haikuValidateListings] sample fetch failed:', e?.message);
    return items;   // fail-open
  }
  // Fetch each thumbnail concurrently with a timeout.
  await Promise.all(top.map(async (it, idx) => {
    try {
      const url = it.thumbnail || it.imageUrl || it.image;
      if (!url) return;
      const r = await fetch(url);
      if (!r.ok) return;
      const buf = Buffer.from(await r.arrayBuffer());
      // Cap thumbnail size to ~50KB (Haiku token budget).
      if (buf.length > 200000) return;
      sources.push({
        role: 'listing',
        index: idx,
        b64: buf.toString('base64'),
        mime: r.headers.get('content-type') || 'image/jpeg',
      });
    } catch { /* skip on fetch error */ }
  }));

  if (sources.length < 3) return items;   // need sample + ≥2 thumbnails

  // Build the messages array: SAMPLE first, then each listing thumbnail
  // tagged with its index, then a single text prompt asking Haiku to return
  // JSON of which indices match.
  const content = [
    { type: 'text', text: `Image 1 below is the official SAMPLE for One Piece TCG card ${card.code || ''} (${card.nameEn || ''}, rarity ${card.rarity || ''}).` },
    { type: 'image', source: { type: 'base64', media_type: sources[0].mime, data: sources[0].b64 } },
  ];
  const listingSources = sources.filter(s => s.role === 'listing');
  for (const s of listingSources) {
    content.push({ type: 'text', text: `Listing #${s.index} thumbnail:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: s.mime, data: s.b64 } });
  }
  content.push({
    type: 'text',
    text: `For EACH listing thumbnail, decide: does it depict the SAME card art as the SAMPLE? (Same character pose AND same rarity treatment — alt-art / star / parallel / treasure rare should NOT match base rarity even if same character.) Return STRICT JSON: {"matches": [<list of listing indices that match>], "rejects": [<list of indices that DO NOT match>]}. No commentary, no markdown.`,
  });

  let matches = new Set();
  try {
    const haikuRes = await fetch(HAIKU_API, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 512,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!haikuRes.ok) {
      console.warn('[haikuValidateListings] Haiku', haikuRes.status, (await haikuRes.text()).slice(0, 200));
      return items;
    }
    const data = await haikuRes.json();
    const text = data?.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.matches)) {
        for (const n of parsed.matches) matches.add(Number(n));
      }
    }
  } catch (e) {
    console.warn('[haikuValidateListings] Haiku call failed:', e?.message);
    return items;   // fail-open
  }
  if (matches.size === 0) return items;   // Haiku had no opinion — keep all
  const kept = top.filter((_, idx) => matches.has(idx));
  // Append any listings beyond the top-12 unchanged (we didn't validate them).
  const result = [...kept, ...items.slice(12)];
  console.log(`[haikuValidateListings] kept ${kept.length} of ${top.length} validated listings`);
  return result;
}

// SCN91 — Card-code guard. eBay's keyword search matches Boa Hancock + Alt
// Art listings across multiple cards (OP07-051, OP14-112, OP14-041 etc.)
// when we search OP13-051. Reject listings whose title contains a code that
// looks like OP/ST/EB/PRB/P-NNN-NNN but isn't ours. Listings with no code
// at all stay (rarity + deviation filters still gate them).
const CODE_RE = /\b(OP|ST|EB|PRB|P)\s*-?\s*0?(\d{1,2})\s*-?\s*(\d{1,3})\b/gi;

function extractCodes(title) {
  const codes = new Set();
  const t = String(title || '');
  CODE_RE.lastIndex = 0;
  let m;
  while ((m = CODE_RE.exec(t)) !== null) {
    const prefix = m[1].toUpperCase();
    const setNum = m[2].padStart(2, '0');
    const cardNum = m[3].padStart(3, '0');
    codes.add(`${prefix}${setNum}-${cardNum}`);
  }
  return codes;
}

function normalizeCode(code) {
  const m = /^([A-Z]+)\s*-?\s*0?(\d{1,2})\s*-?\s*(\d{1,3})$/i.exec(String(code || ''));
  if (!m) return null;
  return `${m[1].toUpperCase()}${m[2].padStart(2, '0')}-${m[3].padStart(3, '0')}`;
}

function filterByCardCode(items, searchedCode) {
  const norm = normalizeCode(searchedCode);
  if (!norm) return items || [];
  return (items || []).filter((it) => {
    const codes = extractCodes(it.title);
    if (codes.size === 0) return true;        // no codes in title → keep (let rarity/deviation gate it)
    return codes.has(norm);                   // listing's codes must include ours
  });
}

// SCN90 — title-token guard. Reject listings whose titles contain a competing
// rarity token that wasn't part of the searched expansion. eBay keyword search
// is greedy: "Trafalgar Law OP07-047 Rare Alternate Art" matches a Treasure
// Rare listing because the name + set match. We block those after the fetch.
const COMPETING_RARITY_TOKENS = {
  // each key = a rarity term WE searched for; value = tokens we must REJECT
  // in titles unless they're also in the search term.
  'Rare Alternate Art':   ['TREASURE', 'SECRET RARE', 'SUPER RARE', 'PROMO'],
  'Super Rare Alternate Art': ['TREASURE', 'SECRET RARE'],
  'Secret Rare Alternate Art': ['TREASURE', 'SUPER RARE'],
  'Common Alternate Art': ['TREASURE', 'SECRET RARE', 'SUPER RARE', 'RARE ', 'LEADER'],
  'Uncommon Alternate Art': ['TREASURE', 'SECRET RARE', 'SUPER RARE', 'RARE ', 'LEADER'],
  'Leader Alternate Art': ['TREASURE', 'SECRET RARE', 'SUPER RARE'],
  'Common':               ['TREASURE', 'SECRET', 'SUPER RARE', 'RARE', 'LEADER', 'PROMO'],
  'Uncommon':             ['TREASURE', 'SECRET', 'SUPER RARE', 'RARE ', 'LEADER'],
  'Rare':                 ['TREASURE', 'SECRET RARE', 'SUPER RARE', 'ALTERNATE ART'],
  'Super Rare':           ['TREASURE', 'SECRET RARE', 'ALTERNATE ART'],
  'Secret Rare':          ['TREASURE', 'SUPER RARE', 'ALTERNATE ART'],
  'Leader':               ['TREASURE', 'SECRET RARE', 'SUPER RARE', 'ALTERNATE ART'],
};

function filterByRarityTokens(items, rarityEN, code) {
  if (!items || items.length === 0) return items || [];
  const competing = COMPETING_RARITY_TOKENS[rarityEN];
  if (!competing) return items;
  const search = String(rarityEN).toUpperCase();
  return items.filter((it) => {
    const title = String(it.title || '').toUpperCase();
    // Always accept listings that contain the exact card code — the seller
    // is being specific, the title-tokens are likely just messy.
    if (code && title.includes(String(code).toUpperCase())) return true;
    // Reject if title has a competing rarity token that isn't already in
    // the searched expansion. (e.g. searching "Rare Alternate Art" → reject
    // "TREASURE" but accept "RARE ALTERNATE ART".)
    for (const tok of competing) {
      if (search.includes(tok)) continue;     // term is in our own search; allow
      if (title.includes(tok)) return false;  // competing term in title; reject
    }
    return true;
  });
}

const DEVIATION_THRESHOLD = 0.20;

function filterPriceDeviations(items) {
  if (!items || items.length < 3) return items || [];
  const sorted = items.map((it) => it.priceUSD).filter((p) => p > 0).sort((a, b) => a - b);
  if (sorted.length < 3) return items;
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!median || median <= 0) return items;
  const lo = median * (1 - DEVIATION_THRESHOLD);
  const hi = median * (1 + DEVIATION_THRESHOLD);
  return items.filter((it) => it.priceUSD >= lo && it.priceUSD <= hi);
}

function groupByCondition(items) {
  const grouped = {};
  for (const it of items) {
    const cond = classifyCondition(it.title);
    if (!grouped[cond]) grouped[cond] = [];
    grouped[cond].push({ ...it, conditionTier: cond });
  }
  const tiers = {};
  for (const [cond, rawList] of Object.entries(grouped)) {
    // SCN72 — drop outliers >30% off the median for THIS tier before
    // building stats. Wrong-rarity lookalikes get dragged in by keyword
    // search (e.g. SR★ Alt Art priced 5-10x SR in the SR Raw bucket).
    const list = filterPriceDeviations(rawList);
    const sorted = [...list].sort((a, b) => new Date(b.soldDate || 0) - new Date(a.soldDate || 0));
    const prices = list.map((i) => i.priceUSD).filter((p) => p > 0).sort((a, b) => a - b);
    if (prices.length === 0) continue;
    tiers[cond] = {
      count: prices.length,
      median: prices[Math.floor(prices.length / 2)],
      lowest: prices[0],
      highest: prices[prices.length - 1],
      avg: prices.reduce((s, p) => s + p, 0) / prices.length,
      lastSold: sorted[0] ? { date: sorted[0].soldDate, priceUSD: sorted[0].priceUSD } : null,
      // Hard-cap to 5 most-recent items per tier (UI + graph) so the listings
      // shown actually match the searched query — eBay's query results widen
      // fast once you go past the top hits.
      items: sorted.slice(0, 5),
    };
  }
  return tiers;
}

function orderedTiers(tiers) {
  const present = Object.keys(tiers);
  const ordered = KNOWN_TIERS_ORDER.filter((t) => present.includes(t));
  const extras = present.filter((t) => !KNOWN_TIERS_ORDER.includes(t));
  return [...ordered, ...extras];
}

// ----------------------------------------------------------
// Mercari Japan deep-links (always provided — useful for JP-only cards)
// ----------------------------------------------------------
function buildMercariUrls({ nameJp, nameEn, code, rarity }) {
  const parts = [nameJp || nameEn, code, rarity].filter(Boolean);
  const keyword = parts.join(' ');
  return {
    onSaleUrl: `https://jp.mercari.com/search?keyword=${encodeURIComponent(keyword)}&category_id=1259&status=on_sale`,
    soldUrl:   `https://jp.mercari.com/search?keyword=${encodeURIComponent(keyword)}&category_id=1259&status=sold_out`,
  };
}

// ----------------------------------------------------------
// Handler
// ----------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });
  const { code, name, nameJp, nameEn, rarity, lang, sampleImageUrl } = req.query;
  const englishName = nameEn || name;
  const japaneseName = nameJp;
  if (!code && !englishName && !japaneseName && !sampleImageUrl) {
    return res.status(400).json({ ok: false, error: 'Missing identifying fields' });
  }

  // v13.8 query format (user-defined):
  //   "Card Name - Card Number - Rarity - Set - Card Type - One piece Language"
  //   only the dash before "One piece Language" is literal; the rest are spaces.
  //
  // Example: "Trafalgar Law ST10-010 TR ST-10 3D2Y Starter Deck - One piece English"
  const rarityEN = rarityToEnglish(rarity);
  const langEN = langToEnglish(lang) || 'Japanese';
  const setQuery = req.query.set || '';   // e.g. "ST-17 The BEST Storage Box Set"

  const cardType = req.query.cardType || '';   // optional type override

  // DON cards use a synthetic code like "Kalgara Don Card". Build a cleaner
  // query for them so eBay isn't choking on duplicated name + "DON!!" punctuation:
  //   "Kalgara Don Card Gold PRB-02 Premium Booster - One piece Japanese"
  const isSyntheticDon = /^[\w\s.-]+\s+Don\s+Card$/i.test(String(code || ''));
  let primary;
  if (isSyntheticDon) {
    // Strip "DON!!" prefix from the rarity for query purposes — eBay sellers
    // write "Gold Parallel" / "Foil" not "DON!! Gold".
    const cleanRarity = String(rarityEN || '')
      .replace(/^don\s*/i, '')
      .replace('!!', '')
      .trim();
    primary = [code, cleanRarity, setQuery]
      .filter(Boolean)
      .join(' ') + (langEN ? ` - One piece ${langEN}` : '');
  } else {
    primary = [
      englishName, code, rarityEN, setQuery, cardType,
    ].filter(Boolean).join(' ') + (langEN ? ` - One piece ${langEN}` : '');
  }

  // SCN39: prepend a "Near Mint" variant to the strategies. This biases
  // raw-card sold/active searches towards NM-quality listings (excluding
  // Played / Light Played / Damaged copies). The plain query is still
  // tried as a fallback when "Near Mint" returns nothing.
  const baseStrategies = [
    primary,
    [englishName, code, rarityEN, setQuery].filter(Boolean).join(' '),
    [englishName, code, rarityEN].filter(Boolean).join(' '),
    [englishName, rarityEN, langEN].filter(Boolean).join(' '),
    [englishName, code].filter(Boolean).join(' '),
    englishName,
    code,
  ].filter(Boolean).filter((q, i, arr) => arr.indexOf(q) === i);
  // First-tier: Near Mint variants of the top 2 queries. Second-tier:
  // plain queries (so if NM is too narrow, broader query still wins).
  const strategies = [
    ...baseStrategies.slice(0, 2).map((q) => `${q} Near Mint`),
    ...baseStrategies,
  ];

  // Single-query consistency rule: find the FIRST strategy that returns
  // sold-history results. We then use that same query for the Browse
  // (active-listings) fallback AND for both eBay deep-links — so the
  // in-app data, the "Sold History" button, and the "Current Listings"
  // button all show consistent product universes.
  let chosen = { query: null, items: [], source: null };
  let visionDiagnostics = null;

  // Pass 0 (NEW — SCN2 + SCN9): Vision reverse-image search on the SAMPLE.
  // When the caller provides sampleImageUrl, this is the AUTHORITATIVE
  // source — eBay items whose product photo is byte-equal to the SAMPLE,
  // FILTERED through a strict title cross-check that rejects lookalike
  // variant listings (e.g. the same character art reprinted under a
  // different code). If we get ≥1 hit, we skip the keyword passes.
  if (sampleImageUrl) {
    const visionRes = await visionImageListings(sampleImageUrl, {
      code, englishName, rarityEN, langEN,
    });
    visionDiagnostics = visionRes.diagnostics;
    if (visionRes.items.length >= 1) {
      chosen = {
        query: primary,                  // keyword used for cross-check display only
        items: visionRes.items,
        source: 'active',                // they're live listings, not sold
        mode: 'vision-image',
      };
    }
  }

  // SCN16: keyword-path filter applied after every result set so that only
  // listings whose titles actually match the identified card are kept.
  // Tracks how many we rejected for diagnostics.
  const keywordFilter = (items) => {
    const kept = [];
    let rejected = 0;
    for (const it of items) {
      if (passesTitleMatch(it.title, { code, englishName, rarityEN })) {
        kept.push(it);
      } else {
        rejected++;
      }
    }
    return { kept, rejected };
  };
  let totalRejected = 0;

  // Pass 1: Finding API for sold history (only works for approved accounts).
  // Skipped when Vision already returned high-confidence hits.
  if (chosen.items.length === 0) {
    for (const q of strategies) {
      const { items } = await findSoldItems(q);
      const { kept, rejected } = keywordFilter(items);
      totalRejected += rejected;
      if (kept.length > 0) {
        chosen = { query: q, items: kept, source: 'sold', mode: 'keyword-sold' };
        break;
      }
    }
  }

  // Pass 2: HTML scrape of eBay's sold web page (works for everyone).
  if (chosen.items.length === 0) {
    for (const q of strategies) {
      const { items } = await scrapeSold(q);
      const { kept, rejected } = keywordFilter(items);
      totalRejected += rejected;
      if (kept.length > 0) {
        chosen = { query: q, items: kept, source: 'sold', mode: 'keyword-scrape' };
        break;
      }
    }
  }

  // Pass 3: Browse API for ACTIVE listings.
  //   - If a sold-query found data above, RE-USE the same query so the
  //     active set reflects the same universe.
  //   - If nothing sold matched, fall through to broader queries.
  if (chosen.items.length === 0) {
    const activeQueries = [primary, ...strategies].filter((q, i, arr) => q && arr.indexOf(q) === i);
    for (const q of activeQueries) {
      const { items } = await browseActive(q);
      const { kept, rejected } = keywordFilter(items);
      totalRejected += rejected;
      if (kept.length > 0) {
        chosen = { query: q, items: kept, source: 'active', mode: 'keyword-active' };
        break;
      }
    }
  }

  // Parallel graded-condition searches — top-tier grades only (no 9s) to
  // keep the price card focused on the slabs collectors actually trade.
  // Each capped at 10 results to avoid blowing the function timeout.
  const GRADED_TIERS = ['PSA 10', 'BGS 10', 'BGS 10 BL', 'CGC 10', 'ARS 10'];
  const graded = await Promise.all(GRADED_TIERS.map(async (tier) => {
    const q = `${primary} ${tier}`;
    // Prefer scrape (real sold) when we have it, fall back to Browse.
    let items = [];
    try {
      const { items: sold } = await scrapeSold(q);
      if (sold.length > 0) items = sold.slice(0, 10);
    } catch { /* skip */ }
    if (items.length === 0) {
      try {
        const { items: active } = await browseActive(q);
        items = (active || []).slice(0, 10);
      } catch { /* skip */ }
    }
    // SCN16: filter graded results by name + grade-tier match (rarity is
    // displaced by the grade in graded listings, so passesTitleMatch with
    // isGradedTier:true relaxes the rarity requirement).
    const gradedKept = items.filter((it) =>
      passesTitleMatch(it.title, { code, englishName, rarityEN, isGradedTier: true })
    );
    totalRejected += items.length - gradedKept.length;
    return { tier, query: q, items: gradedKept };
  }));

  // Merge graded items into the main item set so the standard tier-grouping
  // picks them up too. Tag them with the condition tier explicitly to bypass
  // title-parsing where eBay sellers don't put the grade in the title.
  for (const g of graded) {
    for (const it of g.items) {
      // Don't re-add an item already present (by URL).
      if (chosen.items.some((x) => x.url === it.url)) continue;
      chosen.items.push({ ...it, conditionTier: g.tier });
    }
  }

  // SCN90 — drop listings whose titles contain a competing rarity
  // token (TREASURE when searching R★ Alt Art, etc.) so the displayed
  // history matches the edited rarity. See filterByRarityTokens().
  // SCN91 — code-prefix guard. Reject listings whose title contains a
  // different OP/ST/EB/PRB code than searched (e.g. OP14-112 leaking
  // into an OP13-051 search). Run BEFORE rarity-token guard.
  chosen.items = filterByCardCode(chosen.items, code);
  chosen.items = filterByRarityTokens(chosen.items, rarityEN, code);
  // SCN112 — Haiku batch-vision cross-check against the SAMPLE.
  if (sampleImageUrl && chosen.items.length >= 2) {
    chosen.items = await haikuValidateListings(chosen.items, sampleImageUrl, {
      code, nameEn: englishName, rarity,
    });
  }
  // SCN99 — sort sold listings ahead of active in the final order so the
  // pricing UI surfaces the most authoritative (sold) data first.
  chosen.items.sort((a, b) => {
    const aSold = a.soldDate ? 1 : 0;
    const bSold = b.soldDate ? 1 : 0;
    if (aSold !== bSold) return bSold - aSold;
    return new Date(b.soldDate || 0) - new Date(a.soldDate || 0);
  });
  const tiers = groupByCondition(chosen.items);
  const tierOrder = orderedTiers(tiers);
  const mercari = buildMercariUrls({ nameJp: japaneseName, nameEn: englishName, code, rarity });

  // Overall stats across all items (for the "All" tab).
  const allPrices = chosen.items.map((i) => i.priceUSD).filter((p) => p > 0).sort((a, b) => a - b);
  const overall = allPrices.length === 0 ? null : {
    count: allPrices.length,
    median: allPrices[Math.floor(allPrices.length / 2)],
    lowest: allPrices[0],
    highest: allPrices[allPrices.length - 1],
    lastSold: chosen.items[0]
      ? { date: chosen.items[0].soldDate, priceUSD: chosen.items[0].priceUSD }
      : null,
    items: chosen.items.slice(0, 5),      // hard-cap to 5 — keep results tight
  };

  // Helpful direct-search URLs the UI can always show. Both sold and active
  // use the SAME canonical query string — they're literally the same search,
  // just one with LH_Sold=1 and one without — so users see consistent results
  // between the in-app view and the eBay deep link.
  const canonicalQuery = chosen.query || primary || englishName || code;
  const ebaySoldUrl   = SOLD_URL(canonicalQuery);
  const ebayActiveUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(canonicalQuery)}&_sacat=0&_ipg=60`;

  return res.status(200).json({
    ok: true,
    query: chosen.query,
    totalSold: chosen.items.length,
    tiers,
    tierOrder,
    overall,
    mercari,
    fallbackLinks: {
      ebaySold: ebaySoldUrl,
      ebayActive: ebayActiveUrl,
    },
    canonicalQuery,
    source: chosen.source === 'sold'
      ? 'eBay sold (Finding API · findCompletedItems · last 90 days)'
      : chosen.source === 'active'
        ? 'eBay active listings (Browse API · asking prices, not sold)'
        : 'eBay (no results)',
  });
}
