// /api/auctions.js — v14, B1
// ----------------------------------------------------------
// SwibSwap auction lifecycle endpoint.
//
// Now that we're on Vercel Pro the 12-function Hobby cap is gone, so this
// gets its own route instead of being squeezed into transactions.js.
//
// Routes (all share this file, dispatched by req.method + ?action= ):
//
//   POST   /api/auctions                          → create a new auction
//   POST   /api/auctions?action=bid&id=X          → place a bid
//   POST   /api/auctions?action=cancel&id=X       → seller cancels (3-strike + penalty)
//   POST   /api/auctions?action=retract&id=X      → bidder retracts most-recent bid
//   POST   /api/auctions?action=tick              → cron: close expired auctions
//   GET    /api/auctions?id=X                     → fetch single auction + bid history
//   GET    /api/auctions?status=active            → list browseable auctions
//
// Firestore data model (added to firestore.rules in the deploy that ships
// this file — see /docs/AUCTIONS-SCHEMA.md):
//
//   /auctions/{id}
//     userId, type, cards[], startTHB, currentBidTHB, currentBidderUid,
//     endsAt, status, bidCount, winnerUid, swibBidEnabled, createdAt
//
//   /auctions/{id}/bids/{bidId}
//     bidderUid, amountTHB, isAutoBid, maxProxyTHB, placedAt, retracted
//
// Critical business rules from swibswap_project.md + README_v2:
//   - Bidders + sellers BOTH need KYC approved (status=approved on /users/{uid}.kyc)
//   - SwibBid auto-bid runs only when >5 min remain (T-5min cutoff §5)
//   - Bid retraction: 3 strikes per 90 days → bidding suspension
//   - Vault Auctions cap at 18 cards (README_v2 §3)
//   - Auction prices LOCKED — no PromptPay discount (§2)
//
// All fee math here is HISTORICAL: it captures the BSA + ship + payment
// breakdown AT THE TIME of bid acceptance, frozen for downstream payment +
// dispute resolution. Live fee preview uses /api/transactions?action=preview-fees.

import { getDb, verifyUser } from './_firebase-admin.js';

const COLLECTION = 'auctions';
const SUBCOLL_BIDS = 'bids';

// Toggle KYC enforcement via env. Set AUCTION_REQUIRE_KYC=false in Vercel
// preview env until C2 (KYC flow) ships; production should leave this true.
const REQUIRE_KYC = String(process.env.AUCTION_REQUIRE_KYC || 'true').toLowerCase() !== 'false';

// SwibBid auto-bid cutoff. After this window expires, every bid must be
// placed manually — proxy bidding is locked out. Matches README_v2 §5.
const SWIBBID_CUTOFF_MS = 5 * 60 * 1000;     // 5 minutes

// Maximum cards in a Vault Auction folder. README_v2 §3.
const VAULT_AUCTION_MAX_CARDS = 18;

// Min auction duration (so accidental tests don't run for 30 seconds).
const MIN_AUCTION_DURATION_MS = 15 * 60 * 1000;   // 15 min
// Max auction duration — eBay caps at 10 days, we match.
const MAX_AUCTION_DURATION_MS = 10 * 24 * 60 * 60 * 1000;

// Standard increment table (THB), keyed by current bid. eBay convention
// translated to THB with ~1 USD = 33 THB. Used for the next-minimum-bid
// calculation in the place-bid handler.
const INCREMENT_TABLE = [
  { upTo:      30, step:    1 },
  { upTo:     150, step:    5 },
  { upTo:     750, step:   15 },
  { upTo:    3000, step:   30 },
  { upTo:    7500, step:   75 },
  { upTo:   15000, step:  150 },
  { upTo:   30000, step:  300 },
  { upTo: Infinity, step: 750 },
];

function nextMinBid(currentTHB) {
  if (currentTHB <= 0) return 1;
  const tier = INCREMENT_TABLE.find((t) => currentTHB < t.upTo) || INCREMENT_TABLE[INCREMENT_TABLE.length - 1];
  return Math.ceil(currentTHB + tier.step);
}

// ─── Handler dispatch ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const method = req.method;
  const action = String(req.query?.action || '').toLowerCase();

  // Cron tick can arrive as GET (Vercel scheduled functions are GET-only)
  // or POST (manual / test runs). Handle either before any other dispatch.
  if (action === 'tick') return tickEndingAuctions(req, res);

  // GET → read paths (no auth required for browsing).
  if (method === 'GET') {
    if (req.query?.id) return getAuction(req, res);
    return listAuctions(req, res);
  }

  if (method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'GET or POST only' });
  }

  // Everything else needs a signed-in user.
  const user = await verifyUser(req).catch(() => null);
  if (!user?.uid) {
    return res.status(401).json({ ok: false, error: 'Sign-in required' });
  }

  if (action === 'bid')      return placeBid(req, res, user);
  if (action === 'retract')  return retractBid(req, res, user);
  if (action === 'cancel')   return cancelAuction(req, res, user);
  // No action → create.
  return createAuction(req, res, user);
}

// ─── KYC gate ────────────────────────────────────────────────────────────────
async function ensureKycApproved(uid) {
  if (!REQUIRE_KYC) return { ok: true };
  try {
    const snap = await getDb().collection('users').doc(uid).get();
    if (!snap.exists) return { ok: false, reason: 'User profile not initialized' };
    const data = snap.data();
    const status = (data?.kyc?.status || data?.kyc || '').toString().toLowerCase();
    if (status === 'approved') return { ok: true };
    return { ok: false, reason: `KYC ${status || 'not submitted'} — required for auctions per Thai AML compliance` };
  } catch (e) {
    return { ok: false, reason: `KYC check failed: ${e.message}` };
  }
}

// ─── Create auction ──────────────────────────────────────────────────────────
async function createAuction(req, res, user) {
  const kyc = await ensureKycApproved(user.uid);
  if (!kyc.ok) return res.status(403).json({ ok: false, error: kyc.reason });

  const {
    type = 'single',                  // 'single' | 'bundle' | 'vault-auction'
    cards = [],                       // [{ code, rarity, lang, photoUrl, name? }]
    startTHB,                         // opening bid in THB
    reserveTHB = 0,                   // optional reserve price (0 = no reserve)
    durationMs = 7 * 24 * 60 * 60 * 1000,  // default 7 days
    swibBidEnabled = true,
    title,                            // optional human label, defaults to first card name
    description,                      // optional rich text
  } = req.body || {};

  // Validation
  if (!['single', 'bundle', 'vault-auction'].includes(type)) {
    return res.status(400).json({ ok: false, error: 'type must be single, bundle, or vault-auction' });
  }
  if (!Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ ok: false, error: 'cards must be a non-empty array' });
  }
  if (type === 'single' && cards.length !== 1) {
    return res.status(400).json({ ok: false, error: 'single-card auctions must have exactly 1 card' });
  }
  if (type === 'vault-auction' && cards.length > VAULT_AUCTION_MAX_CARDS) {
    return res.status(400).json({ ok: false, error: `Vault Auctions cap at ${VAULT_AUCTION_MAX_CARDS} cards` });
  }
  // Each card needs at minimum code + rarity.
  for (const c of cards) {
    if (!c?.code || !c?.rarity) {
      return res.status(400).json({ ok: false, error: 'every card needs code + rarity' });
    }
  }
  const start = Number(startTHB);
  if (!Number.isFinite(start) || start < 1) {
    return res.status(400).json({ ok: false, error: 'startTHB must be ≥ 1' });
  }
  const dur = Number(durationMs);
  if (!Number.isFinite(dur) || dur < MIN_AUCTION_DURATION_MS || dur > MAX_AUCTION_DURATION_MS) {
    return res.status(400).json({ ok: false, error: `durationMs must be between ${MIN_AUCTION_DURATION_MS} and ${MAX_AUCTION_DURATION_MS}` });
  }

  const admin = (await import('firebase-admin')).default;
  const now = Date.now();
  const endsAt = new Date(now + dur);

  const doc = {
    userId: user.uid,
    type,
    cards: cards.map((c) => ({
      code: c.code,
      rarity: c.rarity,
      lang: c.lang || null,
      photoUrl: c.photoUrl || null,
      name: c.name || null,
    })),
    title: title || cards[0]?.name || cards[0]?.code || 'Untitled Auction',
    description: description || null,
    startTHB: start,
    reserveTHB: Number(reserveTHB) || 0,
    currentBidTHB: 0,
    currentBidderUid: null,
    bidCount: 0,
    endsAt,
    status: 'active',
    swibBidEnabled: !!swibBidEnabled,
    winnerUid: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const ref = await getDb().collection(COLLECTION).add(doc);
  return res.status(200).json({
    ok: true,
    id: ref.id,
    auction: { id: ref.id, ...doc, endsAt: endsAt.toISOString(), createdAt: new Date(now).toISOString() },
  });
}

// ─── Place bid ───────────────────────────────────────────────────────────────
async function placeBid(req, res, user) {
  const auctionId = String(req.query?.id || '');
  if (!auctionId) return res.status(400).json({ ok: false, error: 'Missing auction id' });

  const kyc = await ensureKycApproved(user.uid);
  if (!kyc.ok) return res.status(403).json({ ok: false, error: kyc.reason });

  const { amountTHB, isAutoBid = false, maxProxyTHB = null } = req.body || {};
  const bidAmt = Number(amountTHB);
  if (!Number.isFinite(bidAmt) || bidAmt < 1) {
    return res.status(400).json({ ok: false, error: 'amountTHB must be ≥ 1' });
  }

  const db = getDb();
  const auctionRef = db.collection(COLLECTION).doc(auctionId);
  const admin = (await import('firebase-admin')).default;

  // Transaction: read auction → validate → write bid + update auction atomically.
  // Without this, two simultaneous bidders could both think they're the highest.
  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(auctionRef);
      if (!snap.exists) throw new Error('Auction not found');
      const a = snap.data();
      if (a.status !== 'active') throw new Error(`Auction is ${a.status}`);
      if (a.userId === user.uid) throw new Error('Sellers cannot bid on their own auctions');

      const endsAtMs = a.endsAt?.toDate?.()?.getTime?.() || new Date(a.endsAt).getTime();
      const now = Date.now();
      if (now >= endsAtMs) throw new Error('Auction has ended');

      const minNext = nextMinBid(a.currentBidTHB || a.startTHB - 1);
      if (bidAmt < minNext) {
        throw new Error(`Bid must be at least ${minNext} THB`);
      }

      // SwibBid cutoff: auto-bids locked out in the last 5 minutes.
      if (isAutoBid && (endsAtMs - now) < SWIBBID_CUTOFF_MS) {
        throw new Error(`SwibBid auto-bid is disabled in the last 5 minutes. Place a manual bid instead.`);
      }
      // Auto-bid sanity: maxProxyTHB must be > current bid amount.
      if (isAutoBid && (!Number.isFinite(Number(maxProxyTHB)) || Number(maxProxyTHB) <= bidAmt)) {
        throw new Error('Auto-bid requires maxProxyTHB > amountTHB');
      }

      // Write the bid.
      const bidRef = auctionRef.collection(SUBCOLL_BIDS).doc();
      tx.set(bidRef, {
        bidderUid: user.uid,
        amountTHB: bidAmt,
        isAutoBid: !!isAutoBid,
        maxProxyTHB: isAutoBid ? Number(maxProxyTHB) : null,
        placedAt: admin.firestore.FieldValue.serverTimestamp(),
        retracted: false,
      });

      // Anti-snipe is NOT enabled (per README_v2 §5 — hard T-5min cutoff,
      // no auto-extend). Just update the auction header.
      tx.update(auctionRef, {
        currentBidTHB: bidAmt,
        currentBidderUid: user.uid,
        bidCount: (a.bidCount || 0) + 1,
      });

      return {
        bidId: bidRef.id,
        newCurrentBid: bidAmt,
        secondsRemaining: Math.floor((endsAtMs - now) / 1000),
      };
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }
}

// ─── Retract bid (3-strike system) ───────────────────────────────────────────
// Bidders can retract their most-recent bid but it counts as a strike.
// 3 strikes in a rolling 90-day window → temporary bid suspension (TBD when
// G2 admin dashboard ships; for now we just record the strike).
async function retractBid(req, res, user) {
  const auctionId = String(req.query?.id || '');
  if (!auctionId) return res.status(400).json({ ok: false, error: 'Missing auction id' });

  const { reason } = req.body || {};
  if (!reason || String(reason).trim().length < 5) {
    return res.status(400).json({ ok: false, error: 'A retraction reason (5+ chars) is required' });
  }

  const db = getDb();
  const auctionRef = db.collection(COLLECTION).doc(auctionId);
  const admin = (await import('firebase-admin')).default;

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(auctionRef);
      if (!snap.exists) throw new Error('Auction not found');
      const a = snap.data();
      if (a.status !== 'active') throw new Error(`Auction is ${a.status}`);
      if (a.currentBidderUid !== user.uid) {
        throw new Error('You can only retract a bid if you are the current high bidder');
      }

      // Find the most-recent bid by this user.
      const bidsSnap = await auctionRef.collection(SUBCOLL_BIDS)
        .where('bidderUid', '==', user.uid)
        .where('retracted', '==', false)
        .orderBy('placedAt', 'desc')
        .limit(1)
        .get();
      if (bidsSnap.empty) throw new Error('No active bid to retract');

      const lastBid = bidsSnap.docs[0];
      tx.update(lastBid.ref, { retracted: true, retractedAt: admin.firestore.FieldValue.serverTimestamp(), retractReason: reason });

      // Find the next-highest non-retracted bid to restore current state.
      const fallbackSnap = await auctionRef.collection(SUBCOLL_BIDS)
        .where('retracted', '==', false)
        .orderBy('amountTHB', 'desc')
        .limit(1)
        .get();

      if (fallbackSnap.empty) {
        tx.update(auctionRef, {
          currentBidTHB: 0,
          currentBidderUid: null,
          bidCount: Math.max(0, (a.bidCount || 1) - 1),
        });
      } else {
        const fb = fallbackSnap.docs[0].data();
        tx.update(auctionRef, {
          currentBidTHB: fb.amountTHB,
          currentBidderUid: fb.bidderUid,
          bidCount: Math.max(0, (a.bidCount || 1) - 1),
        });
      }

      // Record the strike on the user doc.
      tx.set(db.collection('users').doc(user.uid), {
        bidStrikes: admin.firestore.FieldValue.arrayUnion({
          auctionId,
          reason: String(reason).slice(0, 200),
          at: new Date().toISOString(),
        }),
      }, { merge: true });

      return { strike: true, retractedBidId: lastBid.id };
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }
}

// ─── Cancel auction (seller, with penalty) ───────────────────────────────────
// Sellers can cancel an active auction, but it costs them: the cancellation
// fee is recorded for the admin to settle. README_v2 §5 says cancellation
// penalties exist; the exact fee is in the swibswap_project.md tier table
// (TBD when fee engine surfaces auction-cancel rates).
async function cancelAuction(req, res, user) {
  const auctionId = String(req.query?.id || '');
  if (!auctionId) return res.status(400).json({ ok: false, error: 'Missing auction id' });

  const { reason } = req.body || {};
  if (!reason || String(reason).trim().length < 5) {
    return res.status(400).json({ ok: false, error: 'A cancellation reason (5+ chars) is required' });
  }

  const db = getDb();
  const auctionRef = db.collection(COLLECTION).doc(auctionId);
  const admin = (await import('firebase-admin')).default;

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(auctionRef);
      if (!snap.exists) throw new Error('Auction not found');
      const a = snap.data();
      if (a.userId !== user.uid) throw new Error('Only the seller can cancel this auction');
      if (a.status !== 'active') throw new Error(`Auction is ${a.status} — cannot cancel`);

      // Compute cancellation penalty: 5% of current bid if bids exist, else
      // a flat ฿50. The fee is RECORDED here and collected later via Omise
      // when D1pay ships.
      const penaltyTHB = (a.currentBidTHB || 0) > 0
        ? Math.round((a.currentBidTHB || 0) * 0.05)
        : 50;

      tx.update(auctionRef, {
        status: 'cancelled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelReason: String(reason).slice(0, 500),
        cancellationPenaltyTHB: penaltyTHB,
      });
    });

    return res.status(200).json({ ok: true, status: 'cancelled' });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }
}

// ─── Cron tick — close expired auctions ──────────────────────────────────────
// Hit by Vercel's scheduled functions (vercel.json crons) every minute.
// Idempotent: walking the same expired auction twice produces the same
// terminal state. Auth via the CRON_SECRET header so accidental external
// hits can't terminate auctions.
async function tickEndingAuctions(req, res) {
  // Vercel cron sends `Authorization: Bearer ${CRON_SECRET}` automatically
  // when the env var is set on the project. For manual / curl testing we
  // also accept a raw ?secret= query param.
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return res.status(500).json({ ok: false, error: 'CRON_SECRET not configured on Vercel project' });
  }
  const authHeader = String(req.headers?.authorization || '');
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const bearer = bearerMatch ? bearerMatch[1] : null;
  if (bearer !== expected && req.query?.secret !== expected) {
    return res.status(401).json({ ok: false, error: 'Unauthorized — cron secret invalid' });
  }

  const db = getDb();
  const admin = (await import('firebase-admin')).default;
  const now = new Date();

  // Find all active auctions whose endsAt has passed.
  const expiredSnap = await db.collection(COLLECTION)
    .where('status', '==', 'active')
    .where('endsAt', '<=', now)
    .limit(50)            // process up to 50 per tick to bound execution time
    .get();

  if (expiredSnap.empty) {
    return res.status(200).json({ ok: true, closed: 0 });
  }

  const closed = [];
  for (const doc of expiredSnap.docs) {
    const a = doc.data();
    // Reserve met? Mark sold, otherwise unsold.
    const reserveMet = (a.currentBidTHB || 0) >= (a.reserveTHB || 0);
    const terminalStatus = a.currentBidderUid && reserveMet ? 'sold' : 'unsold';
    await doc.ref.update({
      status: terminalStatus,
      winnerUid: terminalStatus === 'sold' ? a.currentBidderUid : null,
      finalBidTHB: a.currentBidTHB || 0,
      closedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    closed.push({ id: doc.id, status: terminalStatus, winnerUid: a.currentBidderUid || null });
  }

  return res.status(200).json({ ok: true, closed: closed.length, items: closed });
}

// ─── GET single auction with bid history ─────────────────────────────────────
async function getAuction(req, res) {
  const auctionId = String(req.query?.id || '');
  const snap = await getDb().collection(COLLECTION).doc(auctionId).get();
  if (!snap.exists) return res.status(404).json({ ok: false, error: 'Auction not found' });
  const a = snap.data();
  const endsAtIso = a.endsAt?.toDate?.()?.toISOString?.() || a.endsAt;
  const secondsRemaining = Math.max(0, Math.floor((new Date(endsAtIso).getTime() - Date.now()) / 1000));
  const inSwibBidWindow = secondsRemaining * 1000 > SWIBBID_CUTOFF_MS;

  // Latest 50 bids in newest-first order.
  const bidsSnap = await snap.ref.collection(SUBCOLL_BIDS)
    .orderBy('placedAt', 'desc')
    .limit(50)
    .get();
  const bids = bidsSnap.docs.map((d) => {
    const b = d.data();
    return {
      id: d.id,
      bidderUid: b.bidderUid,
      amountTHB: b.amountTHB,
      isAutoBid: !!b.isAutoBid,
      placedAt: b.placedAt?.toDate?.()?.toISOString?.() || null,
      retracted: !!b.retracted,
    };
  });

  return res.status(200).json({
    ok: true,
    auction: {
      id: snap.id,
      ...a,
      endsAt: endsAtIso,
      createdAt: a.createdAt?.toDate?.()?.toISOString?.() || null,
      cancelledAt: a.cancelledAt?.toDate?.()?.toISOString?.() || null,
      closedAt: a.closedAt?.toDate?.()?.toISOString?.() || null,
    },
    bids,
    secondsRemaining,
    inSwibBidWindow,
    nextMinBidTHB: nextMinBid(a.currentBidTHB || a.startTHB - 1),
  });
}

// ─── GET list of auctions (browse feed) ──────────────────────────────────────
async function listAuctions(req, res) {
  const status = String(req.query?.status || 'active');
  const limit = Math.min(50, Math.max(1, parseInt(req.query?.limit || '20', 10)));

  let q = getDb().collection(COLLECTION).where('status', '==', status);
  // Active auctions sort by endsAt asc (ending-soonest-first), terminal
  // states sort by closedAt/createdAt desc (most-recent-first).
  if (status === 'active') {
    q = q.orderBy('endsAt', 'asc');
  } else {
    q = q.orderBy('createdAt', 'desc');
  }
  const snap = await q.limit(limit).get();
  const items = snap.docs.map((d) => {
    const a = d.data();
    return {
      id: d.id,
      title: a.title,
      type: a.type,
      cards: a.cards,
      currentBidTHB: a.currentBidTHB,
      bidCount: a.bidCount || 0,
      endsAt: a.endsAt?.toDate?.()?.toISOString?.() || a.endsAt,
      status: a.status,
      photoUrl: a.cards?.[0]?.photoUrl || null,
    };
  });
  return res.status(200).json({ ok: true, status, count: items.length, items });
}
