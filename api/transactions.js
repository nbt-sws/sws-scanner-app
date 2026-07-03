// /api/transactions.js
// Marketplace economic activity for SwibSwap.com:
//   - POST                          → append a transaction (purchase / sale)
//   - GET                           → list transactions for code+rarity
//   - POST ?action=preview-fees     → server-side fee calculation (v14, A3)
//     {price, buyerTier, sellerTier, txType, deliveryMode, payment, sellerCost,
//      feeOverride?}  → returns full calc() output
//   - POST ?action=preview-chain    → multi-hop chain fee preview (v14, A3)
//     {p0, buyerTier, sellerTier, txType, payment, chainHops, markup, feeOverride?,
//      subsequentPayback?} → returns calcChain() output
//
// Each transaction doc lives at /transactions/{auto-id} with:
//   {
//     code, rarity, lang, tcg,
//     kind: 'purchase' | 'sale',
//     amount,         // in original currency
//     currency,       // ISO code e.g. 'THB'
//     amountTHB,      // server-normalized for graph aggregation
//     fees?,          // { bsa, shipping, payment, vat, net } when present (A5)
//     uid,            // contributor
//     at:             // server timestamp
//   }
//
// Privacy: only the buyer/seller's uid is recorded; the read view is
// aggregated (no PII) — anyone can read summary stats per code+rarity.
//
// The fee-preview actions DO NOT touch Firestore — pure computation. They
// share this route to stay under Vercel Hobby's 12-function cap; conceptually
// they're both "marketplace economic activity for SwibSwap.com".

import { getDb, verifyUser } from './_firebase-admin.js';
import { calc, calcChain } from '../src/lib/fees/calc.js';
import NBT from '../src/lib/fees/config.js';

const C        = NBT.constants;
const BSA      = NBT.bsaRates;
const TIERS    = ['user', 'silver', 'gold', 'platinum'];
const TX_TYPES = ['buysell', 'auction'];
const MODES    = ['deliver', 'consign'];
const PAYS     = ['cc', 'pp'];

const COLLECTION = 'transactions';

// THB-base fallback rates (mirrors src/theme.js DEFAULT_FX); refreshed via
// Frankfurter on the client side but server-side conversion uses these
// as a stable backup.
const DEFAULT_FX = { THB: 1, USD: 0.0286, PHP: 1.66, JPY: 4.32, MYR: 0.128, SGD: 0.0383, EUR: 0.0258, GBP: 0.0222 };

function toTHB(amount, currency) {
  const rate = DEFAULT_FX[String(currency || 'THB').toUpperCase()];
  if (!rate || !amount) return Number(amount) || 0;
  return Number(amount) / rate;
}

export default async function handler(req, res) {
  const method = req.method;
  const action = String(req.query?.action || '').toLowerCase();

  // Fee preview endpoints (server-side fee engine). No DB write, no auth.
  // Kept here to share a route slot with transaction logging.
  if (method === 'POST' && action === 'preview-fees')  return previewFees(req, res);
  if (method === 'POST' && action === 'preview-chain') return previewChain(req, res);

  // Original transaction logging endpoints.
  if (method === 'POST') return appendTransaction(req, res);
  if (method === 'GET')  return listTransactions(req, res);
  return res.status(405).json({ ok: false, error: 'POST or GET only' });
}

// ─── Fee preview (A3) ──────────────────────────────────────────────────────
// Validates inputs, runs calc(), returns the breakdown. The BSA rate table
// itself is NOT in the response — clients only see the resolved fee amounts
// for their specific transaction. NBT_Rate_3 stays server-side.
function validateTier(t)   { return TIERS.includes(t); }
function validateTxType(t) { return TX_TYPES.includes(t); }
function validateMode(m)   { return MODES.includes(m); }
function validatePayment(p){ return PAYS.includes(p); }

function previewFees(req, res) {
  const {
    price, buyerTier, sellerTier, txType, deliveryMode, payment,
    sellerCost = 0, feeOverride = 0,
  } = req.body || {};

  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0)         return res.status(400).json({ ok: false, error: 'price must be a positive number' });
  if (!validateTier(buyerTier))              return res.status(400).json({ ok: false, error: `buyerTier must be one of ${TIERS.join(',')}` });
  if (!validateTier(sellerTier))             return res.status(400).json({ ok: false, error: `sellerTier must be one of ${TIERS.join(',')}` });
  if (!validateTxType(txType))               return res.status(400).json({ ok: false, error: `txType must be one of ${TX_TYPES.join(',')}` });
  if (!validateMode(deliveryMode))           return res.status(400).json({ ok: false, error: `deliveryMode must be one of ${MODES.join(',')}` });
  if (!validatePayment(payment))             return res.status(400).json({ ok: false, error: `payment must be one of ${PAYS.join(',')}` });

  const sc = Number(sellerCost) || 0;
  const fo = Number(feeOverride) || 0;

  try {
    const result = calc(p, buyerTier, sellerTier, txType, deliveryMode, payment, sc, fo, C, BSA);
    // Strip echoed inputs that don't add value to the client response.
    const {
      isAuction, isConsign, bracket, buyerFeeRate, sellerFeeRate,
      buyerFeeShare, consignExtra, shippingCharge,
      buyerSubtotal, ppDiscountAmt, buyerTotal,
      sellerFeeShare, consignPayback, sellerReceives, sellerProfit, sellerGM,
      totalFeeRevenue, shippingCollected, shippingCost, shippingNet,
      paymentFee, vatOnFee, platformNet, platformGM,
    } = result;
    return res.status(200).json({
      ok: true,
      action: 'preview-fees',
      engine: { nbt: NBT.name, version: NBT.version },
      input: { price: p, buyerTier, sellerTier, txType, deliveryMode, payment, sellerCost: sc, feeOverride: fo },
      flags: { isAuction, isConsign },
      bracket,
      buyer: {
        feeShare: buyerFeeShare,
        feeRate:  buyerFeeRate,
        consignExtra,
        shipping: shippingCharge,
        subtotal: buyerSubtotal,
        ppDiscount: ppDiscountAmt,
        total:    buyerTotal,
      },
      seller: {
        feeShare: sellerFeeShare,
        feeRate:  sellerFeeRate,
        consignPayback,
        receives: sellerReceives,
        profit:   sellerProfit,
        gm:       sellerGM,
      },
      platform: {
        feeRevenue:        totalFeeRevenue,
        shippingCollected,
        shippingCost,
        shippingNet,
        paymentFee,
        vatOnFee,
        net:               platformNet,
        gm:                platformGM,
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: `Fee calc failed: ${e.message}` });
  }
}

function previewChain(req, res) {
  const {
    p0, buyerTier, sellerTier, txType, payment,
    chainHops, markup = 0, feeOverride = 0, subsequentPayback = false,
  } = req.body || {};

  const price = Number(p0);
  if (!Number.isFinite(price) || price <= 0)   return res.status(400).json({ ok: false, error: 'p0 must be a positive number' });
  if (!validateTier(buyerTier))                return res.status(400).json({ ok: false, error: 'invalid buyerTier' });
  if (!validateTier(sellerTier))               return res.status(400).json({ ok: false, error: 'invalid sellerTier' });
  if (!validateTxType(txType))                 return res.status(400).json({ ok: false, error: 'invalid txType' });
  if (!validatePayment(payment))               return res.status(400).json({ ok: false, error: 'invalid payment' });
  if (!Array.isArray(chainHops) || chainHops.length < 1 || chainHops.length > 7) {
    return res.status(400).json({ ok: false, error: 'chainHops must be an array of length 1–7' });
  }
  const mk = Number(markup) || 0;
  const fo = Number(feeOverride) || 0;

  try {
    const result = calcChain(price, buyerTier, sellerTier, txType, payment,
                             chainHops, mk, fo, C, BSA, !!subsequentPayback);
    return res.status(200).json({
      ok: true,
      action: 'preview-chain',
      engine: { nbt: NBT.name, version: NBT.version },
      input: { p0: price, buyerTier, sellerTier, txType, payment, chainHops, markup: mk, feeOverride: fo, subsequentPayback: !!subsequentPayback },
      transactions: result.transactions.map((t) => ({
        step: t.step, seller: t.seller, buyer: t.buyer,
        price: t.price, sellerBuyIn: t.sellerBuyIn,
        isDelivery: t.isDelivery, coinRefund: t.coinRefund,
        daysRemaining: t.daysRemaining, consignRate: t.consignRate,
        adjustedPlatNet: t.adjustedPlatNet,
        tx: {
          buyerTotal: t.tx.buyerTotal, buyerFeeShare: t.tx.buyerFeeShare,
          sellerReceives: t.tx.sellerReceives, sellerFeeShare: t.tx.sellerFeeShare,
          platformNet: t.tx.platformNet, paymentFee: t.tx.paymentFee, vatOnFee: t.tx.vatOnFee,
        },
      })),
      nodes: result.nodes,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: `Chain calc failed: ${e.message}` });
  }
}

async function appendTransaction(req, res) {
  const user = await verifyUser(req).catch(() => null);
  if (!user?.uid) return res.status(401).json({ ok: false, error: 'Sign-in required' });

  const { code, rarity, lang, tcg, kind, amount, currency } = req.body || {};
  if (!code || !rarity) return res.status(400).json({ ok: false, error: 'Missing code or rarity' });
  if (!['purchase', 'sale'].includes(kind)) return res.status(400).json({ ok: false, error: 'kind must be "purchase" or "sale"' });
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ ok: false, error: 'amount must be a non-negative number' });

  const admin = (await import('firebase-admin')).default;
  const doc = {
    code,
    rarity,
    lang: lang || null,
    tcg: tcg || 'op',
    kind,
    amount: amt,
    currency: String(currency || 'THB').toUpperCase(),
    amountTHB: Math.round(toTHB(amt, currency)),
    uid: user.uid,
    at: admin.firestore.FieldValue.serverTimestamp(),
  };
  const ref = await getDb().collection(COLLECTION).add(doc);
  return res.status(200).json({ ok: true, id: ref.id });
}

async function listTransactions(req, res) {
  const { code, rarity, days = '90' } = req.query;
  if (!code || !rarity) return res.status(400).json({ ok: false, error: 'Missing code or rarity' });
  const sinceMs = Date.now() - (parseInt(days, 10) || 90) * 24 * 60 * 60 * 1000;
  const sinceDate = new Date(sinceMs);
  const snap = await getDb().collection(COLLECTION)
    .where('code', '==', code)
    .where('rarity', '==', rarity)
    .orderBy('at', 'desc')
    .limit(200)
    .get();

  const items = [];
  snap.forEach((d) => {
    const x = d.data();
    const ts = x.at?.toDate?.()?.getTime?.() || 0;
    if (ts < sinceMs) return;
    items.push({
      id: d.id,
      kind: x.kind,
      amount: x.amount,
      currency: x.currency,
      amountTHB: x.amountTHB,
      at: x.at?.toDate?.()?.toISOString?.() || null,
    });
  });

  // Aggregate per kind for a quick summary.
  const sales = items.filter((i) => i.kind === 'sale');
  const purchases = items.filter((i) => i.kind === 'purchase');
  const sum = (arr) => arr.reduce((a, b) => a + (b.amountTHB || 0), 0);
  const median = (arr) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].map((i) => i.amountTHB).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  return res.status(200).json({
    ok: true,
    code, rarity,
    summary: {
      saleCount: sales.length,
      purchaseCount: purchases.length,
      saleMedianTHB: median(sales),
      purchaseMedianTHB: median(purchases),
      totalVolumeTHB: sum(items),
    },
    items,
    sinceISO: sinceDate.toISOString(),
  });
}
