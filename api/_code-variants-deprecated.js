// /api/code-variants.js
// Returns the list of rarities actually printed for a given card code.
// Used by Scanner.EditPanel to restrict the rarity dropdown — e.g. OP07-051
// may only exist as C / SR / SR★, so the dropdown shouldn't offer Leader.
//
// Sources tried in order:
//   1. /verified_cards (community DB) — exact data we've seen ourselves
//   2. optcgapi.com — community API with set listings
//   3. apitcg.com   — secondary
//
// Falls back to the full skill rarity list when nothing matches.

import { getDb } from './_firebase-admin.js';

const TIMEOUT = 6000;

async function fetchWithTimeout(url, ms = TIMEOUT) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    return r;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fromVerified(code) {
  try {
    const snap = await getDb().collection('verified_cards')
      .where('code', '==', code).get();
    if (snap.empty) return [];
    const set = new Set();
    snap.forEach((d) => {
      const r = d.data()?.rarity;
      if (r) set.add(r);
    });
    return Array.from(set);
  } catch {
    return [];
  }
}

async function fromOptcgapi(code) {
  try {
    // optcgapi exposes a list endpoint by id-prefix; try the card-id endpoint
    // and look for an array of variants.
    const r = await fetchWithTimeout(`https://optcgapi.com/api/cards/code/${encodeURIComponent(code)}`);
    if (!r.ok) return [];
    const data = await r.json();
    const arr = Array.isArray(data) ? data : (data?.cards || [data]);
    const set = new Set();
    for (const c of arr) {
      if (c?.rarity) set.add(c.rarity);
    }
    return Array.from(set);
  } catch {
    return [];
  }
}

async function fromApitcg(code) {
  try {
    const r = await fetchWithTimeout(`https://www.apitcg.com/api/one-piece/cards?code=${encodeURIComponent(code)}`);
    if (!r.ok) return [];
    const data = await r.json();
    const arr = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    const set = new Set();
    for (const c of arr) {
      if (c?.rarity) set.add(c.rarity);
    }
    return Array.from(set);
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });
  const { code } = req.query;
  if (!code) return res.status(400).json({ ok: false, error: 'Missing code' });

  // Run all three lookups in parallel — merge results.
  const [verified, optcg, apit] = await Promise.all([
    fromVerified(code), fromOptcgapi(code), fromApitcg(code),
  ]);
  const all = new Set([...verified, ...optcg, ...apit]);
  const rarities = Array.from(all);

  return res.status(200).json({
    ok: true,
    code,
    rarities,
    sources: {
      verified: verified.length,
      optcgapi: optcg.length,
      apitcg: apit.length,
    },
  });
}
