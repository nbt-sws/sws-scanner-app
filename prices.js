// /api/prices.js — BoBoa Scanner v12 pricing lookup
// Uses eBay Browse API for EN market, Buyee affiliate link for JP market

const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_CERT_ID = process.env.EBAY_CERT_ID;
const BUYEE_AFFILIATE_ID = process.env.BUYEE_AFFILIATE_ID || 'I1NOV';

let cachedToken = null;
let tokenExpiry = 0;

async function getEbayToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const creds = Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString('base64');
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${creds}`,
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function searchEbay(query, soldOnly = false) {
  if (!EBAY_APP_ID || !EBAY_CERT_ID) {
    return { listings: [], note: 'eBay API keys not configured' };
  }
  try {
    const token = await getEbayToken();
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=25`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });
    const data = await res.json();
    const items = (data.itemSummaries || []).map(it => ({
      title: it.title,
      priceUSD: parseFloat(it.price?.value || 0),
      url: it.itemWebUrl,
      source: 'eBay',
      thumbnail: it.image?.imageUrl,
    }));
    return { listings: items };
  } catch (e) {
    return { listings: [], error: e.message };
  }
}

function buildBuyeeUrl(cardName, cardCode) {
  const query = encodeURIComponent(`${cardCode} ${cardName}`);
  return `https://buyee.jp/mercari/search?keyword=${query}&ref=${BUYEE_AFFILIATE_ID}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'GET only' });
  }
  const { code, name, sold } = req.query;
  if (!code && !name) {
    return res.status(400).json({ ok: false, error: 'Missing code or name' });
  }
  const query = [code, name].filter(Boolean).join(' ');
  const { listings, error } = await searchEbay(query, sold === 'true');

  // Calculate stats
  const prices = listings.map(l => l.priceUSD).filter(p => p > 0).sort((a, b) => a - b);
  const stats = prices.length > 0 ? {
    highest: prices[prices.length - 1],
    lowest: prices[0],
    median: prices[Math.floor(prices.length / 2)],
    count: prices.length,
  } : null;

  return res.status(200).json({
    ok: true,
    query,
    stats,
    listings,
    buyeeUrl: buildBuyeeUrl(name || '', code || ''),
    error,
  });
}
