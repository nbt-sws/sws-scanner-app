// /api/visual-match.js — v13.16 (SCN51)
// Two modes:
//
//   MODE A — Single-image verification
//     POST { image, referenceImageUrl? }
//     → Calls Vision API. If referenceImageUrl given, returns whether the
//       user's photo matches it.
//
//   MODE B — Candidate ranking (used by DonVisualLookup)
//     POST { image, candidates: [{ id, imageUrl }, ...], haikuConfirm? }
//     → Calls Vision API once, marks each candidate as matched if its URL
//       appears in fullMatching/partialMatching/visuallySimilar arrays.
//     → Returns candidates re-ranked by matchScore.
//     → SCN51: when haikuConfirm is true, ask Haiku to confirm the top
//       N (default 9) candidates against the user's photo, then override
//       `bestMatch` with Haiku's pick.

const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

function dataUrlBase64(dataUrl) {
  return String(dataUrl || '').replace(/^data:image\/\w+;base64,/, '');
}

export const config = { api: { bodyParser: { sizeLimit: '12mb' } } };

function extractUrls(arr) {
  if (!Array.isArray(arr)) return new Set();
  const out = new Set();
  for (const it of arr) {
    if (typeof it === 'string') out.add(it);
    else if (it?.url) out.add(it.url);
  }
  return out;
}

function scoreCandidate(candidateUrl, fullSet, partialSet, similarSet) {
  if (!candidateUrl) return 0;
  const stripQuery = (u) => String(u || '').split('?')[0];
  const c = stripQuery(candidateUrl);
  if (fullSet.has(candidateUrl)) return 1.0;
  for (const u of fullSet)    if (stripQuery(u) === c) return 1.0;
  for (const u of partialSet) if (stripQuery(u) === c) return 0.9;
  for (const u of similarSet) if (stripQuery(u) === c) return 0.85;
  try {
    const cBase = new URL(candidateUrl).pathname.split('/').pop();
    if (cBase) {
      for (const u of [...fullSet, ...partialSet, ...similarSet]) {
        try {
          const ub = new URL(u).pathname.split('/').pop();
          if (ub && ub === cBase) return 0.7;
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  return 0;
}

// SCN51 — Haiku confirmation pass.
// Given the user photo (base64) + top-N candidates, asks Haiku to pick the
// candidate id that visually matches. Returns { matchId, confidence } or null
// on any failure (no API key, network error, malformed response).
async function haikuConfirmMatch(userPhotoB64, shortlist, req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || shortlist.length === 0) return null;

  // SCN83 — Parallelize the candidate-image fetches. Sequential awaits were
  // blocking 4-5 seconds on a 9-card shortlist; parallel cuts that to ~600ms
  // since most candidates are on Firebase Storage (same host, HTTP/2).
  const protoHost = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
  const fetched = await Promise.all(shortlist.map(async (cand) => {
    try {
      const url = cand.imageUrl.startsWith('http') ? cand.imageUrl : `${protoHost}${cand.imageUrl}`;
      const ir = await fetch(url);
      if (!ir.ok) return null;
      const buf = Buffer.from(await ir.arrayBuffer());
      const mediaType = (ir.headers.get('content-type') || 'image/jpeg').split(';')[0];
      return { id: cand.id, base64: buf.toString('base64'), mediaType };
    } catch { return null; }
  }));
  const imageSources = fetched.filter(Boolean);
  if (imageSources.length === 0) return null;

  const content = [
    { type: 'text', text: 'PHOTO_FROM_USER (the card you must identify):' },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: userPhotoB64 } },
    { type: 'text', text: '\nCANDIDATES — pick the SAME physical card (same character, same set print, same parallel/variant). Reply with the candidate id number that matches, or -1 if none match.' },
  ];
  imageSources.forEach((s, idx) => {
    content.push({ type: 'text', text: `\nCandidate id=${s.id} (position ${idx + 1}):` });
    content.push({ type: 'image', source: { type: 'base64', media_type: s.mediaType, data: s.base64 } });
  });
  content.push({ type: 'text', text: '\nAnswer with JSON only: {"matchId": <id-or-minus-one>, "confidence": <0..1>}' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!r.ok) return null;
    const completion = await r.json();
    const raw = completion?.content?.[0]?.text || '';
    const m = raw.match(/\{[^{}]*"matchId"[^{}]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    if (Number.isInteger(parsed.matchId) && parsed.matchId >= 0) {
      return { matchId: parsed.matchId, confidence: parsed.confidence ?? null };
    }
    return null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[visual-match] haiku confirm failed:', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  const key = process.env.GOOGLE_VISION_API_KEY;
  if (!key) {
    return res.status(200).json({
      ok: true, degraded: true,
      reason: 'GOOGLE_VISION_API_KEY not set on Vercel.',
    });
  }

  const { image, referenceImageUrl, candidates, haikuConfirm, haikuConfirmTopN } = req.body || {};
  if (!image) return res.status(400).json({ ok: false, error: 'Missing image' });
  const b64 = dataUrlBase64(image);
  if (!b64) return res.status(400).json({ ok: false, error: 'Image must be base64 or data-URL' });

  // SCN83 — Vision is now BEST-EFFORT, not required. For DON / CN-anniv card
  // catalogs hosted on Firebase Storage, Google hasn't crawled the URLs, so
  // Vision web-detection returns 0 matches for all candidates. That's fine
  // because Haiku confirm directly compares the user photo against each
  // candidate's image bytes — it doesn't need a Google web index. We still
  // fire Vision (cheap, sometimes finds Bandai-hosted hits), but never abort
  // on Vision failure.
  let visionData = null;
  try {
    const visionResp = await fetch(`${VISION_ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: b64 },
          features: [
            { type: 'WEB_DETECTION', maxResults: 20 },
            { type: 'LABEL_DETECTION', maxResults: 6 },
          ],
        }],
      }),
    });
    if (visionResp.ok) visionData = await visionResp.json();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[visual-match] Vision call failed (continuing):', e.message);
  }

  const resp = visionData?.responses?.[0] || {};
  const web = resp.webDetection || {};
  const labels = (resp.labelAnnotations || []).map((l) => ({ description: l.description, score: l.score }));
  const webEntities = (web.webEntities || []).slice(0, 5).map((e) => ({ description: e.description, score: e.score }));

  const fullSet    = extractUrls(web.fullMatchingImages);
  const partialSet = extractUrls(web.partialMatchingImages);
  const similarSet = extractUrls(web.visuallySimilarImages);

  // MODE B — rank candidates if provided.
  if (Array.isArray(candidates) && candidates.length > 0) {
    const ranked = candidates.map((c) => {
      const matchScore = scoreCandidate(c.imageUrl, fullSet, partialSet, similarSet);
      return { ...c, matchScore, matched: matchScore >= 0.7 };
    }).sort((a, b) => b.matchScore - a.matchScore);
    let best = ranked.find((r) => r.matched) || null;

    // SCN83 — Haiku confirm logic:
    //   * If candidate count is small (≤12), Vision ranking is meaningless
    //     for DB-hosted images. Send ALL candidates to Haiku.
    //   * Otherwise, Haiku confirms within the top-N (default 12) — bumped
    //     from 9 to give Haiku a wider net when Vision can't rank.
    let haikuConfirmation = null;
    if (haikuConfirm) {
      const totalCount = ranked.length;
      const requestedTopN = Math.max(2, Math.min(12, Number(haikuConfirmTopN) || 12));
      const shortlist = totalCount <= 12 ? ranked : ranked.slice(0, requestedTopN);
      haikuConfirmation = await haikuConfirmMatch(b64, shortlist, req);
      if (haikuConfirmation) {
        const picked = shortlist.find((s) => s.id === haikuConfirmation.matchId);
        if (picked) best = { ...picked, matchSource: 'haiku-confirm' };
      }
    }

    return res.status(200).json({
      ok: true,
      degraded: !visionData,
      mode: 'candidate-ranking',
      candidates: ranked, bestMatch: best,
      haikuConfirmation,
      labels, webEntities,
      counts: { full: fullSet.size, partial: partialSet.size, similar: similarSet.size },
    });
  }

  // MODE A — single-URL verification.
  let confident = false;
  let bestMatchUrl = null;
  if (referenceImageUrl) {
    const score = scoreCandidate(referenceImageUrl, fullSet, partialSet, similarSet);
    confident = score >= 0.7;
    bestMatchUrl = confident ? referenceImageUrl : null;
  } else {
    bestMatchUrl = [...fullSet, ...partialSet, ...similarSet][0] || null;
  }

  return res.status(200).json({
    ok: true, degraded: !visionData, mode: 'single-verification',
    confident, bestMatchUrl,
    labels, webEntities,
    counts: { full: fullSet.size, partial: partialSet.size, similar: similarSet.size },
  });
}
