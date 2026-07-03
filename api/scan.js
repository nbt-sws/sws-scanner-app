// /api/scan.js — v13 (skill-driven)
// Pipeline:
//   1. Hash image bytes (SHA-256) → cache lookup
//   2. On miss: pick OP or YGO skill module → preprocess image into
//      full + 4 corner zoom-ins → send all 5 to Claude Haiku with the
//      skill-specific 3-step prompt → parse JSON + apply guardrails
//   3. Persist result + uploader's photo to Firestore/Storage
//
// Skills live at ../skills/{op,ygo}-scan-skill.js and encode the rarity
// ladder from SwibScan_Rarity_Reference_v6.xlsx plus the visual workflow
// from Skill1-OP.png / Skill2-YGO.png.

import { hashImage, perceptualHash, lookupByPHash, getCachedScan, putCachedScan, uploadScanImage } from './_cache.js';
import { verifyUser, getDb } from './_firebase-admin.js';
import { preprocessForScan, imagesToContent } from '../skills/image-preprocess.js';
import * as opSkill from '../skills/op-scan-skill.js';
import * as ygoSkill from '../skills/ygo-scan-skill.js';
import { callVisionWebDetection, extractCardCodeFromTrustedSites } from './_vision.js';
import { identifyDonCard } from '../skills/don-vision-skill.js';
import { extractFromOcr } from '../skills/ocr-extract-skill.js';

const VERIFIED_COLLECTION = 'verified_cards';

// Build the canonical doc key used in /verified_cards.
// Matches the format used by /api/contribute.js so lookups line up.
function makeVerifiedKey(code, rarity) {
  if (!code || !rarity) return null;
  const r = String(rarity).replace(/[\s/]+/g, '');
  return `${code}__${r}`;
}

// Look up a verified card record by code + rarity. Returns null on miss / error.
//
// SCN22: if the rarity-specific key misses, fall back to the catch-all
// `{code}__base` doc that the tools/backfill-samples.mjs script populates
// per language. That doc carries `samples: { JP, EN, CN }` URLs, which we
// project into the legacy `sampleImageUrl` field based on the caller's
// language so the response shape stays the same.
async function lookupVerified(code, rarity, lang = null) {
  const key = makeVerifiedKey(code, rarity);
  try {
    if (key) {
      const snap = await getDb().collection(VERIFIED_COLLECTION).doc(key).get();
      if (snap.exists) return snap.data();
    }
    // Fallback: backfilled base doc with per-language samples.
    if (code) {
      const baseSnap = await getDb().collection(VERIFIED_COLLECTION).doc(`${code}__base`).get();
      if (baseSnap.exists) {
        const data = baseSnap.data() || {};
        const langKey = String(lang || '').toUpperCase();
        const url = (data.samples && (data.samples[langKey] || data.samples.JP || data.samples.EN || data.samples.CN)) || null;
        if (url) {
          return {
            ...data,
            sampleImageUrl: url,
            officialImageUrl: url,
            officialSource: 'bandai-backfill',
            verificationCount: data.verificationCount || 0,
          };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
};

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

// Cache version. Bump this string whenever the identification pipeline changes
// in a way that could produce a different result for the same image. Stale
// entries (missing this version OR with a different version) are treated as
// cache misses, forcing a fresh scan with the new pipeline. Past versions:
//   'v13.4-skills'        — pre-Vision pipeline (Haiku-only)
//   'v14-scn14'           — adds parallel Vision + DON-vision rescue
//   'v14-scn14-novc'      — refuses to cache when Vision errored
//   'v14-scn14-don-tight'  — refuses Haiku-only DON-suspect cache writes
//   'v14-scn14-ocr'        — DON detection uses Vision OCR (TEXT_DETECTION)
//                              as primary signal, corpus matches require
//                              OP-context. Forced re-scan of prior false-
//                              positive Boa Hancock / Kid / Roger entries.
//   'v14-scn15-ocr-first'  — current: OCR-extracted card code is the
//                              PRIMARY identifier, taking precedence over
//                              Haiku's visual guess. DON detection runs
//                              from the same OCR signal, so any DON token
//                              with a readable "ドン!!カード" / "DON!! CARD"
//                              / "咚!!卡" label is identified correctly
//                              regardless of what Haiku claims to see.
//                              Invalidates ALL prior caches so the new
//                              pipeline gets a clean slate.
const CACHE_VERSION = 'v14-scn69-don-poison-jp-cn-fix';

function pickSkill(tcg) {
  if (tcg === 'ygo') return ygoSkill;
  if (tcg === 'op')  return opSkill;
  throw new Error(`Unknown tcg "${tcg}" — expected "op" or "ygo"`);
}

async function callHaiku({ apiKey, prompt, imageBlocks }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI call failed: ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  return text;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  const { image, tcg, lang, force } = req.body || {};
  if (!image || !tcg) {
    return res.status(400).json({ ok: false, error: 'Missing image or tcg' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' });
  }

  let skill;
  try {
    skill = pickSkill(tcg);
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }

  const hash = hashImage(image);
  const user = await verifyUser(req).catch(() => null);

  // 1a. Exact-image cache (skipped when force:true).
  //
  // The cached record may already have been PATCHED by /api/contribute after
  // a user correction — in that case `correctedBy` is set and the card data
  // is the user-corrected version, which is what we want to return. So we
  // simply return whatever's in the cache. The contribute endpoint guarantees
  // it's the most-recent ground truth.
  //
  // Cache versioning (SCN14 fix): a stored entry without `cacheVersion` set
  // to the current CACHE_VERSION constant is treated as a miss. This auto-
  // invalidates previously-cached entries that were written by older
  // pipeline versions (e.g. pre-Vision Haiku-only output that hallucinated
  // a DON-card image as a regular character card). User-corrected entries
  // are exempt — those carry ground truth regardless of pipeline version.
  if (!force) {
    const cached = await getCachedScan(hash);
    const isCurrentVersion = cached?.cacheVersion === CACHE_VERSION;
    const isUserCorrected  = !!cached?.correctedBy;
    if (cached && cached.card && (isCurrentVersion || isUserCorrected)) {
      const verifiedC = await lookupVerified(cached.card.code, cached.card.rarity, cached.lang || lang);
      // If a verified_cards record exists with extra metadata, prefer its
      // name/code/rarity over the cached ones (verified is curated, cached
      // may be stale Haiku output from before a user edit).
      const enrichedCard = verifiedC ? {
        ...cached.card,
        code: verifiedC.code || cached.card.code,
        rarity: verifiedC.rarity || cached.card.rarity,
        nameEn: verifiedC.nameEn || verifiedC.officialName || cached.card.nameEn,
        nameJp: verifiedC.nameJp || cached.card.nameJp,
        type: verifiedC.type || cached.card.type,
        confidence: 99,
      } : cached.card;
      return res.status(200).json({
        ok: true,
        card: enrichedCard,
        cached: true,
        cachedAt: cached.cachedAt,
        wasCorrected: !!cached.correctedBy,
        imageUrl: cached.imageUrl || null,
        hash,
        verified: verifiedC ? {
          sampleImageUrl: verifiedC.sampleImageUrl || null,
          officialImageUrl: verifiedC.officialImageUrl || null,
          officialName: verifiedC.officialName || null,
          officialSetName: verifiedC.officialSetName || null,
          officialReleaseDate: verifiedC.officialReleaseDate || null,
          verificationCount: verifiedC.verificationCount || 0,
        } : null,
        identifiedBy: cached.correctedBy ? 'user-corrected-cache' : 'exact-cache',
        // Surface stored diagnostic fields (added in v14-scn14-don-tight) so
        // cache-hit responses look like fresh-scan responses for the UI.
        crossCheck: cached.crossCheck || null,
        donVision: cached.donVision || null,
        ocrExtract: cached.ocrExtract || null,
        trustSource: cached.trustSource || null,
        identifiedByOnWrite: cached.identifiedByOnWrite || null,
      });
    }
  }

  // 1b. Visual (pHash) lookup — community DB. Skipped when force:true.
  //     This is the Haiku-free fast path that uses contributions from other users.
  const pHash = await perceptualHash(image);
  if (!force && pHash) {
    const visualHit = await lookupByPHash(pHash);
    if (visualHit?.code && visualHit?.rarity) {
      const synthetic = {
        code: visualHit.code,
        rarity: visualHit.rarity,
        nameEn: visualHit.nameEn || null,
        nameJp: visualHit.nameJp || null,
        type: visualHit.type || null,
        promo: !!visualHit.promo,
        lang: visualHit.lang || lang,
        confidence: 95,
        tcg,
      };
      return res.status(200).json({
        ok: true,
        card: synthetic,
        cached: true,
        cachedAt: null,
        imageUrl: null,
        hash, pHash,
        verified: {
          sampleImageUrl: visualHit.sampleImageUrl || null,
          officialImageUrl: visualHit.officialImageUrl || null,
          officialName: visualHit.officialName || null,
          officialSetName: visualHit.officialSetName || null,
          officialReleaseDate: visualHit.officialReleaseDate || null,
          verificationCount: visualHit.verificationCount || 0,
        },
        identifiedBy: 'pHash-community-db',
      });
    }
  }

  // 2. Preprocess: full + 4 corner zoom-ins.
  let imageBlocks;
  let preprocessDiagnostics = null;
  try {
    const prepped = await preprocessForScan(image);
    imageBlocks = imagesToContent(prepped);
    preprocessDiagnostics = prepped.diagnostics || null;
  } catch (e) {
    return res.status(500).json({ ok: false, error: `Image preprocess failed: ${e.message}` });
  }

  // 3. Run Haiku + Vision in PARALLEL (SCN11).
  //
  //   - Haiku: full + 4 corner-zoom multimodal prompt, returns structured
  //            { code, rarity, nameEn/Jp, type } JSON
  //   - Vision: WEB_DETECTION on the raw photo → pagesWithMatchingImages →
  //             filter to trusted One Piece TCG sites → extract card code
  //             from URLs/titles
  //
  // When both agree on the code, we boost confidence and tell the UI.
  // When they disagree, the response carries BOTH codes so the UI can
  // surface the conflict and let the user pick the correct one (Vision
  // is usually right for unambiguous photos; Haiku is usually right for
  // glare-heavy / OCR-style cases where Vision finds no matching pages).
  // Vision call only runs for One Piece — YGO doesn't have a tractable
  // trusted-source catalog with Google-indexed product pages.
  const prompt = skill.buildPrompt({ lang });
  const haikuPromise = (async () => {
    try {
      const text = await callHaiku({ apiKey, prompt, imageBlocks });
      const c = skill.parseHaikuJson(text);
      c.tcg = tcg;
      return { ok: true, card: c };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  })();

  const visionPromise = (tcg === 'op')
    ? (async () => {
        try {
          const v = await callVisionWebDetection({ imageBase64: image, maxResults: 50 });
          if (!v.ok) return { visionOk: false, ok: false, reason: v.reason || v.error };
          const ext = extractCardCodeFromTrustedSites(v.web);
          return {
            visionOk: true,
            ok: ext.ok,
            code: ext.code,
            confidence: ext.confidence,
            evidence: ext.evidence,
            runnerUp: ext.runnerUp || null,
            reason: ext.reason || null,
            _webRaw: v.web,
            _ocrText: v.ocrText || '',     // OCR'd card text — primary DON signal
          };
        } catch (e) {
          return { visionOk: false, ok: false, reason: e.message };
        }
      })()
    : Promise.resolve({ visionOk: false, ok: false, reason: 'Vision only used for One Piece' });

  const [haikuResult, visionResult] = await Promise.all([haikuPromise, visionPromise]);

  // SCN15 resilience: Haiku is no longer required when Vision OCR can read
  // the card. If Haiku failed (e.g. Anthropic API overloaded / transient
  // 5xx) but Vision OCR returned text that contains a card code, we
  // proceed with an empty Haiku shell and let OCR-first identification
  // fill it in. If BOTH signals are unavailable, then we surface the
  // Haiku error since we genuinely have nothing.
  let card;
  let haikuFailed = false;
  if (haikuResult.ok) {
    card = haikuResult.card;
    // SCN60 — user-selected language is authoritative. Haiku occasionally
    // mis-classifies the language from visual cues (e.g. a JP-art EN promo
    // can come back as lang:'CN' if the art has Asian motifs). The user
    // picked the language before scanning, so we trust that.
    if (lang) card.lang = lang;
  } else {
    haikuFailed = true;
    const visionHasOcr = visionResult?.visionOk && visionResult?._ocrText;
    const visionHasCode = visionResult?.ok && visionResult?.code;
    if (!visionHasOcr && !visionHasCode) {
      // No Haiku, no Vision OCR, no Vision code → genuinely no signal.
      return res.status(503).json({
        ok: false,
        error: haikuResult.error,
        hint: 'Both visual and OCR identification are temporarily unavailable. Please retry in a moment.',
      });
    }
    // Empty card shell — OCR-first / Vision cross-check will fill it.
    card = {
      tcg,
      lang: lang || null,    // SCN60 — respect user-selected lang even on Haiku failure
      code: null,
      rarity: null,
      nameEn: null,
      nameJp: null,
      type: null,
      confidence: 0,
      promo: false,
      _haikuFailed: true,
      _haikuError: haikuResult.error,
    };
  }

  // 3a. OCR-FIRST identification (SCN15).
  //
  // The card's own printed text — extracted by Vision DOCUMENT_TEXT_DETECTION
  // — is the most reliable identifier we have. Every One Piece card prints
  // its code (e.g. "OP13-051", "P-066") on the front. Every DON token prints
  // "ドン!!カード" / "DON!! CARD" / "咚!!卡" + "+1000". When we can read that
  // text directly off the photo, it beats Haiku's visual guess every time.
  //
  // Priority order (highest → lowest):
  //   1. OCR-extracted card code   → overrides Haiku, becomes card.code
  //   2. OCR-confirmed DON marker  → forces DON identification path
  //   3. Haiku's visual guess      → fallback when OCR is silent / noisy
  //
  // This is the fix for the recurring "P-066 Boa Hancock" misidentification:
  // Haiku was hallucinating a Character card on every faceless DON token.
  // With OCR-first, the moment Vision reads "DON!! CARD" off the actual
  // photo, we KNOW it's a DON token regardless of what Haiku said.
  let ocrExtract = null;
  if (tcg === 'op' && visionResult.visionOk && visionResult._ocrText) {
    ocrExtract = extractFromOcr(visionResult._ocrText, lang);

    // 3a-i. Confident card code from OCR → override Haiku's code.
    //
    // OCR card codes are gold-standard when they match the printed format
    // exactly. If OCR found OP13-051 / P-066 / ST10-005 etc., trust it
    // unconditionally — Haiku's code (if different) was visual-guess noise.
    if (ocrExtract.cardCode) {
      const haikuHadCode = !!card.code;
      const ocrCode      = ocrExtract.cardCode;
      if (!haikuHadCode || String(card.code).toUpperCase() !== ocrCode.toUpperCase()) {
        card._haikuCode = card.code || null;   // preserve for diagnostics
        card.code       = ocrCode;
        card._identifiedBy = 'ocr-extract';
      }
      // Confidence floor for an OCR-extracted code is 92 — we read it
      // directly off the card. Higher than Haiku's confident-guess cap.
      card.confidence = Math.max(card.confidence || 0, 92);
    }

    // 3a-ii. OCR-confirmed DON marker → force DON path.
    //
    // If we see "ドン!!カード" / "DON!! CARD" / "咚!!卡" in OCR, this IS
    // a DON token. Override any Haiku Character classification immediately;
    // the DON-vision skill (step 3c below) will then enrich it with the
    // character name and variant from the web-detection corpus.
    if (ocrExtract.isDonCard) {
      const looksCharacterClass = String(card.type || '').toLowerCase() === 'character';
      if (looksCharacterClass) {
        card._haikuType = card.type;
        card._haikuName = card.nameEn || card.nameJp || null;
        card.type   = 'Don!!';
        card.rarity = 'DON!!';
        // We blank the name here; don-vision (3c) will fill it from the
        // OP-context web corpus. If it can't, we leave it blank rather
        // than carry over the wrong Haiku name.
        card.nameEn = null;
        card.nameJp = null;
        card._identifiedBy = 'ocr-don-marker';
      }
    }
  }

  // 3b. Cross-check Haiku vs Vision codes.
  //
  // If both produced a code, compare them. Equal → boost confidence.
  // Different → surface both. We DO NOT auto-overwrite Haiku's code with
  // Vision's; the client decides what to do based on the disagreement
  // info we attach to the response.
  let crossCheck = null;
  if (visionResult.ok && visionResult.code) {
    const visionCode = String(visionResult.code).toUpperCase();
    const haikuCode  = String(card.code || '').toUpperCase();
    if (haikuCode && visionCode === haikuCode) {
      crossCheck = {
        agreement: 'agree',
        code: visionCode,
        visionConfidence: visionResult.confidence,
        evidence: visionResult.evidence,
      };
      // Bump our reported confidence — both signals agree.
      card.confidence = Math.min(99, Math.max(card.confidence || 0, 95));
    } else if (haikuCode) {
      crossCheck = {
        agreement: 'disagree',
        haikuCode,
        visionCode,
        visionConfidence: visionResult.confidence,
        evidence: visionResult.evidence,
        runnerUp: visionResult.runnerUp || null,
      };
    } else {
      // Haiku didn't return a code but Vision did — use Vision's.
      crossCheck = {
        agreement: 'vision-only',
        code: visionCode,
        visionConfidence: visionResult.confidence,
        evidence: visionResult.evidence,
      };
      card.code = visionCode;
    }
  } else if (visionResult && !visionResult.ok) {
    crossCheck = { agreement: 'vision-unavailable', reason: visionResult.reason };
  }

  // 3c. DON-card vision rescue (SCN14).
  //
  // Many DON tokens (Doflamingo Gold, Charlotte Linlin, Kalgara, etc.) don't
  // print a visible card code on the front — Haiku frequently returns junk
  // or refuses to commit. Vision WEB_DETECTION on the same image finds the
  // card on Shopee / TCGplayer / optcgapi where the page TITLE literally
  // identifies it. The don-vision-skill mines that signal.
  //
  // We trigger this rescue only when:
  //   - Haiku didn't already identify a clean OP/ST/EB code (so we don't
  //     overwrite a normal-card identification with a DON guess), AND
  //   - Vision's web result actually contains DON-card signals
  // The resulting identification is non-destructive — we attach it as
  // `donVision` and override `card` fields only when confident (≥0.55).
  let donVision = null;
  // DON-vision skill runs whenever Vision returned data, even if
  // extractCardCodeFromTrustedSites couldn't find a code (which it usually
  // can't for DON cards since they don't have OP/ST/EB-prefixed codes —
  // their code is just "P-NNN" or a synthetic name+set).
  if (visionResult.visionOk && visionResult._webRaw) {
    const cardLooksDon = /don!!|don\s*card/i.test(`${card.rarity || ''} ${card.type || ''} ${card.code || ''}`)
                      || ocrExtract?.isDonCard;
    // "Has a non-DON OP code" — i.e. Haiku/OCR identified a regular card
    // with a real OP/ST/EB code that ISN'T a DON synthetic. We don't want
    // to overwrite a regular card with a DON guess.
    const haikuHasNonDonCode = /^(OP|ST|EB|PRB)\d/i.test(String(card.code || ''));
    // SCN81 — SKIP the don-vision rescue entirely when the card already has
    // a real Bandai code AND OCR didn't confirm a DON marker. Real codes
    // are never DON tokens (SCN69 gate blocks the rescue anyway), so calling
    // identifyDonCard() here just burns 3–8 seconds of cold-start latency
    // for no behavior change. Triggers FUNCTION_INVOCATION_TIMEOUT on slow
    // serverless cold starts. Only run the skill when there's a chance it
    // could legitimately fire.
    const skipDonVision = haikuHasNonDonCode && !ocrExtract?.isDonCard;
    donVision = skipDonVision
      ? { isDonCard: false, confidence: 0, reason: 'skipped (real OP code, no OCR DON signal)' }
      : identifyDonCard({ web: visionResult._webRaw, ocrText: visionResult._ocrText });
    // SCN69 — STRICT gate. Real OP/ST/EB/PRB codes are NEVER DON tokens.
    // DON tokens have no printed code. If Haiku+Vision already converged on
    // a real-format code (e.g. EB03-026 Boa Hancock alt-art), block the
    // DON rescue unconditionally — the OCR "DON!!" match was inside the
    // ability text, not a printed DON label.
    //
    // The ONLY exception is when OCR explicitly extracted a DON marker AND
    // the negative-context filter confirmed the card has zero Character /
    // Leader / Event effect keywords. That's now stricter than ocrExtract
    // alone — we require BOTH isDonCard:true AND no char-effect signal.
    const ocrConfirmedDonNoCharText = !!(ocrExtract?.isDonCard
                                       && !(ocrExtract?.signals || []).includes('char-effect-text'));
    const allowDonRescue = !haikuHasNonDonCode || ocrConfirmedDonNoCharText;
    if (donVision.isDonCard && donVision.confidence >= 0.55 && donVision.fullName && allowDonRescue) {
      // Override Haiku's output with the Vision-derived DON identification.
      // The synthetic code format ({Name} Don Card) is what api/prices.js
      // and the DON variant picker (DonVisualLookup) already expect.
      card.code   = donVision.syntheticCode;
      card.nameEn = donVision.fullName;
      card.rarity = donVision.rarity;             // 'DON!! Gold' / 'DON!!' / etc.
      card.type   = 'Don!!';
      card.setCode = donVision.setCode || null;   // 'PRB-01' if Vision found it
      card.confidence = Math.max(card.confidence || 0, Math.round(donVision.confidence * 100));
      // If the card didn't already look like a DON guess BEFORE rescue (per
      // Haiku or OCR), mark identification source as the DON-vision rescue.
      if (!cardLooksDon) {
        card._rescuedBy = 'don-vision';
      }
    }
    // Drop raw payloads before returning — we already mined what we need.
    visionResult._webRaw = undefined;
    visionResult._ocrText = undefined;
  }

  // 4. Cross-reference against the community DB. If a verified_cards record
  //    exists for {code, rarity}, attach the canonical SAMPLE image + official
  //    metadata to the response — this is what powers the "official preview"
  //    panel and the "Verified" badge in the UI.
  const verified = await lookupVerified(card.code, card.rarity, lang);

  // 5. Persist (best-effort).
  //
  // Cache-poisoning guard (SCN14 'novc'): we do NOT cache when Vision was
  // unavailable AND the DON-vision skill didn't rescue. Without Vision,
  // Haiku alone hallucinates plausible-but-wrong names on faceless DON
  // tokens (Eustass Kid, Boa Hancock, etc. for the same image). Caching
  // that pollutes future scans of the same image. Once Vision works, the
  // identification is reliable and gets cached normally.
  //
  // Conditions under which we DO cache:
  //   - Vision agreed with Haiku, OR
  //   - Vision-only identification (Haiku missed, Vision found), OR
  //   - DON-vision rescue fired with confidence ≥ 0.55, OR
  //   - Vision returned unambiguously (not a 403 / unavailable error)
  //
  // If none of those are true, we still RETURN the scan to the user (they
  // can read Haiku's guess) but we skip the cache write so the next scan
  // of the same image tries fresh.
  // Cache-trust ladder. Cache only when at least ONE strong signal agrees
  // with Haiku, OR we're confident Haiku wasn't fooled by a faceless DON
  // token (the most common hallucination case).
  const visionCrossChecked  = !!(crossCheck && (crossCheck.agreement === 'agree' || crossCheck.agreement === 'vision-only'));
  const donRescued          = !!(donVision && donVision.isDonCard && donVision.confidence >= 0.55);
  const haikuLooksConfident = (card.confidence || 0) >= 90;

  // Detect "looks-like-a-DON-but-final-card-says-Character" pattern.
  // Real DON tokens print "ドン!!カード" + +1000 power but no character-name
  // label. Haiku frequently outputs a high-confidence regular-character
  // guess (Boa Hancock / Eustass Kid / etc.) for these. We refuse to cache
  // such results unless DON-vision explicitly cleared them.
  //
  // SCN15: if OCR confirmed this IS a DON card and we DIDN'T rescue, we
  // also refuse to cache — better to re-scan next time than poison the
  // cache with a Haiku Character hallucination.
  const ocrSaysDonButFinalSaysCharacter = !!(
    ocrExtract?.isDonCard &&
    String(card.type || '').toLowerCase() === 'character' &&
    !donRescued
  );
  const looksLikeDonButHaikuSaysCharacter = !!(
    card.promo &&
    String(card.rarity || '').toUpperCase() === 'P' &&
    String(card.type || '').toUpperCase() !== 'DON!!' &&
    String(card.type || '').toUpperCase() !== "DON" &&
    !donRescued
  );
  const refuseCacheBecauseOfDonPoison = ocrSaysDonButFinalSaysCharacter || looksLikeDonButHaikuSaysCharacter;

  // SCN15: an OCR-extracted card code is, by itself, a trustworthy signal —
  // we literally read it off the card. Even if Vision web-detection found
  // no matching pages and Haiku disagreed, the printed code wins.
  const ocrCodeConfirmed = !!(ocrExtract?.cardCode && card.code === ocrExtract.cardCode);

  const trustworthy =
    ocrCodeConfirmed ||
    visionCrossChecked ||
    donRescued ||
    (visionResult.visionOk && haikuLooksConfident && !refuseCacheBecauseOfDonPoison);

  const writes = [];
  if (user?.uid && trustworthy) {
    writes.push(uploadScanImage(hash, image));
    writes.push(putCachedScan(hash, {
      card, tcg, lang, userId: user.uid,
      skillVersion: 'v14-scn15-ocr-first',
      cacheVersion: CACHE_VERSION,
      trustSource: ocrCodeConfirmed ? 'ocr-extract'
                  : donRescued ? 'don-vision'
                  : visionCrossChecked ? 'vision-cross-check'
                  : 'haiku-confident',
      // Persist diagnostic fields so cache hits return the same shape as
      // fresh scans (so client UI can show the cross-check badge / DON
      // rescue evidence even on cached responses).
      crossCheck,
      donVision,
      ocrExtract,                              // OCR signals (code + DON markers)
      identifiedByOnWrite: card._identifiedBy === 'ocr-extract' ? 'ocr-extract'
                          : card._identifiedBy === 'ocr-don-marker' ? 'ocr-don-marker'
                          : card._rescuedBy === 'don-vision' ? 'don-vision'
                          : crossCheck?.agreement === 'agree' ? 'haiku+vision'
                          : crossCheck?.agreement === 'vision-only' ? 'vision'
                          : 'haiku',
    }));
  }
  const settled = await Promise.allSettled(writes);
  const imageUrl = settled[0]?.status === 'fulfilled' ? settled[0].value : null;

  return res.status(200).json({
    ok: true,
    card,
    cached: false,
    imageUrl: imageUrl || null,
    hash, pHash,
    identifiedBy: haikuFailed && card._identifiedBy === 'ocr-extract' ? 'ocr-only'
                : card._identifiedBy === 'ocr-extract' ? 'ocr-extract'
                : card._identifiedBy === 'ocr-don-marker' ? 'ocr-don-marker'
                : card._rescuedBy === 'don-vision' ? 'don-vision'
                : crossCheck?.agreement === 'agree' ? 'haiku+vision'
                : crossCheck?.agreement === 'vision-only' ? 'vision'
                : 'haiku',
    haikuFailed,                             // SCN15 — true when Haiku was unavailable
    crossCheck,                              // SCN11 — null on YGO / Vision unavailable
    donVision,                               // SCN14 — DON-card-specific Vision identification (or null)
    ocrExtract,                              // SCN15 — OCR-extracted code + DON signals
    preprocess: preprocessDiagnostics,
    verified: verified ? {
      sampleImageUrl: verified.sampleImageUrl || null,
      officialImageUrl: verified.officialImageUrl || null,
      officialName: verified.officialName || null,
      officialSetName: verified.officialSetName || null,
      officialReleaseDate: verified.officialReleaseDate || null,
      verificationCount: verified.verificationCount || 0,
      lastVerifiedAt: verified.lastVerifiedAt?.toDate?.()?.toISOString?.() || null,
    } : null,
  });
}
