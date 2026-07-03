// src/screens/scanner/helpers.js — SCN86 extracted from Scanner.js
// Small pure functions shared by multiple scanner sub-components.

import { CURRENCIES, DEFAULT_FX, fmtMoney } from '../../theme';

export const DEFAULT_FX_FALLBACK = { THB: 1, USD: 0.0286, PHP: 1.66, JPY: 4.32, MYR: 0.128, SGD: 0.0383 };

// SCN87 — GRADED_TIERS was referenced by isGradedTier + pickGradedTwoPerTier
// but the const itself was left in Scanner.js during the SCN86 extraction.
// Moving it here so the helpers are self-contained.
export const GRADED_TIERS = ['PSA 10', 'BGS 10 BL', 'BGS 10', 'CGC 10', 'ARS 10'];

export function isGradedTier(tier) {
  return GRADED_TIERS.includes(tier) || /^(PSA|BGS|CGC|ARS)\b/.test(tier || '');
}

export function rawConditionGuess(priceUSD, median) {
  if (!median) return 'NM';
  if (priceUSD >= median * 1.15) return 'Mint';
  if (priceUSD >= median * 0.85) return 'Near Mint';
  if (priceUSD >= median * 0.5)  return 'Lightly Played';
  return 'Played';
}

export function pickGradedTwoPerTier(items) {
  const buckets = {};
  for (const it of items) {
    const t = it.conditionTier || classifyTitleClient(it.title);
    if (!buckets[t]) buckets[t] = [];
    buckets[t].push(it);
  }
  const out = [];
  for (const t of GRADED_TIERS) {
    const list = (buckets[t] || []).sort((a, b) => b.priceUSD - a.priceUSD).slice(0, 2);
    out.push(...list);
  }
  for (const t of Object.keys(buckets)) {
    if (GRADED_TIERS.includes(t)) continue;
    if (!isGradedTier(t)) continue;
    out.push(...buckets[t].sort((a, b) => b.priceUSD - a.priceUSD).slice(0, 2));
  }
  return out;
}

export function classifyTitleClient(title) {
  const t = ` ${String(title || '').toUpperCase()} `;
  if (/[^A-Z]PSA[\s.-]*10[^0-9]/.test(t)) return 'PSA 10';
  if (/[^A-Z]BGS[\s.-]*10\s*BL/.test(t))  return 'BGS 10 BL';
  if (/[^A-Z]BGS[\s.-]*10[^0-9]/.test(t)) return 'BGS 10';
  if (/[^A-Z]CGC[\s.-]*10[^0-9]/.test(t)) return 'CGC 10';
  if (/[^A-Z]ARS[\s.-]*10[^0-9]/.test(t)) return 'ARS 10';
  if (/\b(PSA|BGS|CGC|ARS|GMA|AGS|TAG|HGA|SGC)\b[\s.-]*\d/.test(t)) return 'Lower grades';
  return 'Raw';
}

export function convertCurrency(amount, from, to, fx) {
  if (!amount || amount === 0) return 0;
  if (from === to) return amount;
  const fromRate = (fx && fx[from]) || DEFAULT_FX_FALLBACK[from] || 1;
  const toRate   = (fx && fx[to])   || DEFAULT_FX_FALLBACK[to]   || 1;
  const thb = amount / fromRate;
  return thb * toRate;
}

export function medianTHB(pricing, fx) {
  const overall = pricing?.overall;
  if (!overall?.median) return null;
  return Math.round(convertCurrency(overall.median, 'USD', 'THB', fx));
}

export function isDonCard(card) {
  if (!card) return false;
  const r = String(card.rarity || '').toUpperCase();
  const t = String(card.type || '').toUpperCase();
  const c = String(card.code || '');
  if (r.includes('DON')) return true;
  if (t.includes('DON')) return true;
  if (/\bDon\s+Card\b/i.test(c)) return true;
  return false;
}

export function isCnAnnivCard(card) {
  if (!card) return false;
  const set = String(card.setCode || '').toUpperCase();
  if (set === 'CN-1ANV' || set === 'CN-2ANV' || set === 'CN-3ANV') return true;
  const c = String(card.code || '').toUpperCase();
  if (/^CN-[123]ANV-\d{3}$/.test(c)) return true;
  return false;
}

export function expandRarityTags(rarity) {
  if (!rarity) return [];
  const out = [];
  const r = String(rarity);
  out.push(r);
  if (r.endsWith('★')) {
    const base = r.replace('★', '');
    if (base && !out.includes(base)) out.push(base);
    out.push('Parallel');
  }
  if (r === 'TR') out.push('Treasure');
  if (r === 'SP') out.push('Special');
  if (r === 'MR') out.push('Manga Alt Art');
  return out;
}

export function compactCondition(quality) {
  if (!quality?.quality?.estimatedTier) return null;
  return quality.quality.estimatedTier.replace(' candidate', '');
}

export function buildSummary(items, opts = {}) {
  if (!items || items.length === 0) return null;
  let kept = items;
  if (opts.withinPercent) {
    const prices = items.map((i) => i.priceUSD).filter((p) => p > 0).sort((a, b) => a - b);
    const m = prices[Math.floor(prices.length / 2)];
    kept = items.filter((i) => i.priceUSD > 0 && Math.abs(i.priceUSD - m) / m <= opts.withinPercent);
    if (kept.length < 2) kept = items;
  }
  const prices = kept.map((i) => i.priceUSD).filter((p) => p > 0).sort((a, b) => a - b);
  if (prices.length === 0) return null;
  const sortedByDate = [...kept].sort((a, b) => new Date(b.soldDate || 0) - new Date(a.soldDate || 0));
  return {
    count: prices.length,
    median: prices[Math.floor(prices.length / 2)],
    lowest: prices[0],
    highest: prices[prices.length - 1],
    avg: prices.reduce((s, p) => s + p, 0) / prices.length,
    lastSold: sortedByDate[0] ? { date: sortedByDate[0].soldDate, priceUSD: sortedByDate[0].priceUSD } : null,
    items: kept,
  };
}
