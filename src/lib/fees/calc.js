// src/lib/fees/calc.js — v14
// Pure ES module port of the SwibSwap fee engine.
// Mirrors the handoff zip's js/calc.js verbatim — every line item, every flag.
//
// CRITICAL: if any computation here disagrees with the handoff simulator,
// the simulator wins. Run parity.test.js after any edit.
//
// All functions are platform-agnostic:
//   - No DOM access
//   - No React imports
//   - No `window`, no `document`, no `process`
//   - Pure inputs → pure outputs
//
// Used by:
//   - /api/swibswap-fees.js (server-side fee preview)
//   - Vault "Mark Sold" flow (client-side breakdown)
//   - Scanner "List on SwibSwap" sheet (client-side preview)
//   - Future SwibSwap.com web checkout

import { TIER_IDX } from './constants.js';

// ─── Formatting helpers (handy for UI; kept here for parity with the handoff)
export function fmt(n, dec = 2) {
  if (n == null) return '—';
  const abs  = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  return sign + '฿' + abs.toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export function fmtPct(n, dec = 2) {
  return (n * 100).toFixed(dec) + '%';
}

export function r2(n) {
  return Math.round(n * 100) / 100;
}

// ─── Bracket & fee lookup ────────────────────────────────────────────────────
export function getBracket(price) {
  if (price <= 100)   return 100;
  if (price <= 15000) return 15000;
  if (price <= 50000) return 50000;
  return 50001;
}

export function getBSAFee(price, tier, bsaRates) {
  const bracket = getBracket(price);
  const entry   = bsaRates[bracket];
  const rate    = entry.rates[TIER_IDX[tier]];
  return entry.flat ? rate : price * rate;
}

// feeOverride is a raw % number (e.g. 15 means 15%), 0 means use table.
export function getActiveFee(price, buyerTier, feeOverride, bsaRates) {
  if (feeOverride > 0) return price * (feeOverride / 100);
  return getBSAFee(price, buyerTier, bsaRates);
}

// ─── Consign rate lookup (decay table) ───────────────────────────────────────
// Returns the consign extra rate for a given days-remaining (1–7).
export function getConsignRate(daysRemaining, C) {
  const day   = Math.max(1, Math.min(7, Math.round(daysRemaining)));
  const rates = C.consignDecayRates;
  return (rates && rates[day - 1] != null) ? rates[day - 1] : C.consignExtraRate;
}

// ─── Single-transaction calculator ───────────────────────────────────────────
// Returns a plain object with every intermediate value.
// Parameters mirror the handoff calc() exactly.
//
//   price        — listed price in THB
//   buyerTier    — 'user' | 'silver' | 'gold' | 'platinum'
//   sellerTier   — 'user' | 'silver' | 'gold' | 'platinum'
//   txType       — 'buysell' | 'auction'
//   deliveryMode — 'deliver' | 'consign'
//   payment      — 'cc' | 'pp'
//   sellerCost   — seller's cost basis (used for profit calc only)
//   feeOverride  — total fee override as % (0 = table)
//   C            — constants object
//   bsaRates     — BSA fee table
//   deferShipping — true only for intermediate consign chain hops
export function calc(
  price, buyerTier, sellerTier, txType, deliveryMode, payment,
  sellerCost, feeOverride, C, bsaRates, deferShipping = false
) {
  const isAuction = txType === 'auction';
  const isConsign = deliveryMode === 'consign';

  // ── Base transaction fee ───────────────────────────────────────────────────
  const bracket       = getBracket(price);
  const buyerFee      = getActiveFee(price, buyerTier, feeOverride, bsaRates);
  const sellerFee     = getBSAFee(price, sellerTier, bsaRates);
  const buyerFeeRate  = bsaRates[bracket].flat ? null : bsaRates[bracket].rates[TIER_IDX[buyerTier]];
  const sellerFeeRate = bsaRates[bracket].flat ? null : bsaRates[bracket].rates[TIER_IDX[sellerTier]];

  let buyerFeeShare, sellerFeeShare;
  if (isAuction) {
    buyerFeeShare  = buyerFee;
    sellerFeeShare = sellerFee * (C.auctionSellerFeeRate || 0);
  } else {
    buyerFeeShare  = buyerFee;
    sellerFeeShare = sellerFee;
  }

  // ── Consign extras ─────────────────────────────────────────────────────────
  const consignExtra   = isConsign ? price * C.consignExtraRate : 0;
  const consignPayback = isConsign ? price * C.consignPayback   : 0;

  // ── Shipping ───────────────────────────────────────────────────────────────
  const shippingCharge  = C.shippingCharge;
  const shippingCostAmt = (isConsign && deferShipping) ? C.shippingCharge : C.shippingCost;

  // ── Buyer totals ───────────────────────────────────────────────────────────
  const buyerSubtotal = price + buyerFeeShare + consignExtra + shippingCharge;
  let buyerTotal, ppDiscountAmt;
  if (payment === 'cc') {
    ppDiscountAmt = 0;
    buyerTotal    = buyerSubtotal;
  } else {
    ppDiscountAmt = buyerSubtotal * C.ppDisc;
    buyerTotal    = buyerSubtotal - ppDiscountAmt;
  }

  // ── Seller totals ──────────────────────────────────────────────────────────
  const sellerReceives = price - sellerFeeShare + consignPayback;
  const sellerProfit   = sellerReceives - sellerCost;
  const sellerGM       = sellerCost > 0 ? sellerProfit / sellerCost : null;

  // ── Platform totals ────────────────────────────────────────────────────────
  const totalFeeRevenue   = buyerFeeShare + sellerFeeShare + consignExtra;
  const shippingCollected = shippingCharge;
  const shippingNet       = shippingCollected - shippingCostAmt;
  const paymentFee = payment === 'cc'
    ? buyerSubtotal * C.ccFee
    : buyerTotal    * C.ppFee;
  const vatOnFee   = totalFeeRevenue * C.vat;
  const platformNet =
    totalFeeRevenue + shippingNet - paymentFee - vatOnFee - ppDiscountAmt - consignPayback;
  const platformGM  = buyerTotal > 0 ? platformNet / buyerTotal : 0;

  return {
    // echoed inputs
    price, buyerTier, txType, deliveryMode, payment, sellerCost,
    // flags
    isAuction, isConsign,
    // bracket info
    bracket, buyerFeeRate, sellerFeeRate,
    // buyer breakdown
    buyerFeeShare, consignExtra, shippingCharge,
    buyerSubtotal, ppDiscountAmt, buyerTotal,
    // seller breakdown
    sellerFeeShare, consignPayback, sellerReceives, sellerProfit, sellerGM,
    // platform breakdown
    totalFeeRevenue,
    shippingCollected, shippingCost: shippingCostAmt, shippingNet,
    paymentFee, vatOnFee, platformNet, platformGM,
  };
}

// ─── Consignment chain calculator ────────────────────────────────────────────
// Models Store A → (Reseller 1 →) … → Final Buyer.
// Each hop is a consign transaction with its own rate from the decay table.
// Shipping coin-refund model: every hop collects shipping; intermediate buyers
// get a coin refund so their net cost = 0. Only the final delivery bears the
// real courier cost.
export function calcChain(
  p0, buyerTier, sellerTier, txType, payment,
  chainHops, markup, feeOverride, C, bsaRates, subsequentPayback = false
) {
  const chainLen = chainHops.length;
  const nodes    = [];
  const transactions = [];

  const nodeColors = ['#8E44AD', '#2980B9', '#16A085', '#C0392B', '#1ABC9C', '#7F8C8D'];

  const makeTx = (price, hopBuyerTier, buyIn, isDelivery, hop, isFirstHop) => {
    const hopConsignRate = getConsignRate(hop.daysRemaining, C);
    const subPaybackRate = C.consignExtraRate > 0
      ? (C.consignPayback / C.consignExtraRate) * hopConsignRate
      : 0;
    const isBuyout = isDelivery && hop.buyerMode !== 'consignExpire';
    const hopPayback = isBuyout
      ? 0
      : isFirstHop
        ? C.consignPayback
        : (subsequentPayback ? subPaybackRate : 0);
    const buyerExtraRate = (!isBuyout && isDelivery)
      ? getConsignRate(hop.buyerDays || 7, C)
      : 0;
    const hopC = {
      ...C,
      consignExtraRate: hopConsignRate + buyerExtraRate,
      consignPayback:   hopPayback,
    };
    const hopDeliveryMode = isBuyout ? 'deliver' : 'consign';
    const hopSellerTier = hop.sellerTier || sellerTier;
    const hopTxType     = hop.txType     || txType;
    const hopPayment    = hop.payment    || payment;
    const tx = calc(
      price, hopBuyerTier, hopSellerTier, hopTxType,
      hopDeliveryMode, hopPayment, buyIn, feeOverride, hopC, bsaRates, !isDelivery
    );
    const coinRefund = isDelivery ? 0 : C.shippingCharge;
    const effectiveConsignRate = isBuyout ? 0 : (hopConsignRate + buyerExtraRate);
    return {
      tx,
      coinRefund,
      adjustedPlatNet: tx.platformNet,
      consignRate: effectiveConsignRate,
      buyerConsignRate: buyerExtraRate,
    };
  };

  // ── Hop 1: Store A → first buyer ──────────────────────────────────────────
  const buyerTier1 = chainHops[0].buyerTier || (chainLen === 1 ? buyerTier : 'platinum');
  const { tx: tx0, coinRefund: cr0, adjustedPlatNet: apn0, consignRate: rate0 } =
    makeTx(p0, buyerTier1, 0, chainLen === 1, chainHops[0], true);
  const firstBuyer = chainLen === 1 ? 'Final Buyer' : 'Reseller 1';

  transactions.push({
    step: 1, seller: 'Store A', buyer: firstBuyer,
    price: p0, tx: tx0, sellerBuyIn: null,
    isDelivery: chainLen === 1, coinRefund: cr0, adjustedPlatNet: apn0,
    daysRemaining: chainHops[0].daysRemaining, consignRate: rate0,
  });
  nodes.push({
    label: 'Store A', role: 'Lister',
    listPrice: p0, boughtAt: null,
    fee: tx0.sellerFeeShare, receives: tx0.sellerReceives,
    ConsignPayback: tx0.consignPayback,
    profit: null, profitLabel: 'Net Received', color: '#F39C12',
  });

  if (chainLen === 1) {
    nodes.push({
      label: 'Final Buyer', role: 'Final Buyer',
      listPrice: p0, boughtAt: tx0.buyerTotal,
      fee: tx0.buyerFeeShare + tx0.consignExtra,
      receives: null, profit: null, profitLabel: 'Total Paid', color: '#27AE60',
    });
    return { nodes, transactions };
  }

  // ── Intermediate reseller hops ────────────────────────────────────────────
  let prevPrice         = p0;
  let prevEffectiveCost = tx0.buyerTotal - cr0;

  for (let i = 0; i < chainLen - 1; i++) {
    const buyIn      = prevEffectiveCost;
    const sellPrice  = Math.round(prevPrice * (1 + markup));
    const isLast     = (i === chainLen - 2);
    const hop        = chainHops[i + 1];
    const sellerLbl  = `Reseller ${i + 1}`;
    const nextLbl    = isLast ? 'Final Buyer' : `Reseller ${i + 2}`;

    const hopBuyerTier = hop.buyerTier || (isLast ? buyerTier : 'platinum');
    const { tx: txR, coinRefund: crR, adjustedPlatNet: apnR, consignRate: rateR } =
      makeTx(sellPrice, hopBuyerTier, buyIn, isLast, hop, false);

    transactions.push({
      step: i + 2, seller: sellerLbl, buyer: nextLbl,
      price: sellPrice, tx: txR, sellerBuyIn: buyIn,
      isDelivery: isLast, coinRefund: crR, adjustedPlatNet: apnR,
      daysRemaining: hop.daysRemaining, consignRate: rateR,
    });
    nodes.push({
      label: sellerLbl, role: `Flip #${i + 1}`,
      listPrice: sellPrice, boughtAt: buyIn,
      fee: txR.sellerFeeShare, receives: txR.sellerReceives,
      ConsignPayback: txR.consignPayback,
      profit: txR.sellerProfit, profitLabel: 'Profit',
      color: nodeColors[i] || '#555',
      gotCoinRefund: true,
    });

    prevPrice         = sellPrice;
    prevEffectiveCost = txR.buyerTotal - crR;
  }

  // ── Final buyer node ──────────────────────────────────────────────────────
  const lastTx = transactions[transactions.length - 1].tx;
  nodes.push({
    label: 'Final Buyer', role: 'Final Buyer',
    listPrice: transactions[transactions.length - 1].price,
    boughtAt: lastTx.buyerTotal,
    fee: lastTx.buyerFeeShare + lastTx.consignExtra,
    receives: null, profit: null, profitLabel: 'Total Paid', color: '#27AE60',
  });

  return { nodes, transactions };
}

// ─── Break-even PromptPay discount ───────────────────────────────────────────
// Returns the ppDisc rate at which platform earns the same net on CC vs PP.
//   CC_fee = (1 − ppDisc) × PP_fee + ppDisc
//   → ppDisc = (CC_fee − PP_fee) / (1 − PP_fee)
export function ppBreakevenDiscount(C) {
  return (C.ccFee - C.ppFee) / (1 - C.ppFee);
}
