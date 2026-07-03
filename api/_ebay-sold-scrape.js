// /api/ebay-sold-scrape.js — v13.9
// Robust scraper for eBay's public sold-listings page. Handles three
// generations of eBay's HTML markup that ship in production today:
//
//   1. Classic <li class="s-item ..."> per row, with .s-item__price /
//      .s-item__title / .s-item__caption--signal POSITIVE for "Sold MMM DD, YYYY".
//   2. Newer <li class="s-card s-card--horizontal"> layout from the 2024-2025
//      redesign, using .s-card__price / .s-card__title.
//   3. Mobile-first JSON island embedded in `window.__EBAY_DATA__` (sometimes
//      present in pages served to UA strings eBay treats as mobile).
//
// We try all three and merge unique listings. Every item gets parsed for
// title / URL / priceUSD / soldDate / thumbnail.

const SOLD_URL = (q) =>
  `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}` +
  `&_sacat=0&LH_Sold=1&LH_Complete=1&_ipg=60`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Referer: 'https://www.ebay.com/',
};

function unescape(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Strip HTML tags from a fragment then collapse whitespace.
function plainText(s) {
  return unescape(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Try to find a sold date anywhere inside a block. eBay uses ~6 different
// markups, so we run a few permissive regexes and pick whichever matches first.
function extractDate(blk) {
  const patterns = [
    // POSITIVE caption with span wrappers: "Sold <span>...</span>May 13, 2026"
    /Sold[\s\S]{0,400}?>\s*([A-Z][a-z]{2,9}\s+\d{1,2},\s*\d{4})/i,
    // Plain "Sold May 13, 2026"
    /Sold\s+([A-Z][a-z]{2,9}\s+\d{1,2},\s*\d{4})/i,
    // Newer s-card variant: "Sold <span class="POSITIVE">May 13, 2026</span>"
    /signal\s+POSITIVE[^>]*>([A-Z][a-z]{2,9}\s+\d{1,2},\s*\d{4})/i,
    // Just any month name followed by date (last-resort, the block IS already a sold listing)
    /([A-Z][a-z]{2,9}\s+\d{1,2},\s*\d{4})/,
  ];
  for (const re of patterns) {
    const m = blk.match(re);
    if (m) {
      const d = new Date(m[1]);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}

// Extract price (USD-equivalent). eBay sometimes shows ranges "US $20 to US $30".
function extractPrice(blk) {
  // Classic .s-item__price
  let m = blk.match(/class="[^"]*s-item__price[^"]*"[^>]*>([^<]+)</i)
       || blk.match(/class="[^"]*s-card__price[^"]*"[^>]*>([^<]+)</i)
       || blk.match(/[$£€¥]\s*[\d,]+(?:\.\d+)?/);
  let raw = m ? unescape(m[1] || m[0]) : '';
  if (!raw) return { priceUSD: 0, currency: 'USD', raw: '' };
  const num = raw.match(/[\d,]+(?:\.\d+)?/);
  const priceUSD = num ? parseFloat(num[0].replace(/,/g, '')) : 0;
  let currency = 'USD';
  if (/£/.test(raw)) currency = 'GBP';
  else if (/€/.test(raw)) currency = 'EUR';
  else if (/¥/.test(raw)) currency = 'JPY';
  else if (/THB/.test(raw)) currency = 'THB';
  return { priceUSD, currency, raw };
}

function extractTitle(blk) {
  const m = blk.match(/<span[^>]*role="heading"[^>]*>([\s\S]*?)<\/span>/i)
        || blk.match(/<div[^>]*class="[^"]*s-item__title[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        || blk.match(/<h3[^>]*s-item__title[^>]*>([\s\S]*?)<\/h3>/i)
        || blk.match(/<div[^>]*class="[^"]*s-card__title[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        || blk.match(/<a[^>]*class="[^"]*s-card__title-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
  return m ? plainText(m[1]) : '';
}

function extractUrl(blk) {
  const m = blk.match(/<a[^>]+class="[^"]*s-item__link[^"]*"[^>]+href="([^"]+)"/i)
        || blk.match(/<a[^>]+class="[^"]*s-card__title-link[^"]*"[^>]+href="([^"]+)"/i)
        || blk.match(/<a[^>]+href="(https:\/\/www\.ebay\.com\/itm[^"]+)"/i);
  return m ? unescape(m[1]) : null;
}

function extractThumb(blk) {
  const m = blk.match(/<img[^>]+src="([^"]+)"/i)
        || blk.match(/<img[^>]+data-src="([^"]+)"/i);
  return m ? unescape(m[1]) : null;
}

function parseBlock(blk) {
  const title = extractTitle(blk);
  if (!title || /^Shop on eBay$/i.test(title) || /^Sponsored$/i.test(title)) return null;
  const { priceUSD, currency, raw } = extractPrice(blk);
  if (!priceUSD) return null;
  const url = extractUrl(blk);
  const soldDate = extractDate(blk);
  const thumbnail = extractThumb(blk);
  return {
    title,
    url,
    priceUSD,
    currency,
    rawPrice: raw,
    soldDate,
    thumbnail,
    country: null,
    source: 'ebay-sold-html',
  };
}

async function scrapeSold(query) {
  const url = SOLD_URL(query);
  let html;
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return { items: [], error: `eBay ${r.status}` };
    html = await r.text();
  } catch (e) {
    return { items: [], error: e.message };
  }

  // Try both layout classes. Each split gives us per-item HTML fragments.
  const layouts = [
    /<li[^>]+class="[^"]*\bs-item\b[^"]*"/i,
    /<li[^>]+class="[^"]*\bs-card\b[^"]*"/i,
  ];

  const items = [];
  const seen = new Set();
  for (const splitter of layouts) {
    const blocks = html.split(splitter).slice(1);
    for (const blk of blocks) {
      const item = parseBlock(blk);
      if (!item || !item.url) continue;
      // Dedup by item URL — strip query string just in case.
      const key = item.url.split('?')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
      if (items.length >= 60) break;
    }
    if (items.length > 0) break;  // first layout that gave us anything wins
  }

  return { items };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });
  const { q } = req.query;
  if (!q) return res.status(400).json({ ok: false, error: 'Missing q' });
  const { items, error } = await scrapeSold(q);
  return res.status(200).json({
    ok: true,
    query: q,
    soldUrl: SOLD_URL(q),
    items,
    itemsWithDate: items.filter((i) => i.soldDate).length,
    error: error || null,
    source: 'ebay-sold-html',
  });
}

export { scrapeSold, SOLD_URL };
