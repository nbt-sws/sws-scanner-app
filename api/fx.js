// /api/fx.js
// Server-side proxy for Frankfurter (FX rates). The Frankfurter project
// recently restricted browser CORS, which started breaking client-side
// fetches from the deployed Vercel origin. We re-issue the call from our
// server and return the JSON with our own CORS headers.
//
// Cached for 1 hour at the edge — FX rates don't move that fast and this
// keeps us well under Frankfurter's polite-use guidelines.

const SOURCE = 'https://api.frankfurter.app/latest?base=THB&symbols=USD,PHP,JPY,MYR,SGD,EUR,GBP';

// Fallback values matching src/theme.js DEFAULT_FX. Used when Frankfurter
// itself is unreachable so the client never sees a hard failure.
const FALLBACK = {
  base: 'THB',
  rates: { USD: 0.0286, PHP: 1.66, JPY: 4.32, MYR: 0.128, SGD: 0.0383, EUR: 0.0258, GBP: 0.0222 },
  date: null,
  fallback: true,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

  try {
    const r = await fetch(SOURCE, {
      headers: { 'User-Agent': 'SwibSwap/13.12 (+https://boboa-v13.vercel.app)' },
    });
    if (!r.ok) {
      return res.status(200).json({ ...FALLBACK, error: `Frankfurter HTTP ${r.status}` });
    }
    const data = await r.json();
    return res.status(200).json({
      base: data.base || 'THB',
      rates: data.rates || FALLBACK.rates,
      date: data.date || null,
      fallback: false,
    });
  } catch (e) {
    return res.status(200).json({ ...FALLBACK, error: e.message });
  }
}
