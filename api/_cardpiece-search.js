// api/_cardpiece-search.js — v13.12
// Searches cardpiece.com via Shopify's built-in JSON suggest API. This
// returns structured product data — no HTML scraping needed — and is the
// same endpoint Shopify uses for its in-store predictive search UI.
//
// Endpoint: https://cardpiece.com/search/suggest.json
//   ?q={query}
//   &resources[type]=product
//   &resources[limit]=10
//
// Response shape:
//   { resources: { results: { products: [{ title, handle, featured_image, url, price, ... }] } } }
//
// Strategies tried in order — first one with matches wins:
//   1. Bare code            ("P-066")
//   2. Code without dash    ("P066")
//   3. Code + card name     ("P-066 Boa Hancock")
//   4. Name only            ("Boa Hancock")

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  Accept: 'application/json,text/javascript;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const ENDPOINT = (q) =>
  `https://cardpiece.com/search/suggest.json?q=${encodeURIComponent(q)}` +
  `&resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=show`;

// Shopify's predictive-search returns featured_image as EITHER a string
// (older themes) OR an object like { url, alt, aspect_ratio, height, width }
// (newer themes). Handle both shapes — passing the object straight to a
// URL silently stringifies it to "[object Object]".
function pickImageUrl(...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === 'string') return c;
    if (typeof c === 'object') {
      if (typeof c.url === 'string') return c.url;
      if (typeof c.src === 'string') return c.src;
    }
  }
  return null;
}

function normalizeImageUrl(u) {
  const raw = pickImageUrl(u);
  if (!raw) return null;
  let url = String(raw);
  if (url.startsWith('//')) url = 'https:' + url;
  // Strip Shopify resize suffix so we get full-resolution image.
  url = url.replace(/_(\d+x\d*|\d*x\d+|grande|large|medium|small)\.(jpg|jpeg|png|webp)/i, '.$2');
  return url;
}

async function fetchSuggest(q) {
  const url = ENDPOINT(q);
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return { items: [], status: r.status, error: `HTTP ${r.status}`, url };
    const data = await r.json();
    const products = data?.resources?.results?.products || [];
    const items = products.map((p) => ({
      title: p.title || '',
      productUrl: p.url ? `https://cardpiece.com${p.url}` : null,
      // featured_image is sometimes a string, sometimes { url, alt, ... }
      // — normalizeImageUrl handles both via pickImageUrl.
      imageUrl: normalizeImageUrl(p.featured_image || p.image),
      handle: p.handle,
    })).filter((it) => it.imageUrl && typeof it.imageUrl === 'string');
    return { items, status: r.status, url, totalRaw: products.length };
  } catch (e) {
    return { items: [], error: e.message, url };
  }
}

// Strict matcher: only return products whose title or URL contains the
// exact code (or the same code with the dash stripped) — OR, when name is
// available, contains the card name. Drops unrelated "One Piece"
// catalog items.
function rank(items, code, name) {
  const want = String(code).toUpperCase();
  const noDash = want.replace('-', '');
  const wantName = name ? String(name).toUpperCase() : null;
  return items
    .map((it) => {
      const t = `${it.title} ${it.productUrl || ''}`.toUpperCase();
      let score = 0;
      if (t.includes(want))                    score += 30;
      else if (t.includes(noDash))             score += 20;
      if (wantName && t.includes(wantName))    score += 15;
      return { ...it, score, matchedTitle: it.title };
    })
    .filter((it) => it.score > 0)           // STRICT: code or name must appear
    .sort((a, b) => b.score - a.score);
}

// Extract a rarity hint from the product title — used as the variant label
// in the picker so the user sees "Manga Alt Art" / "Gold Parallel" / etc.
// instead of "Unknown".
function rarityHintFromTitle(title) {
  if (!title) return null;
  const t = title.toUpperCase();
  if (/MANGA/.test(t)) return 'Manga Alt Art';
  if (/GOLD/.test(t)) return 'Gold';
  if (/PRISMATIC/.test(t)) return 'Prismatic';
  if (/SECRET[\s\W]*RARE|SEC[^A-Z]/.test(t)) return /STAR|PARALLEL/.test(t) ? 'SEC★' : 'SEC';
  if (/SUPER[\s\W]*RARE|\bSR\b/.test(t)) return /STAR|PARALLEL/.test(t) ? 'SR★' : 'SR';
  if (/LEADER|\bL\b/.test(t)) return /STAR|PARALLEL/.test(t) ? 'L★' : 'L';
  if (/TREASURE|\bTR\b/.test(t)) return 'TR';
  if (/PROMO/.test(t)) return 'P';
  if (/PSA[\s.-]*10/.test(t)) return 'PSA 10';
  if (/BGS[\s.-]*10/.test(t)) return 'BGS 10';
  if (/CGC[\s.-]*10/.test(t)) return 'CGC 10';
  if (/ARS[\s.-]*10/.test(t)) return 'ARS 10';
  if (/ANNIVERSARY/.test(t)) return 'Anniversary';
  return null;
}

export async function searchCardpiece(code, opts = {}) {
  const { name } = opts;
  const queries = [
    code,
    String(code).replace('-', ''),
    name ? `${code} ${name}` : null,
    name ? name : null,
  ].filter(Boolean);

  const tried = [];
  for (const q of queries) {
    const result = await fetchSuggest(q);
    const ranked = rank(result.items, code, name);
    tried.push({
      q,
      hits: result.items.length,
      totalRaw: result.totalRaw || 0,
      ranked: ranked.length,
      status: result.status,
      error: result.error || null,
    });
    if (ranked.length > 0) {
      // Attach a rarity hint extracted from the title for the variant picker.
      const enriched = ranked.slice(0, 6).map((it) => ({
        ...it,
        rarityHint: rarityHintFromTitle(it.title),
      }));
      return { items: enriched, source: 'cardpiece.com', tried };
    }
    // No loose fallback any more — if the strict rank returns nothing,
    // we skip this query and try the next strategy.
  }

  return { items: [], source: 'cardpiece.com', tried, error: 'no strict matches across all strategies' };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });
  const { code, name } = req.query;
  if (!code) return res.status(400).json({ ok: false, error: 'Missing code' });
  const result = await searchCardpiece(code, { name });
  return res.status(200).json({
    ok: true,
    code,
    items: result.items,
    diagnostics: result.tried,
    source: result.source,
    error: result.error || null,
  });
}
