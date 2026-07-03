// /api/_vision.js — v14
// Shared helpers for the Google Vision API. Used by:
//   - /api/visual-match (DON-card ranking against a candidate set)
//   - /api/prices       (reverse-image search for the EXACT card on eBay)
//
// CRITICAL: this is an UNDERSCORE-prefixed file. Vercel does NOT expose it as
// a serverless function. It's a plain ES module imported by route handlers.
//
// WEB_DETECTION is the operation we care about for SCN2. Per Google's docs:
//   - fullMatchingImages       — exact byte-equal matches on the open web
//   - partialMatchingImages    — variants (cropped, scaled, watermarked)
//   - visuallySimilarImages    — fuzzy matches (looks-like)
//   - pagesWithMatchingImages  — PAGE URLs containing any of the above
//
// For the SAMPLE-image flow we only trust the EXACT card identity reasoning,
// so we treat full + partial as "verified same card" and similar as "maybe".

const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

// eBay item-ID regex — matches `/itm/123456789012` plus the variant with a
// SEO slug `/itm/Some-Slug/123456789012`. eBay item IDs are 9-16 digits.
const EBAY_ITEM_RE = /ebay\.[a-z.]+\/itm\/(?:[^/?#]+\/)?(\d{9,16})/i;

// Trusted One Piece TCG sources — when we want a card-identity match (not an
// eBay listing match) we restrict Vision's pagesWithMatchingImages to these
// hosts. They're the canonical product catalogs / official Bandai pages.
// Order matters: earlier entries are higher-trust, used to break ties when
// multiple sites match.
const TRUSTED_OP_HOSTS = [
  'www.onepiece-cardgame.com',
  'en.onepiece-cardgame.com',
  'asia-en.onepiece-cardgame.com',
  'www.onepiece-cardgame.cn',
  'cardpiece.com',
  'optcgapi.com',
  'www.apitcg.com',
  'apitcg.com',
];

// One Piece TCG card-code regex.
// Matches:
//   OP01-001 .. OP99-999  (boosters)
//   ST01-001 .. ST99-999  (starters)
//   EB01-001 .. EB99-999  (extra boosters)
//   PRB01-001 .. PRB99-999 (premium boosters)
//   P-001 .. P-999         (promo)
// Anchored with non-alphanumeric look-arounds so a longer code like "OP01-001A"
// doesn't half-match. Case-insensitive.
const OP_CODE_RE = /(?<![A-Za-z0-9])(?:(?:OP|ST|EB|PRB)\d{1,2}-\d{1,3}|P-\d{1,3})(?![A-Za-z0-9])/i;

// ─── Vision call (web + OCR text in one shot) ────────────────────────────────
// Accepts EITHER a public URL OR a base64-encoded image. URL mode is preferred
// because the SAMPLE images are already hosted publicly (Bandai / cardpiece /
// our Firebase mirror), saving the round-trip + payload bloat.
//
// We request BOTH WEB_DETECTION and DOCUMENT_TEXT_DETECTION in the same call
// — one API request, one quota unit charged. The OCR text is critical for
// DON-card detection because every DON token has "ドン!!カード" + "+1000"
// physically printed on the card; mining the actual card text is far more
// reliable than mining ambiguous web-page titles.
export async function callVisionWebDetection({ imageUrl, imageBase64, maxResults = 50 }) {
  const key = process.env.GOOGLE_VISION_API_KEY;
  if (!key) {
    return { ok: false, degraded: true, reason: 'GOOGLE_VISION_API_KEY not set' };
  }
  if (!imageUrl && !imageBase64) {
    return { ok: false, error: 'Need imageUrl or imageBase64' };
  }
  const imageField = imageUrl
    ? { source: { imageUri: imageUrl } }
    : { content: String(imageBase64).replace(/^data:image\/\w+;base64,/, '') };

  const body = {
    requests: [{
      image: imageField,
      features: [
        { type: 'WEB_DETECTION', maxResults },
        { type: 'DOCUMENT_TEXT_DETECTION' },
      ],
    }],
  };

  try {
    const r = await fetch(`${VISION_ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      return { ok: false, error: `Vision ${r.status}: ${errText.slice(0, 200)}` };
    }
    const data = await r.json();
    const resp = data?.responses?.[0] || {};
    const web = resp.webDetection || {};
    const ocrText = resp.fullTextAnnotation?.text || '';
    return { ok: true, web, ocrText };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── eBay URL extraction ─────────────────────────────────────────────────────
// Pulls eBay item IDs out of the WEB_DETECTION result. Searches:
//   1. pagesWithMatchingImages.url     — eBay listing pages
//   2. fullMatchingImages.url          — direct hits (might be i.ebayimg.com)
//   3. partialMatchingImages.url       — watermarked / cropped versions
//
// Returns a deduplicated, ranked array of { itemId, confidence, source }.
// Confidence: 1.0 = full match, 0.85 = partial, 0.6 = visually similar.
export function extractEbayItemIds(web, { maxItems = 25 } = {}) {
  const byId = new Map();

  const add = (url, confidence, source) => {
    if (!url) return;
    const m = String(url).match(EBAY_ITEM_RE);
    if (!m) return;
    const id = m[1];
    const existing = byId.get(id);
    if (!existing || confidence > existing.confidence) {
      byId.set(id, { itemId: id, confidence, source, foundOn: url });
    }
  };

  // pagesWithMatchingImages — pages containing the image. These ARE eBay
  // listing pages most of the time, so the URL is the listing URL.
  for (const p of (web.pagesWithMatchingImages || [])) {
    const score = Number(p?.score) || 0;
    // Pages with at least one full-match get the highest tier.
    const hasFullMatch = Array.isArray(p.fullMatchingImages) && p.fullMatchingImages.length > 0;
    const hasPartial   = Array.isArray(p.partialMatchingImages) && p.partialMatchingImages.length > 0;
    const conf = hasFullMatch ? 1.0 : hasPartial ? 0.9 : Math.max(0.7, Math.min(0.95, score || 0.7));
    add(p.url, conf, 'pagesWithMatchingImages');
  }

  // Direct image-URL hits. These are i.ebayimg.com URLs — extracting an item
  // ID from them isn't always possible, but sometimes Google indexes the
  // listing page URL directly in fullMatchingImages too.
  for (const it of (web.fullMatchingImages || []))    add(typeof it === 'string' ? it : it?.url, 1.0,  'fullMatchingImages');
  for (const it of (web.partialMatchingImages || [])) add(typeof it === 'string' ? it : it?.url, 0.85, 'partialMatchingImages');
  for (const it of (web.visuallySimilarImages || [])) add(typeof it === 'string' ? it : it?.url, 0.6,  'visuallySimilarImages');

  return Array.from(byId.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxItems);
}

// ─── Trusted-source card-code extraction (SCN11) ─────────────────────────────
// Given a Vision WEB_DETECTION response, return the best card-code guess by:
//   1. Walking pagesWithMatchingImages, keeping only pages hosted on the
//      trusted One Piece TCG sources list
//   2. Parsing each URL + page title for an OP-style card code
//   3. Tallying codes weighted by Vision's per-page confidence + the host's
//      trust rank; returning the winner
//
// Returns:
//   { ok: true, code: 'P-066', confidence: 0.84,
//     evidence: [{ url, pageTitle, score, host }] }
// or:
//   { ok: false, reason: '...' }
export function extractCardCodeFromTrustedSites(web, { topN = 8 } = {}) {
  const pages = Array.isArray(web?.pagesWithMatchingImages) ? web.pagesWithMatchingImages : [];
  if (pages.length === 0) {
    return { ok: false, reason: 'no pagesWithMatchingImages' };
  }

  const codeTally = new Map();   // upperCaseCode → { weight, evidence: [] }
  const trustRank = (host) => {
    const i = TRUSTED_OP_HOSTS.indexOf(host);
    return i === -1 ? 0 : (TRUSTED_OP_HOSTS.length - i) / TRUSTED_OP_HOSTS.length; // 1.0 .. 0.125
  };

  for (const p of pages) {
    if (!p?.url) continue;
    let host;
    try { host = new URL(p.url).hostname.toLowerCase(); } catch { continue; }
    // Soft match — allow any subdomain that ends with a known trusted host.
    const matchedHost = TRUSTED_OP_HOSTS.find((h) => host === h || host.endsWith('.' + h));
    if (!matchedHost) continue;

    // Extract from BOTH URL and page title — page titles like
    // "OP13-051 Boa Hancock (Rare Parallel) | ONE PIECE CARD GAME"
    // are particularly information-dense.
    const haystacks = [p.url, p.pageTitle || ''].filter(Boolean);
    let codeForPage = null;
    for (const h of haystacks) {
      const m = h.match(OP_CODE_RE);
      if (m) { codeForPage = m[0].toUpperCase(); break; }
    }
    if (!codeForPage) continue;

    // Weight: page's own Vision score (0..1, may be undefined) × host trust × match-quality.
    const visionScore = Number(p.score) || 0.5;
    const weight = visionScore * (0.5 + 0.5 * trustRank(matchedHost));
    const cur = codeTally.get(codeForPage) || { weight: 0, evidence: [] };
    cur.weight += weight;
    if (cur.evidence.length < topN) {
      cur.evidence.push({
        url: p.url,
        pageTitle: (p.pageTitle || '').slice(0, 140),
        score: visionScore,
        host: matchedHost,
      });
    }
    codeTally.set(codeForPage, cur);
  }

  if (codeTally.size === 0) {
    return { ok: false, reason: 'No card code found in trusted-source page URLs/titles' };
  }

  // Pick the highest cumulative weight; normalize to 0..1 confidence.
  const ranked = Array.from(codeTally.entries())
    .sort(([, a], [, b]) => b.weight - a.weight);
  const [topCode, topData] = ranked[0];
  const totalWeight = ranked.reduce((s, [, d]) => s + d.weight, 0);
  const confidence = totalWeight > 0 ? topData.weight / totalWeight : 0;
  return {
    ok: true,
    code: topCode,
    confidence: Math.round(confidence * 100) / 100,
    evidence: topData.evidence,
    runnerUp: ranked.length > 1 ? { code: ranked[1][0], weight: ranked[1][1].weight } : null,
  };
}
