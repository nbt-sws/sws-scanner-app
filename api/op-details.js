// /api/op-details.js
// Look up a One Piece card by code from free community APIs.
// Returns canonical card metadata + a SAMPLE image URL that is free to display
// commercially (the underlying card art is Bandai IP; the API just hosts
// fan-curated copies of officially-published card images).
//
// Sources tried in order:
//   1. optcgapi.com — primary, Bandai-aligned data + images
//   2. apitcg.com   — secondary, multi-TCG metadata service
//
// Either may return slightly different field names; we normalize to a single
// shape that the Scanner UI consumes.
//
// Side effect: when called WITH a ?rarity= query param, we passively mirror
// the SAMPLE image into Firebase Storage at verified_cards/{code}__{rarity}.jpg
// so the community DB grows even before anyone explicitly contributes.

import { getBucket } from './_firebase-admin.js';

const FETCH_TIMEOUT_MS = 6000;

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), opts.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(id);
    return r;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// ---------------- adapters ----------------

async function fromOptcgapi(code) {
  // Endpoint: https://optcgapi.com/api/cards/code/OP09-001
  const url = `https://optcgapi.com/api/cards/code/${encodeURIComponent(code)}`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(`optcgapi ${r.status}`);
  const data = await r.json();
  const card = Array.isArray(data) ? data[0] : data?.card || data;
  if (!card || (!card.name && !card.card_name)) throw new Error('optcgapi no card body');
  return normalize({
    code: card.code || card.id || code,
    name: card.name || card.card_name,
    type: card.type || card.card_type,
    color: card.color || card.colors,
    cost: numOrNull(card.cost),
    power: numOrNull(card.power),
    life: numOrNull(card.life),
    counter: numOrNull(card.counter),
    attribute: card.attribute || card.attributes,
    effect: card.effect || card.text,
    setCode: card.set?.code || card.setCode,
    setName: card.set?.name || card.setName,
    releaseDate: card.set?.releaseDate || card.releaseDate,
    rarity: card.rarity,
    imageUrl: card.images?.large || card.images?.small || card.image_url || card.image,
    source: 'optcgapi.com',
  });
}

async function fromApitcg(code) {
  // Endpoint: https://www.apitcg.com/api/one-piece/cards?code=OP09-001
  const url = `https://www.apitcg.com/api/one-piece/cards?code=${encodeURIComponent(code)}`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(`apitcg ${r.status}`);
  const data = await r.json();
  const card = (data?.data && data.data[0]) || (Array.isArray(data) ? data[0] : null);
  if (!card) throw new Error('apitcg no card');
  return normalize({
    code: card.code || code,
    name: card.name,
    type: card.type,
    color: card.color,
    cost: numOrNull(card.cost),
    power: numOrNull(card.power),
    life: numOrNull(card.life),
    counter: numOrNull(card.counter),
    attribute: card.attribute,
    effect: card.effect || card.ability,
    setCode: card.set?.id,
    setName: card.set?.name,
    releaseDate: card.set?.releaseDate,
    rarity: card.rarity,
    imageUrl: card.images?.large || card.images?.small || card.image,
    source: 'apitcg.com',
  });
}

// Language → ordered Bandai host preference (matches op-variants.js).
// Traditional Chinese (tw.) is intentionally excluded — SwibSwap supports
// Simplified Chinese only via onepiece-cardgame.cn + cardpiece.com.
const BANDAI_HOSTS = {
  JP: ['www.onepiece-cardgame.com', 'asia-en.onepiece-cardgame.com', 'en.onepiece-cardgame.com'],
  EN: ['en.onepiece-cardgame.com', 'asia-en.onepiece-cardgame.com', 'www.onepiece-cardgame.com'],
  AE: ['asia-en.onepiece-cardgame.com', 'en.onepiece-cardgame.com', 'www.onepiece-cardgame.com'],
  CN: ['www.onepiece-cardgame.cn', 'asia-en.onepiece-cardgame.com', 'en.onepiece-cardgame.com'],
};

// Direct image URL on Bandai's official card-list site. Picks the hostname
// that matches the user's language (JP→www, EN→en, CN→.cn, AE→asia-en) so
// the SAMPLE image actually shows English/Chinese text for those cards.
async function fromBandaiDirect(code, lang = 'JP') {
  const hosts = BANDAI_HOSTS[String(lang).toUpperCase()] || BANDAI_HOSTS.JP;
  for (const host of hosts) {
    // The CN site uses different image-path conventions than .com sites.
    const pathPatterns = host.endsWith('.cn')
      ? [
          `images/cardlist/${code}.png`,
          `images/cardlist/card/${code}.png`,
          `wp-content/uploads/cardlist/${code}.png`,
          `wp-content/uploads/cardlist/images/${code}.png`,
        ]
      : [
          `images/cardlist/card/${code}.png`,
          `images/cardlist/card/${code}.jpg`,
          `images/cardlist/card/${code}_p1.png`,
          `images/cardlist/card/${code}_p2.png`,
        ];
    for (const path of pathPatterns) {
      const u = `https://${host}/${path}`;
      try {
        const r = await fetchWithTimeout(u, { method: 'GET', timeoutMs: 4000, headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SwibSwap/13.9)',
          Accept: 'image/png,image/*;q=0.9,*/*;q=0.8',
          Range: 'bytes=0-512',
        } });
        const ct = r.headers.get('content-type') || '';
        if ((r.ok || r.status === 206) && ct.startsWith('image/')) {
          return normalize({
            code,
            imageUrl: u,
            source: host.endsWith('.cn') ? 'onepiece-cardgame.cn' : `onepiece-cardgame.com (${host.split('.')[0]})`,
          });
        }
      } catch { /* continue */ }
    }
  }
  return null;
}

function numOrNull(x) {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalize(card) {
  // Drop empty/null keys to keep the payload tight.
  return Object.fromEntries(Object.entries(card).filter(([, v]) => v !== null && v !== undefined && v !== ''));
}

// ---------------- mirroring ----------------
async function mirrorIfNew(remoteUrl, code, rarity) {
  if (!remoteUrl || !rarity) return null;
  const docKey = `${code}__${String(rarity).replace(/[\s/]+/g, '')}`;
  try {
    const bucket = getBucket();
    // Cheap existence check first — skip the download if we already mirrored.
    const file = bucket.file(`verified_cards/${docKey}.jpg`);
    const [exists] = await file.exists();
    if (exists) return `https://storage.googleapis.com/${bucket.name}/verified_cards/${docKey}.jpg`;

    const r = await fetch(remoteUrl);
    if (!r.ok) return null;
    const arrBuf = await r.arrayBuffer();
    const buf = Buffer.from(arrBuf);
    const contentType = r.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const dest = bucket.file(`verified_cards/${docKey}.${ext}`);
    await dest.save(buf, {
      contentType,
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
      resumable: false,
    });
    await dest.makePublic().catch(() => {});
    return `https://storage.googleapis.com/${bucket.name}/verified_cards/${docKey}.${ext}`;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[op-details] mirrorIfNew failed:', e.message);
    return null;
  }
}

// ---------------- handler ----------------

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });
  const { code, rarity, lang } = req.query;
  if (!code) return res.status(400).json({ ok: false, error: 'Missing code' });

  // Try metadata sources in order, then fall back to Bandai's direct image URL.
  // Bandai always works for valid codes — we use it both for image-only fills
  // and to backstop optcgapi/apitcg if their metadata is sparse.
  const errors = [];
  const sources = [
    ['optcgapi', fromOptcgapi],
    ['apitcg', fromApitcg],
  ];

  let metadata = null;
  for (const [name, fn] of sources) {
    try {
      const d = await fn(code);
      if (d && (d.name || d.imageUrl)) { metadata = d; break; }
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }

  // Always attempt a Bandai direct image — even if metadata succeeded, we
  // prefer the Bandai URL for SAMPLE display because it's the canonical source.
  const bandai = await fromBandaiDirect(code, lang).catch(() => null);
  if (bandai && bandai.imageUrl) {
    metadata = { ...(metadata || {}), imageUrl: bandai.imageUrl, source: bandai.source };
  }

  if (!metadata) {
    return res.status(200).json({
      ok: true,
      details: null,
      note: 'No source matched this code. Errors: ' + errors.join('; '),
    });
  }

  // Mirror the SAMPLE image into Firebase Storage when we have a rarity.
  const mirrored = await mirrorIfNew(metadata.imageUrl, code, rarity).catch(() => null);

  return res.status(200).json({
    ok: true,
    details: { ...metadata, sampleImageUrl: mirrored || metadata.imageUrl },
    diagnostics: { sourceErrors: errors, mirroredToFirebase: !!mirrored },
  });
}
