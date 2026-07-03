// /api/proxy-image.js
// Fetches a remote image server-side and streams it back through our own
// origin. Solves two problems:
//   1. CORS / hot-link protection on Bandai + community CDNs that randomly
//      reject image loads from arbitrary referrers.
//   2. Variants we discovered with HEAD requests sometimes 404 when the
//      browser later tries the same URL — proxying makes the load deterministic.
//
// Usage from frontend:
//   <img src="/api/proxy-image?url=<encoded original url>" />
//
// Only proxies whitelisted hosts to prevent the endpoint becoming an open relay.

const ALLOWED_HOSTS = [
  'asia-en.onepiece-cardgame.com',
  'en.onepiece-cardgame.com',
  'www.onepiece-cardgame.com',
  'www.onepiece-cardgame.cn',         // Simplified Chinese (Traditional/tw excluded by design)
  'optcgapi.com',
  'www.optcgapi.com',
  'www.apitcg.com',
  'cardpiece.com',
  'cdn.shopify.com',                  // cardpiece's image CDN
  'storage.googleapis.com',
  'firebasestorage.googleapis.com',
];

export const config = {
  api: { responseLimit: '8mb' },
};

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ ok: false, error: 'Missing url' });

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid url' });
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return res.status(403).json({ ok: false, error: 'Host not allowed' });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        // Some CDNs reject default fetch user-agents — pretend to be a browser.
        'User-Agent': 'Mozilla/5.0 (compatible; SwibSwap/13.6)',
        'Accept': 'image/png,image/jpeg,image/webp,image/*;q=0.9,*/*;q=0.8',
      },
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ ok: false, error: `Upstream ${upstream.status}` });
    }
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({ ok: false, error: 'Upstream returned non-image' });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
}
