// src/screens/Scanner.js — v13.3
// Flow:
//   Take photo / Pick → Identify (Haiku) → auto-fetch pricing + OP details +
//   Google Lens link → Score quality → watermarked corners → Save to vault.
// Edit panel uses dropdowns for rarity + language sourced from skill modules.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { T, SZ, fmtMoney, CURRENCIES } from '../theme';
import { Button, Pill, Spinner, ErrorBanner, Card, LoadingCard, SectionLabel } from '../components';
import { uploadCardDataUrl } from '../storage';
import { addVaultItem } from '../vault';
import CameraCapture from '../CameraCapture';
import { OP_RARITIES, YGO_RARITIES } from '../rarities';
import { OP_SETS_BY_LANG, sortedSetsForLang, inferSetFromCode, formatSetForQuery, setGroupLabel } from '../sets';
import DonVisualLookup from './scanner/DonVisualLookup';
import CnAnnivVisualLookup from './scanner/CnAnnivVisualLookup';
import { isGradedTier, rawConditionGuess, pickGradedTwoPerTier, classifyTitleClient,
         convertCurrency, medianTHB, isDonCard, isCnAnnivCard, expandRarityTags,
         compactCondition, buildSummary } from './scanner/helpers';
import ImageLightbox from './scanner/ImageLightbox';
import LanguagePrompt from './scanner/LanguagePrompt';
import WatermarkResult from './scanner/WatermarkResult';
import EditPanel from './scanner/EditPanel';
import QualityResult from './scanner/QualityResult';
import PurchasePriceModal from './scanner/PurchasePriceModal';
import SampleHero from './scanner/SampleHero';
import ScanResult, { ScanActions, CrossCheckBanner } from './scanner/ScanResult';
import VariantPicker, { ConfirmRarityPanel } from './scanner/VariantPicker';
import Sparkline from './scanner/Sparkline';
import TabEmptyState from './scanner/TabEmptyState';
import CurrentValueHero from './scanner/CurrentValueHero';
import TradingHistory from './scanner/TradingHistory';
import CurrencyPills from './scanner/CurrencyPills';
import PricingResult from './scanner/PricingResult';

// ---------------------------------------------------------------
// fetch helpers
// ---------------------------------------------------------------
async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}


// SCN111 — Simple watermark-only image helpers. Two entry points:
//   * watermarkImage(dataUrl) — used by Replace (admin scan-as-sample)
//   * watermarkRemoteUrl(url) — used by Save (Bandai/cardpiece SAMPLE)
// Both: scale to maxDim, composite /logos/SAMPLE_WTM.png at bottom-left
// (25% width, ~90% opacity), JPEG-encode. No deskew, no crop, no expose —
// the variant SAMPLE is already a clean card image, and the user's scan
// should be kept as-is so we don't lose data via aggressive auto-crop.

// Back-compat shim — older callers still reference shrinkDataUrl /
// prepareCardImage; route both to watermarkImage.
async function shrinkDataUrl(dataUrl, maxDim = 1200, quality = 0.88) {
  return watermarkImage(dataUrl, { maxDim, quality, watermark: false });
}
async function prepareCardImage(dataUrl, opts = {}) {
  return watermarkImage(dataUrl, opts);
}

async function watermarkImage(dataUrl, opts = {}) {
  const { maxDim = 1200, quality = 0.88, watermark = true } = opts;
  if (!dataUrl) return dataUrl;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const W = img.width, H = img.height;
        const scale = Math.min(1, maxDim / Math.max(W, H));
        const ow = Math.round(W * scale), oh = Math.round(H * scale);
        const out = document.createElement('canvas');
        out.width = ow; out.height = oh;
        const octx = out.getContext('2d', { willReadFrequently: true });
        octx.drawImage(img, 0, 0, ow, oh);
        if (watermark) {
          try {
            const wm = await loadImage('/logos/SAMPLE_WTM.png');
            const wmW = Math.max(80, Math.round(ow * 0.25));
            const wmH = Math.round(wmW * (wm.height / wm.width));
            const pad = Math.round(ow * 0.025);
            octx.globalAlpha = 0.9;
            octx.drawImage(wm, pad, oh - wmH - pad, wmW, wmH);
            octx.globalAlpha = 1;
          } catch (e) {
            console.warn('[watermarkImage] watermark composite failed:', e?.message);
          }
        }
        console.log('[watermarkImage] done — output', ow + 'x' + oh, watermark ? '(with watermark)' : '(no watermark)');
        resolve(out.toDataURL('image/jpeg', quality));
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

// Fetch a remote URL → blob → dataUrl → watermarkImage. Used by Save so we
// can watermark the official Bandai/cardpiece SAMPLE the user selected from
// the variant grid (instead of watermarking their own scan).
async function watermarkRemoteUrl(url, opts = {}) {
  if (!url) return null;
  try {
    const proxied = url.startsWith('/') ? url : `/api/proxy-image?url=${encodeURIComponent(url)}`;
    const r = await fetch(proxied);
    if (!r.ok) throw new Error('fetch ' + r.status);
    const blob = await r.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    return await watermarkImage(dataUrl, opts);
  } catch (e) {
    console.warn('[watermarkRemoteUrl] failed:', e?.message);
    return null;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    // SCN107 — only set crossOrigin for cross-origin sources. For same-origin
    // (/logos/*, /api/*) the CORS preflight is unnecessary and Vercel doesn't
    // return Access-Control-Allow-Origin on static asset GETs, which makes
    // the Image element reject even though the bytes arrive successfully.
    if (/^https?:\/\//i.test(src)) im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Image load failed: ' + src));
    im.src = src;
  });
}


// SCN110 — Robust background-color detector. Samples a 5%-deep rim around
// the entire image (not just the outermost row) and uses bucketed-histogram
// MODE rather than median. Mode survives the case where >50% of rim pixels
// land on the card body: it picks the dominant cluster (the real background)
// instead of averaging card + background into something useless.
function edgeMedianRGB(px, W, H) {   // kept the name for back-compat
  return edgeModeRGB(px, W, H);
}
function edgeModeRGB(px, W, H) {
  const rim = Math.max(8, Math.floor(Math.min(W, H) * 0.05));
  const buckets = new Map();  // bucket key (32-color quantize) → count + sum
  const step = Math.max(2, Math.floor(rim / 8));   // dense sample within rim
  function add(x, y) {
    const i = (y * W + x) * 4;
    const r = px[i], g = px[i+1], b = px[i+2];
    const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);  // 32^3 buckets
    const cur = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    cur.n += 1; cur.r += r; cur.g += g; cur.b += b;
    buckets.set(key, cur);
  }
  // Top + bottom strips
  for (let y = 0; y < rim; y += step) {
    for (let x = 0; x < W; x += step) add(x, y);
  }
  for (let y = H - rim; y < H; y += step) {
    for (let x = 0; x < W; x += step) add(x, y);
  }
  // Left + right strips
  for (let x = 0; x < rim; x += step) {
    for (let y = rim; y < H - rim; y += step) add(x, y);
  }
  for (let x = W - rim; x < W; x += step) {
    for (let y = rim; y < H - rim; y += step) add(x, y);
  }
  let best = null;
  for (const v of buckets.values()) {
    if (!best || v.n > best.n) best = v;
  }
  if (!best || best.n === 0) return [200, 200, 200];   // fallback near-white
  return [best.r / best.n, best.g / best.n, best.b / best.n];
}

function detectCardBounds(ctx, W, H) {
  const px = ctx.getImageData(0, 0, W, H).data;
  // SCN108 — median of edge-pixel samples → robust background (immune to
  // tightly-cropped photos where corners are ON the card).
  const [r, g, b] = edgeMedianRGB(px, W, H);
  const THRESHOLD = 40;  // SCN107 — lowered from 60 for binder/dark backgrounds
  const STEP = Math.max(2, Math.floor(Math.min(W, H) / 100));
  const isCard = (x, y) => {
    const i = (y * W + x) * 4;
    return Math.abs(px[i]-r) + Math.abs(px[i+1]-g) + Math.abs(px[i+2]-b) > THRESHOLD;
  };
  let left = 0, right = W - 1, top = 0, bottom = H - 1;
  scan: for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y += STEP) if (isCard(x, y)) { left = x; break scan; }
  }
  scan2: for (let x = W-1; x >= 0; x--) {
    for (let y = 0; y < H; y += STEP) if (isCard(x, y)) { right = x; break scan2; }
  }
  scan3: for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x += STEP) if (isCard(x, y)) { top = y; break scan3; }
  }
  scan4: for (let y = H-1; y >= 0; y--) {
    for (let x = 0; x < W; x += STEP) if (isCard(x, y)) { bottom = y; break scan4; }
  }
  const bw = right - left, bh = bottom - top;
  // Sanity: card must fill at least 40% of area, else fall back to centre.
  if (bw * bh < W * H * 0.40 || bw <= 0 || bh <= 0) {
    return { x: 0, y: 0, w: W, h: H };
  }
  return { x: left, y: top, w: bw, h: bh };
}


async function postJson(path, body, idToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const peek = (await res.text()).slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(
      `${path} did not return JSON (got "${contentType || 'no content-type'}"). ` +
      `First bytes: "${peek}". Tip: if you're running "npm start", switch to "vercel dev".`
    );
  }
  const data = await res.json().catch(() => ({ ok: false, error: 'Bad JSON from server' }));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function getJson(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({ ok: false, error: 'Bad JSON' }));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}


// Expand a single rarity acronym into all related display tags. Parallel
// variants (anything ending in ★) emit both the star-acronym AND the base
// AND a "Parallel" pill. Special types like TR / SP / MR also get their
// human-readable label alongside.

// ---------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------
// In-app live camera only works on secure origins (HTTPS or localhost).
// iOS Safari blocks getUserMedia on plain HTTP LAN IPs — when that's the case
// we fall back to a hidden <input capture="environment"> file picker, which
// opens the native iOS camera app (still over HTTP, no HTTPS required).
function canUseLiveCamera() {
  if (typeof window === 'undefined') return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  const { protocol, hostname } = window.location;
  const isSecureContext = protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1';
  return isSecureContext;
}

export default function Scanner({ user, getIdToken, currency, currency2, fx }) {
  const fileRef = useRef(null);
  const cameraInputRef = useRef(null);  // capture="environment" fallback
  // YGO hidden for now — only One Piece in this version.
  const tcg = 'op';
  // SCN21: language is picked per-scan via the LanguagePrompt modal. The
  // last explicit pick is persisted to localStorage so the next scan shows
  // it pre-selected (the modal still always opens — picking the same value
  // is just a 1-tap confirm).
  const [lang, setLangState] = useState(() => {
    try {
      const saved = window.localStorage.getItem('swib_lang');
      if (saved === 'JP' || saved === 'EN' || saved === 'CN' || saved === 'AE') return saved;
    } catch { /* ignore */ }
    return 'JP';
  });
  const [showLangPrompt, setShowLangPrompt] = useState(false);
  const [pendingScanAction, setPendingScanAction] = useState(null);  // 'camera' | 'gallery'

  const setLang = (l) => {
    setLangState(l);
    try { window.localStorage.setItem('swib_lang', l); } catch { /* ignore */ }
  };

  // Language options differ per TCG. OP has Japanese / English / Chinese prints;
  // YGO has Japanese (OCG) and Asian-English (AE) prints.
  const langOptions = tcg === 'ygo' ? ['JP', 'AE'] : ['JP', 'EN', 'CN'];

  // Whenever the TCG changes, make sure the current language is still valid.
  useEffect(() => {
    if (!langOptions.includes(lang)) {
      setLangState(langOptions[0]);
    }
  }, [tcg, lang, langOptions]);

  // SCN21 gate: language prompt fires on EVERY new scan, not just the first.
  // This gives Haiku + Vision a strong, explicit per-scan signal (every scan
  // can be a different language), and replaces the old persistent top
  // language tab. The last-picked language stays pre-selected so the modal
  // is a 1-tap confirm for the common case.
  const startScanFlow = (kind) => {
    setPendingScanAction(kind);
    setShowLangPrompt(true);
  };

  const runScanAction = (kind) => {
    if (kind === 'camera') {
      if (canUseLiveCamera()) setShowCamera(true);
      else cameraInputRef.current?.click();
    } else if (kind === 'gallery') {
      fileRef.current?.click();
    }
  };
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [showCamera, setShowCamera] = useState(false);

  const [scan, setScan] = useState(null);
  const [edits, setEdits] = useState(null);
  const [editing, setEditing] = useState(false);
  const [quality, setQuality] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [opDetails, setOpDetails] = useState(null);
  const [watermark, setWatermark] = useState(null);
  // Lightbox state: { src, zoom } where zoom is the initial zoom level
  // (1 = fit, 3 = 300% for corner crops per SCN6).
  const [zoomImage, setZoomImage] = useState(null);
  const openZoom = (src, zoom = 1) => setZoomImage({ src, zoom });
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);

  // Variant selection: after a successful scan we pull every printed rarity
  // for the code from /api/op-variants and show a picker. The chosen variant
  // overrides Haiku's rarity guess and locks the result before pricing fires.
  const [variants, setVariants] = useState(null);          // array of { rarity, imageUrl, ... }
  const [variantLoading, setVariantLoading] = useState(false);
  const [variantSelected, setVariantSelected] = useState(false);
  // Once the user picks a variant we pin its image + rarity here; nothing
  // downstream is allowed to overwrite these fields until the next scan.
  const [pinnedVariant, setPinnedVariant] = useState(null);

  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [bgLoading, setBgLoading] = useState({ pricing: false, details: false, watermark: false });

  // Purchase-price prompt — gates every Save action.
  const [priceModal, setPriceModal] = useState(null);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseCurrency, setPurchaseCurrency] = useState('THB');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  // SCN18: grade picker for save-to-vault (Raw / PSA10 / BGS10 / BGS10BL / CGC10 / ARS10 / SGC10).
  const [purchaseGrade, setPurchaseGrade] = useState('Raw');

  const finalCard = scan?.card ? { ...scan.card, ...(edits || {}) } : null;

  // -----------------------------------------------------
  const resetAll = () => {
    setScan(null); setEdits(null); setEditing(false);
    setQuality(null); setPricing(null); setOpDetails(null); setWatermark(null);
    setUploadedImageUrl(null); setError(null);
    setVariants(null); setVariantSelected(false); setPinnedVariant(null);
  };

  const onPickFile = async (e) => {
    resetAll();
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setImageDataUrl(dataUrl);
    } catch (err) {
      setError('Could not read image: ' + err.message);
    }
  };

  const onCameraCapture = (dataUrl) => {
    resetAll();
    setImageDataUrl(dataUrl);
    setShowCamera(false);
  };

  // -----------------------------------------------------
  // Scan
  // -----------------------------------------------------
  const runScan = async ({ force = false } = {}) => {
    if (!imageDataUrl) { setError('Pick a photo first'); return; }
    setBusy(force ? 'rescan' : 'scan');
    setError(null);
    try {
      const token = await getIdToken();
      const result = await postJson('/api/scan', { image: imageDataUrl, tcg, lang, force }, token);
      setScan(result);
      setEdits(null);
      setEditing(false);
      setVariants(null);
      setVariantSelected(false);

      // DON cards have a totally different workflow: synthetic "{Name} Don Card"
      // codes, no real card numbers, no op-variants entries. Skip the regular
      // variant picker entirely — DonVisualLookup is the picker for DONs.
      const isDon = isDonCard(result?.card);

      if (isDon) {
        // Variant grid is the DON catalog (handled by DonVisualLookup),
        // so mark variantSelected and let pricing fire immediately with
        // Haiku's initial values. The user refines via the DON catalog.
        setVariantSelected(true);
        enrichAfterScan(result.card);
      } else if (tcg === 'op' && result?.card?.code) {
        // Non-DON OP card with a code → regular variant picker.
        loadVariants(result.card.code);
      } else {
        // YGO or no-code: skip the picker, go straight to enrichment.
        setVariantSelected(true);
        enrichAfterScan(result.card);
      }
    } catch (err) {
      setError('Scan failed: ' + err.message);
    } finally {
      setBusy(null);
    }
  };

  const loadVariants = async (code, langOverride = null) => {
    setVariantLoading(true);
    try {
      // SCN76 — accept lang override so EditPanel saves with a new lang
      // immediately re-probe with the right Bandai host (don't wait for
      // the outer lang state to sync via React).
      const qs = new URLSearchParams();
      qs.set('code', code);
      qs.set('lang', langOverride || lang);
      if (scan?.card?.nameEn) qs.set('name', scan.card.nameEn);
      const data = await getJson(`/api/op-variants?${qs.toString()}`);
      setVariants(data.variants || []);
      if (data.cardpieceTried) {
        // eslint-disable-next-line no-console
        console.log('[cardpiece]', data.cardpieceTried);
      }
    } catch {
      setVariants([]);
    } finally {
      setVariantLoading(false);
    }
  };

  // User picks a variant from the grid — locks the rarity and the SAMPLE
  // image. Both go into `pinnedVariant` which downstream rendering treats
  // as the source of truth (op-details refresh + verified_cards enrichment
  // can NOT overwrite it).
  const chooseVariant = (variant) => {
    if (!scan?.card) return;
    // If variant has no rarity (Bandai-only entry), keep Haiku's guess.
    const pickedRarity = variant.rarity || scan.card.rarity;
    setPinnedVariant({
      rarity: pickedRarity,
      imageUrl: variant.imageUrl,
      source: variant.source,
    });
    setEdits({ ...(edits || {}), rarity: pickedRarity });
    setVariantSelected(true);
    enrichAfterScan({ ...scan.card, rarity: pickedRarity });
  };

  const enrichAfterScan = async (card) => {
    // 1. Pricing — v14 (SCN2): vision-first when we have a SAMPLE image.
    //   Server orchestrates: SAMPLE imageUrl → Google Vision web-detection →
    //   eBay item IDs → hydrate via Browse API. Keyword fallback identical
    //   to v13 if no SAMPLE or Vision returns nothing.
    if (card) {
      setBgLoading((b) => ({ ...b, pricing: true }));
      const qs = new URLSearchParams();
      if (card.code)    qs.set('code', card.code);
      if (card.nameEn)  qs.set('nameEn', card.nameEn);
      if (card.nameJp)  qs.set('nameJp', card.nameJp);
      if (card.rarity)  qs.set('rarity', card.rarity);
      if (card.type)    qs.set('cardType', card.type);
      qs.set('lang', lang);
      // Set name lookup for the query — use the picked setCode if any,
      // else infer from card code.
      const inferredSet = inferSetFromCode(card.code, lang);
      const setEntry = card.setCode
        ? (OP_SETS_BY_LANG[lang] || OP_SETS_BY_LANG.JP).find((s) => s.code === card.setCode)
        : inferredSet;
      if (setEntry) qs.set('set', formatSetForQuery(setEntry));
      // SCN2: send the SAMPLE image URL so server can reverse-image-search
      // eBay for the EXACT card. Priority: pinned variant pick > verified
      // mirror > op-details fetched URL. Skip if none — we just fall back
      // to keyword search.
      const sampleUrl =
        pinnedVariant?.imageUrl ||
        scan?.matchedRecord?.sampleImageUrl ||
        opDetails?.sampleImageUrl ||
        opDetails?.imageUrl ||
        null;
      if (sampleUrl) qs.set('sampleImageUrl', sampleUrl);
      getJson(`/api/prices?${qs.toString()}`)
        .then((data) => setPricing(data))
        .catch(() => setPricing(null))
        .finally(() => setBgLoading((b) => ({ ...b, pricing: false })));
    }
    // 2. Free OP card DB (OP only) — passes rarity so the server mirrors SAMPLE
    //    into verified_cards/{code}__{rarity}.* the first time. Also passes
    //    language so Bandai serves the right-language SAMPLE image.
    if (tcg === 'op' && card?.code) {
      setBgLoading((b) => ({ ...b, details: true }));
      const qs = new URLSearchParams();
      qs.set('code', card.code);
      qs.set('lang', lang);
      if (card.rarity) qs.set('rarity', card.rarity);
      getJson(`/api/op-details?${qs.toString()}`)
        .then((data) => setOpDetails(data?.details || null))
        .catch(() => setOpDetails(null))
        .finally(() => setBgLoading((b) => ({ ...b, details: false })));
    }
    // 3. Upload original to Storage in the background → use the URL for Google Lens.
    if (user?.uid && imageDataUrl) {
      uploadCardDataUrl(user.uid, imageDataUrl)
        .then((up) => setUploadedImageUrl(up.url))
        .catch(() => { /* photo upload optional */ });
    }
  };

  // -----------------------------------------------------
  // Contribute to community DB
  // -----------------------------------------------------
  const [contributing, setContributing] = useState(false);
  const [contributed, setContributed] = useState(false);
  // No price prompt — community contribution is purely about storing the
  // verified SAMPLE image + metadata. Pricing only matters for the Vault.
  const contribute = async () => {
    if (!finalCard?.code || !finalCard?.rarity) {
      setError('Need both code and rarity before saving to the community DB');
      return;
    }
    setContributing(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Sign-in required');
      // SCN111 — Save watermarks the OFFICIAL SAMPLE (variant tile the user
      // selected) — NOT the user's scan. Server stores the watermarked
      // official card as the verified record.
      const variantSampleUrl = pinnedVariant?.imageUrl || opDetails?.imageUrl || null;
      const __watermarked = variantSampleUrl
        ? await watermarkRemoteUrl(variantSampleUrl)
        : null;
      const result = await postJson('/api/contribute', {
        card: finalCard, tcg, lang,
        image: __watermarked,
        sampleImageUrl: variantSampleUrl,
        scanHash: scan?.hash || null,
      }, token);
      setContributed(true);
      // SCN106 — refresh OFFICIAL SAMPLE to the newly-uploaded watermarked
      // image. The Firebase URL stays the same path so we add a timestamp
      // cache-buster so the <img> actually re-fetches.
      const freshUrl = result?.record?.watermarkedSampleUrl
                     || result?.record?.sampleImageUrl
                     || null;
      if (freshUrl) {
        setOpDetails((prev) => ({ ...(prev || {}), sampleImageUrl: freshUrl }));
        setPinnedVariant({
          rarity: finalCard.rarity,
          imageUrl: freshUrl,
          source: 'SwibSwap community (saved)',
          bust: Date.now(),
        });
      }
    } catch (err) {
      setError('Could not save to community DB: ' + err.message);
    } finally {
      setContributing(false);
    }
  };
  // SCN60 — Upload user's photo as the SAMPLE when none exists yet.
  // Crops + watermarks server-side; future scans pick it up via DB-first.
  const [contributingSample, setContributingSample] = useState(false);
  const [contributedSample,  setContributedSample]  = useState(false);
  const contributeSample = async () => {
    if (!imageDataUrl) {
      setError('No photo to contribute — take or pick one first');
      return;
    }
    if (!finalCard?.code || !finalCard?.rarity) {
      setError('Need both code and rarity before contributing a SAMPLE');
      return;
    }
    setContributingSample(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Sign-in required');
      // SCN111 — Replace watermarks the USER'S SCAN as-is (no auto-crop,
      // no deskew — those were producing wrong outputs). Just add the
      // SAMPLE_WTM.png watermark and store.
      const __watermarked = await watermarkImage(imageDataUrl);
      const result = await postJson('/api/contribute-sample', {
        image: __watermarked,
        code:   finalCard.code,
        rarity: finalCard.rarity,
        lang:   lang || finalCard.lang || 'JP',
        nameEn: finalCard.nameEn || null,
        nameJp: finalCard.nameJp || null,
        // SCN75 — propagate scan hash + metadata so /scans cache learns the correction
        scanHash: scan?.hash || null,
        tcg:     tcg || 'op',
        type:    finalCard.type || null,
        promo:   !!finalCard.promo,
      }, token);
      setContributedSample(true);
      // Pin the contributed sample so SampleHero re-renders with the watermark.
      if (result?.sampleImageUrl) {
        setPinnedVariant({
          rarity: finalCard.rarity,
          imageUrl: result.sampleImageUrl,
          source: 'SwibSwap community (user contribution)',
        });
      }
    } catch (err) {
      setError('Could not contribute SAMPLE: ' + err.message);
    } finally {
      setContributingSample(false);
    }
  };
  useEffect(() => { setContributedSample(false); }, [scan?.hash]);

  // SCN62 — Admin check + REPLACE SAMPLE flow. Admin allowlist lives in
  // process.env.ADMIN_EMAILS server-side; /api/whoami exposes the flag.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!user?.uid) { setIsAdmin(false); return; }
        const token = await getIdToken();
        if (!token) return;
        const r = await fetch('/api/whoami', { headers: { Authorization: 'Bearer ' + token } });
        const d = await r.json();
        if (!cancelled) setIsAdmin(!!d?.isAdmin);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [user?.uid]);

  const [replacingSample, setReplacingSample] = useState(false);
  const [replacedSample,  setReplacedSample]  = useState(false);
  const replaceSampleWithScan = async () => {
    if (!imageDataUrl)       { setError('No scan image to use'); return; }
    if (!finalCard?.code)    { setError('Need a code first'); return; }
    if (!finalCard?.rarity)  { setError('Need a rarity first'); return; }
    setReplacingSample(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Sign-in required');
      // SCN92 — shrink image to dodge Vercel's 4.5MB body cap.
      const __watermarked = await watermarkImage(imageDataUrl);
      const result = await postJson('/api/contribute-sample', {
        image: __watermarked,
        code:   finalCard.code,
        rarity: finalCard.rarity,
        lang:   lang || finalCard.lang || 'JP',
        nameEn: finalCard.nameEn || null,
        nameJp: finalCard.nameJp || null,
        replaceExisting: true,
        // SCN75 — patch /scans so the next scan of the same image hash
        // returns the admin-corrected rarity instead of the stale guess.
        scanHash: scan?.hash || null,
        tcg:     tcg || 'op',
        type:    finalCard.type || null,
        promo:   !!finalCard.promo,
      }, token);
      setReplacedSample(true);
      if (result?.sampleImageUrl) {
        // SCN106 — timestamp bust so SampleHero refetches the new image.
        setPinnedVariant({
          rarity: finalCard.rarity,
          imageUrl: result.sampleImageUrl,
          source: 'SwibSwap community (admin replace)',
          bust: Date.now(),
        });
      }
    } catch (err) {
      setError('Replace failed: ' + err.message);
    } finally {
      setReplacingSample(false);
    }
  };
  useEffect(() => { setReplacedSample(false); }, [scan?.hash]);

  // Reset the "contributed" flag whenever the card or edits change.
  useEffect(() => { setContributed(false); }, [scan?.hash, edits]);

  // Re-fire all background enrichments. Optionally takes a fresh card so
  // callers that just updated edits don't get hit by React state batching.
  const reEnrich = (cardOverride = null) => {
    const card = cardOverride || finalCard;
    if (!card) return;
    enrichAfterScan(card);
  };

  // -----------------------------------------------------
  // Quality
  // -----------------------------------------------------
  const runQuality = async () => {
    if (!imageDataUrl) { setError('Pick a photo first'); return; }
    setBusy('quality');
    setError(null);
    try {
      const token = await getIdToken();
      const result = await postJson('/api/quality', { image: imageDataUrl, tcg }, token);
      setQuality(result);
    } catch (err) {
      setError('Quality scoring failed: ' + err.message);
    } finally {
      setBusy(null);
    }
  };

  // -----------------------------------------------------
  // Scan-time PREVIEW crops (SCN13)
  // -----------------------------------------------------
  // Produces auto-exposed full card + 4 corner crops WITHOUT any watermark
  // overlay — the user gets clean intermediates they can inspect at 200%
  // zoom for grading detail. The actual watermark stamp gets applied later
  // when the card is saved to the Vault (see askPriceThenVault flow).
  useEffect(() => {
    if (!imageDataUrl || !finalCard) return undefined;
    let cancelled = false;
    (async () => {
      setBgLoading((b) => ({ ...b, watermark: true }));
      try {
        const data = await postJson('/api/watermark', {
          image: imageDataUrl,
          mode: 'preview',           // no overlay — clean exposure-enhanced crops
        });
        if (!cancelled) setWatermark(data);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Preview crop generation failed:', err.message);
      } finally {
        if (!cancelled) setBgLoading((b) => ({ ...b, watermark: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [imageDataUrl, scan?.hash, edits, quality?.hash, user]);  // re-runs whenever inputs change

  // -----------------------------------------------------
  // Save to vault (called after price modal collects Paid + currency)
  // -----------------------------------------------------
  const askPriceThenVault    = () => {
    setPurchasePrice('');
    setPurchaseCurrency(currency || 'THB');
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPurchaseGrade('Raw');
    setPriceModal({ action: 'vault' });
  };
  const askPriceThenContrib  = () => {
    setPurchasePrice('');
    setPurchaseCurrency(currency || 'THB');
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPurchaseGrade('Raw');
    setPriceModal({ action: 'community' });
  };

  const handlePriceConfirm = async () => {
    const action = priceModal?.action;
    setPriceModal(null);
    const paid = parseFloat(purchasePrice) || 0;
    if (action === 'vault') {
      await saveToVault({ paid, paidCurrency: purchaseCurrency, purchaseDate, grade: purchaseGrade });
    } else if (action === 'community') {
      await contribute({ paid, paidCurrency: purchaseCurrency });
    }
  };

  const saveToVault = async ({ paid = 0, paidCurrency = 'THB', purchaseDate: pDate, grade = 'Raw' } = {}) => {
    if (!finalCard || !user?.uid) return;
    setBusy('save');
    setError(null);
    try {
      let photoUrl = uploadedImageUrl;
      if (!photoUrl) {
        try {
          const up = await uploadCardDataUrl(user.uid, imageDataUrl);
          photoUrl = up.url;
        } catch (e) { /* eslint-disable-next-line no-console */ console.warn(e.message); }
      }
      // Normalize the user-entered paid amount into THB (vault's base currency).
      const paidTHB = paid
        ? Math.round(convertCurrency(paid, paidCurrency, 'THB', fx))
        : 0;
      // Log to SwibSwap Market — purchase event keyed by code+rarity. Non-fatal.
      if (paid > 0 && finalCard?.code && finalCard?.rarity) {
        try {
          const token = await getIdToken();
          await postJson('/api/transactions', {
            code: finalCard.code, rarity: finalCard.rarity, lang, tcg,
            kind: 'purchase', amount: paid, currency: paidCurrency,
          }, token);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('Transaction log failed:', e.message);
        }
      }
      // SCN13: watermark is applied HERE, at vault save time, not during
      // scan. The user's clean photo gets the bottom-margin metadata stamp
      // (`User – Date – Time – SwibSwap`) baked in before being committed
      // to Firebase Storage. This is the canonical "vault scan" image —
      // future audits / dispute resolution use this as proof.
      let vaultPhotoUrl = photoUrl;
      try {
        const stamped = await postJson('/api/watermark', {
          image: imageDataUrl,
          userId: user?.displayName || user?.email || user?.uid || 'guest',
          date: pDate || new Date().toISOString().slice(0, 10),
          mode: 'vault',
        });
        if (stamped?.full) {
          const up = await uploadCardDataUrl(user.uid, stamped.full);
          if (up?.url) vaultPhotoUrl = up.url;
        }
      } catch (err) {
        // Non-fatal — fall back to the un-stamped photoUrl we already have.
        // eslint-disable-next-line no-console
        console.warn('Vault watermark stamp failed; using bare photo:', err.message);
      }

      // SCN18: user-selected grade takes precedence. Falls back to the auto-
      // detected condition from the quality scan only when user picked 'Raw'.
      const finalCondition = (grade && grade !== 'Raw')
        ? grade
        : (compactCondition(quality) || 'Raw');
      await addVaultItem(user.uid, {
        ...finalCard,
        photoUrl: vaultPhotoUrl,
        condition: finalCondition,
        gradedByUser: grade && grade !== 'Raw',   // distinguishes user-set grade from auto-detected
        paid: paidTHB,
        paidOriginal: { amount: paid, currency: paidCurrency },
        // 30-day rolling median from /api/prices is the Vault Value baseline.
        // The Vault tab refreshes this daily.
        current: medianTHB(pricing, fx) || 0,
        vaultValue: medianTHB(pricing, fx) || 0,
        purchaseDate: pDate || new Date().toISOString().slice(0, 10),
        scanHash: scan.hash,
        qualityGrade: quality?.quality?.grade || null,
        opDetailsImageUrl: opDetails?.imageUrl || null,
      });
      setImageDataUrl(null);
      resetAll();
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError('Save failed: ' + err.message);
    } finally {
      setBusy(null);
    }
  };

  // -----------------------------------------------------
  // Render
  // -----------------------------------------------------
  return (
    <div style={{ padding: '20px 16px 100px', maxWidth: 540, margin: '0 auto' }}>
      <h2 style={{
        fontSize: SZ.xl, fontWeight: 700, margin: '8px 0 22px',
        fontFamily: T.fontDisplay, letterSpacing: '0.06em',
      }}>SCAN A CARD</h2>

      <ErrorBanner message={error} />

      {/* SCN21: Top language picker removed — language is now chosen
          per-scan in the LanguagePrompt modal that fires the moment the
          user picks/takes a photo. The last-picked language still
          persists via localStorage so returning users see their default
          pre-selected in the modal. */}

      <div style={{
        background: T.surface,
        border: `1px dashed ${imageDataUrl ? T.border : T.border2}`,
        borderRadius: 14,
        padding: imageDataUrl ? 8 : 32,
        textAlign: 'center', marginBottom: 14,
      }}>
        {imageDataUrl ? (
          <img src={imageDataUrl} alt="card preview" style={{ width: '100%', borderRadius: 10, display: 'block' }} />
        ) : (
          <div style={{ color: T.textLow, fontSize: SZ.md, padding: '20px 0', fontWeight: 500 }}>
            Take a new photo or pick one from your library.
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <Button
          onClick={() => startScanFlow('camera')}
          disabled={busy !== null}
        >
          Take photo
        </Button>
        <Button variant="outline" onClick={() => startScanFlow('gallery')} disabled={busy !== null}>
          Pick from gallery
        </Button>
      </div>
      {/* Hidden inputs — gallery picker and native-camera fallback */}
      <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: 'none' }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={onPickFile} style={{ display: 'none' }} />
      {!canUseLiveCamera() && (
        <div style={{ fontSize: SZ.xs, color: T.textDim, marginTop: -4, marginBottom: 14, textAlign: 'center' }}>
          Tip: in-app camera with auto-capture needs HTTPS. On Safari over LAN, &quot;Take photo&quot; opens iOS&apos;s native camera instead.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        <Button variant="accent" onClick={() => runScan()} disabled={!imageDataUrl || busy !== null}>
          {busy === 'scan' ? <Spinner size={16} color={T.bgDeep} /> : 'Identify card'}
        </Button>
        <Button variant="outline" onClick={runQuality} disabled={!imageDataUrl || busy !== null}>
          {busy === 'quality' ? <Spinner size={16} /> : 'Score quality'}
        </Button>
      </div>

      {scan?.card && (
        <>
          <ScanResult
            result={scan} edits={edits}
            onRescan={() => runScan({ force: true })}
            onEdit={() => setEditing(true)}
            busyRescan={busy === 'rescan'}
            anyBusy={busy !== null}
            onAcceptVisionCode={(visionCode) => {
              // SCN11 — user accepted the Vision-search code over Haiku's.
              // Patch the edits + re-run downstream enrichments so pricing,
              // op-details, and variant picker all switch to the new code.
              const mergedEdits = { ...(edits || {}), code: visionCode };
              const mergedCard  = { ...scan.card, ...mergedEdits };
              setEdits(mergedEdits);
              reEnrich(mergedCard);
            }}
          />
          {/* DON cards: DonVisualLookup is the ONLY picker. Shows immediately
              under the scan result, replaces VariantPicker and ConfirmRarityPanel. */}
          {isDonCard(finalCard) && (
            <DonVisualLookup
              card={finalCard}
              imageDataUrl={imageDataUrl}
              donVision={scan?.donVision || null}
              onPick={(don) => {
                const mergedEdits = {
                  ...(edits || {}),
                  code: don.synthCode,
                  nameEn: don.name,
                  rarity: don.rarity,
                  type: 'DON!!',
                  setCode: don.setHint || (edits?.setCode),
                };
                const mergedCard = { ...scan.card, ...mergedEdits };
                setEdits(mergedEdits);
                setPinnedVariant({
                  rarity: don.rarity,
                  imageUrl: don.imageUrl,
                  source: 'Bandai DON!! Card List (PDF)',
                });
                reEnrich(mergedCard);
              }}
            />
          )}

          {/* SCN58 — CN Anniversary cards: visual picker against the 33-card
              local catalog. Like DON, this replaces VariantPicker and
              ConfirmRarityPanel for CN-1ANV / CN-2ANV / CN-3ANV scans. */}
          {!isDonCard(finalCard) && isCnAnnivCard(finalCard) && (
            <CnAnnivVisualLookup
              card={finalCard}
              imageDataUrl={imageDataUrl}
              onPick={(item) => {
                const mergedEdits = {
                  ...(edits || {}),
                  code: item.synthCode,
                  nameEn: item.name,
                  rarity: item.rarity || 'Anniversary Promo',
                  setCode: item.setCode || item.setHint || (edits?.setCode),
                  lang: 'CN',
                };
                const mergedCard = { ...scan.card, ...mergedEdits };
                setEdits(mergedEdits);
                setPinnedVariant({
                  rarity: item.rarity || 'Anniversary Promo',
                  imageUrl: item.imageUrl,
                  source: 'Bandai CN Anniversary List (PDF)',
                });
                reEnrich(mergedCard);
              }}
            />
          )}

          {/* Regular variant picker — non-DON, non-CN-anniv OP cards only */}
          {!isDonCard(finalCard) && !isCnAnnivCard(finalCard) && tcg === 'op' && !variantSelected && (variants !== null || variantLoading) && (
            <VariantPicker
              loading={variantLoading}
              variants={variants}
              onPick={chooseVariant}
              currentRarity={finalCard?.rarity}
            />
          )}

          {/* Confirm Rarity step — non-DON, non-CN-anniv. Both pickers
              already pin the rarity at pick-time so this is redundant. */}
          {!isDonCard(finalCard) && !isCnAnnivCard(finalCard) && tcg === 'op' && variantSelected && pinnedVariant && (
            <ConfirmRarityPanel
              currentRarity={finalCard?.rarity}
              onConfirm={(newRarity) => {
                if (newRarity && newRarity !== finalCard?.rarity) {
                  const mergedEdits = { ...(edits || {}), rarity: newRarity };
                  const mergedCard = { ...scan.card, ...mergedEdits };
                  setEdits(mergedEdits);
                  setPinnedVariant({ ...pinnedVariant, rarity: newRarity });
                  reEnrich(mergedCard);
                } else if (newRarity) {
                  reEnrich();
                }
              }}
            />
          )}

          {/* SCN64 + SCN88 — Re-scan / Edit Fields sit AFTER the variant picker;
              EditPanel renders directly below ScanActions when editing=true.
              Picker = primary; ScanActions + EditPanel = fallback. */}
          <ScanActions
            onRescan={() => runScan({ force: true })}
            onEdit={() => setEditing(true)}
            busyRescan={busy === 'rescan'}
            anyBusy={busy !== null}
          />

          {editing && (
            <EditPanel
              tcg={tcg}
              card={{ ...scan.card, ...(edits || {}) }}
              onCancel={() => setEditing(false)}
              onSave={(patch) => {
                // SCN80 — Always refresh variants on Apply for non-DON OP
                // scans. The previous conditional (code/lang/setCode change)
                // misfired on edge cases (e.g. user edits code in EditPanel
                // but the diff comparison sees the same value due to a state-
                // sync race). One extra API call is cheap; guaranteeing the
                // grid reflects the user's latest edits is the goal.
                const mergedEdits = { ...(edits || {}), ...patch };
                const mergedCard = { ...scan.card, ...mergedEdits };
                setEdits(mergedEdits);
                setEditing(false);
                if (tcg === 'op' && !isDonCard(mergedCard) && mergedCard.code) {
                  setVariantSelected(false);
                  setPinnedVariant(null);
                  setVariants(null);
                  // Pass mergedCard.lang as override — outer `lang` state
                  // doesn't update from edits.
                  loadVariants(mergedCard.code, mergedCard.lang || lang);
                }
                reEnrich(mergedCard);
              }}
            />
          )}

          {/* SCN77 — OFFICIAL SAMPLE only shows once we have a real pick:
              (a) the user tapped a variant tile (variantSelected + pinnedVariant),
              (b) the DON picker auto-pinned (DON cards),
              (c) the CN-anniv picker auto-pinned (CN-1ANV/2ANV/3ANV cards),
              (d) the user contributed/replaced a SAMPLE this scan.
              Before that, showing whatever the verified-lookup happened to
              return is misleading. */}
          {(variantSelected || isDonCard(finalCard) || isCnAnnivCard(finalCard)
            || contributedSample || replacedSample) && (
          <SampleHero
            verified={scan.verified}
            details={opDetails}
            pinned={pinnedVariant}
            loading={bgLoading.details}
            tcg={tcg}
            card={finalCard}
            lang={lang}
            onContribute={contribute}
            contributing={contributing}
            contributed={contributed}
            // SCN60 — contribute-sample (user photo as SAMPLE).
            onContributeSample={contributeSample}
            contributingSample={contributingSample}
            contributedSample={contributedSample}
            imageDataUrl={imageDataUrl}
            // SCN62 — admin-only REPLACE SAMPLE (overwrites existing).
            isAdmin={isAdmin}
            onReplaceSample={replaceSampleWithScan}
            replacingSample={replacingSample}
            replacedSample={replacedSample}
            signedIn={!!user?.uid}
            edits={edits}
          />
          )}
        </>
      )}

      {quality?.quality && <QualityResult quality={quality} />}

      {(pricing || bgLoading.pricing) && (
        <PricingResult
          pricing={pricing}
          loading={bgLoading.pricing}
          currency={currency}
          fx={fx}
          card={finalCard}
        />
      )}

      {/* OpDetailsResult is now subsumed by <SampleHero/> rendered above. */}

      {(watermark || bgLoading.watermark) && (
        <WatermarkResult watermark={watermark} loading={bgLoading.watermark} onZoom={openZoom} />
      )}

      {scan?.card && user?.uid && (
        <div style={{ marginTop: 20 }}>
          <Button onClick={askPriceThenVault} disabled={busy !== null} size="lg">
            {busy === 'save' ? <Spinner size={16} color={T.bgDeep} /> : 'Save to SwibsVault'}
          </Button>
        </div>
      )}

      {showCamera && <CameraCapture onCapture={onCameraCapture} onCancel={() => setShowCamera(false)} />}
      {showLangPrompt && (
        <LanguagePrompt
          current={lang}
          options={langOptions}
          onPick={(l) => {
            setLang(l);
            setShowLangPrompt(false);
            const pending = pendingScanAction;
            setPendingScanAction(null);
            if (pending) runScanAction(pending);
          }}
          onCancel={() => { setShowLangPrompt(false); setPendingScanAction(null); }}
        />
      )}
      {zoomImage && (
        <ImageLightbox
          src={zoomImage.src}
          initialZoom={zoomImage.zoom || 1}
          onClose={() => setZoomImage(null)}
        />
      )}
      {priceModal && (
        <PurchasePriceModal
          action={priceModal.action}
          price={purchasePrice}
          setPrice={setPurchasePrice}
          currencyVal={purchaseCurrency}
          setCurrencyVal={setPurchaseCurrency}
          dateVal={purchaseDate}
          setDateVal={setPurchaseDate}
          gradeVal={purchaseGrade}
          setGradeVal={setPurchaseGrade}
          medianTHB={medianTHB(pricing, fx)}
          currency={currency}
          fx={fx}
          onConfirm={handlePriceConfirm}
          onCancel={() => setPriceModal(null)}
        />
      )}
    </div>
  );
}


// ===============================================================
// ScanResult — with prominent Re-scan / Edit buttons + Google Lens link
// ===============================================================

// SCN64 — Re-scan / Edit Fields row. Lives between the variant picker and
// the SAMPLE hero so the user's primary action (pick the matching variant
// from the watermarked DB grid) is the most prominent step.

// SCN11 — Haiku + Vision cross-check banner.
// Renders just below the scan result header. Three flavors:
//   - agree:        small green pill, no action
//   - vision-only:  small cyan pill, no action (Vision found a code Haiku didn't)
//   - disagree:     yellow banner with both codes + an "Use Vision's code" button
//   - vision-unavailable / null: hidden

// ===============================================================
// EditPanel — dropdown for rarity (from skill), dropdown for language
// ===============================================================

// ===============================================================
// Quality / Pricing / Details / Watermark / Lightbox
// ===============================================================

// ----------------------------------------------------------
// Pricing card — v14.0 layout:
//   • Three tabs: All / Graded / Raw
//   • Big CURRENT VALUE + LAST SOLD only
//   • Bar chart comparing Raw / PSA10 / BGS10 / etc. averages
//   • Trading-history table: Grade | Name-Rarity-Lang | Price
//   • For Raw: only listings within ±30% of median (true price band)
//   • For Graded: up to 2 listings per grade tier (PSA10/BGS10/etc.)
// ----------------------------------------------------------
const GRADED_TIERS = ['PSA 10', 'BGS 10 BL', 'BGS 10', 'CGC 10', 'ARS 10'];


// SCN73 — Currency pill toggle. Lives inside PricingResult so each
// scan can flip currencies independently from the global Settings.


// Build a per-tab summary object from a filtered item list, optionally
// dropping outliers more than `withinPercent` away from the median (used
// for the Raw tab to compute a true "fair price" band).

// Group + flatten graded items so we show up to 2 per grade tier.

// Estimate Mint/NM/Played for Raw listings based on the listing's price
// relative to the median (higher = better presumed condition; collectors
// don't generally pay top dollar for played raws).

// Per-tab empty state. Renders inside PricingResult when the active tab has
// zero items. Tone is informational, not error-y — most empty states here
// are legitimate (no graded slabs exist for this card, etc.), not failures.


// Bar chart — average price per tier (Raw / PSA10 / BGS10 / etc.).
// SCN45 — Single hero tile with toggle between RAW · NEAR MINT and PSA 10.
// Shows sold-only data: median (hero), low → high range, sample count,
// last sold price + date. Replaces the older multi-tier bar chart —
// fewer data points, each gets the visual weight it deserves.
// SCN53 — Side-by-side tiles: PSA 10 (left) and RAW · NEAR MINT (right).
// Sold-only median / range / sample count / last sold for each tier.
// Replaces the SCN45 toggle UI — both tiers are visible simultaneously.



// Sold-price sparkline. Each point is a real sold listing — when a date
// is missing we fall back to index order so the graph still renders.

const mercariBtn = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '12px 16px', fontSize: SZ.sm, fontWeight: 600,
  color: T.textHi, background: T.surface2,
  border: `1px solid ${T.border2}`, borderRadius: 12,
  textDecoration: 'none', cursor: 'pointer',
  fontFamily: 'inherit',
};

const ebayLinkBtn = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '10px 14px', textAlign: 'center',
  background: T.surface2, border: `1px solid ${T.borderHi}`,
  color: T.cyan, borderRadius: 10, fontSize: SZ.sm,
  fontFamily: T.fontDisplay, fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase', textDecoration: 'none',
};

// Convert between any two currencies via THB as the bridge currency.
// fx is base-THB (i.e. fx.USD is the USD value of 1 THB).

const DEFAULT_FX_FALLBACK = { THB: 1, USD: 0.0286, PHP: 1.66, JPY: 4.32, MYR: 0.128, SGD: 0.0383 };


// ----------------------------------------------------------
// VariantPicker — grid of SAMPLE images for every known rarity of a code.
// User taps the variant that matches their physical card; that selection
// becomes the canonical rarity for pricing + community DB storage.
// ----------------------------------------------------------

// ----------------------------------------------------------
// ConfirmRarityPanel — appears under the SAMPLE hero once a variant is
// picked. Lets the user re-confirm or change the rarity from a focused
// dropdown without opening the full Edit-Fields panel. Submitting fires
// a fresh /api/prices lookup using the corrected rarity.
// ----------------------------------------------------------

// ----------------------------------------------------------
// DON Card workflow
// DON cards have no unique code — they're identifiable only by visual
// features (gold border, foil pattern, regular). We can't price them via
// the standard code lookup, so we surface visual-search deep-links so the
// user can quickly cross-reference on eBay / Mercari / Google Lens.
// ----------------------------------------------------------
// A card is a DON if EITHER the rarity OR the type contains "DON", OR if
// the synthetic-DON code pattern is present ("X Don Card"). Haiku
// occasionally reports type: "DON!!" without putting DON in the rarity.

// SCN58 — CN Anniversary promo recognition. We trigger the
// CnAnnivVisualLookup picker whenever the scanner identifies a card from
// the 1st / 2nd / 3rd CN Anniversary boxes — those cards reuse OP/ST/EB
// codes but are visually distinct alt-art reprints, so we let the user
// match against the 33-card local catalog (api/_cn-anniv-catalog.json).


// ----------------------------------------------------------
// CnAnnivVisualLookup — SCN58
// Visual picker for CN 1st/2nd/3rd Anniversary box cards. Mirrors the
// DonVisualLookup pattern: fetch the 33-card catalog, ask Vision +
// Haiku-confirm to rank them against the user's photo, render the top 9
// and let the user tap to lock the synthetic code.
// ----------------------------------------------------------

// ----------------------------------------------------------
// SampleHero — Collectr-style large official SAMPLE image with details
// and a "Save to Community DB" button.
// ----------------------------------------------------------
// SCN18 — grade options shown in the save-to-vault modal. Mirrors the
// graded condition tiers used by the eBay pricing search (PSA10 etc.) so
// the per-grade value displayed in the Vault matches what the price card
// surfaces.
const VAULT_GRADE_OPTIONS = [
  'Raw',
  'PSA 10', 'PSA 9',
  'BGS 10', 'BGS 10 BL', 'BGS 9.5',
  'CGC 10', 'CGC 9.5',
  'ARS 10',
  'SGC 10',
];




// ImageLightbox — fullscreen image viewer with zoom controls.
// SCN6: initialZoom prop lets corner thumbnails open at 300%. The user can
// then pinch-zoom further (native iOS/Android), or use the +/-/Fit/100%/300%
// chips. Container scrolls on overflow so a 300%-scaled image is fully
// pannable.
// LanguagePrompt — SCN21 redesign
// Full-bleed modal that fires the moment the user picks/takes a photo.
// Big language tiles with the native script + the canonical English name +
// a flag glyph for instant recognition. Selecting auto-resolves into the
// scan action that originally triggered the prompt.
//
// Why per-scan instead of a sticky top tab: every scan can be a different
// language, and an explicit pick gives Haiku + Vision OCR a much stronger
// signal than the inferred last-used value did.

// ImageLightbox — fullscreen image viewer (SCN6 + SCN13 + SCN15).
// Corner thumbnails open at 200% (per SCN13). Three zoom interactions:
//   - Plain mouse-wheel: smooth coarse zoom (×1.10 / ×0.90 per notch)
//   - Ctrl + mouse-wheel: micro-zoom (×1.03 / ×0.97 per notch) for fine tuning
//   - Pinch on touch: native browser handling
// And panning while zoomed in:
//   - Click + drag on the image moves the scroll position (works on top of
//     native overflow:auto scrollbars — handles both desktop drag and
//     touchscreen single-finger drag)
