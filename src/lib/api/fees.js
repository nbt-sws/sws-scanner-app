// src/lib/api/fees.js — v14, A3
// Client-side wrapper around the server-side fee engine endpoint.
// The actual calc() lives in /api/transactions.js (under ?action=preview-fees)
// to share a Vercel route slot.
//
// CRITICAL: never import './fees/calc.js' from client code. The fee math
// always goes through the server so we have a single source of truth and the
// BSA rate table stays server-side. This wrapper is the only allowed bridge.

const TIMEOUT_MS = 8000;

async function postWithTimeout(url, body, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(id);
    const j = await r.json().catch(() => ({ ok: false, error: 'Invalid JSON response' }));
    if (!r.ok || j.ok === false) {
      throw new Error(j?.error || `HTTP ${r.status}`);
    }
    return j;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

/**
 * Server-side preview of a single-transaction fee breakdown.
 *
 * @param {object} args
 * @param {number} args.price          - listed price in THB
 * @param {'user'|'silver'|'gold'|'platinum'} args.buyerTier
 * @param {'user'|'silver'|'gold'|'platinum'} args.sellerTier
 * @param {'buysell'|'auction'} args.txType
 * @param {'deliver'|'consign'} args.deliveryMode
 * @param {'cc'|'pp'} args.payment
 * @param {number} [args.sellerCost=0] - seller's cost basis (for profit calc)
 * @param {number} [args.feeOverride=0] - total fee override as %, 0 = use table
 *
 * @returns {Promise<{ok:true,buyer:{total:number,...},seller:{...},platform:{...},...}>}
 */
export function previewFees(args) {
  return postWithTimeout('/api/transactions?action=preview-fees', args);
}

/**
 * Server-side preview of a multi-hop consign chain.
 *
 * @param {object} args
 * @param {number} args.p0             - original listing price at Store A
 * @param {string} args.buyerTier
 * @param {string} args.sellerTier
 * @param {string} args.txType
 * @param {string} args.payment
 * @param {Array<{daysRemaining:number, sellerTier?:string, buyerTier?:string, txType?:string, payment?:string, buyerMode?:string, buyerDays?:number}>} args.chainHops
 * @param {number} [args.markup=0]     - decimal markup per hop
 * @param {number} [args.feeOverride=0]
 * @param {boolean} [args.subsequentPayback=false]
 */
export function previewChain(args) {
  return postWithTimeout('/api/transactions?action=preview-chain', args);
}

/**
 * Convenience: minimal Vault "Mark Sold" preview. Defaults to the common case
 * (buysell + deliver + cc, current user is the seller at platinum) so the UI
 * only has to pass `price` and `sellerCost`.
 */
export function previewMarkSold({ price, sellerCost, buyerTier = 'platinum', sellerTier = 'platinum', payment = 'cc' }) {
  return previewFees({
    price,
    buyerTier,
    sellerTier,
    txType: 'buysell',
    deliveryMode: 'deliver',
    payment,
    sellerCost: sellerCost || 0,
  });
}
