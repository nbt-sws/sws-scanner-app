# SwibSwap v14 — Roadmap

v13 shipped the core scan/grade/price/community-DB loop. v14 turns the
community DB into the primary identification path (cutting Haiku cost
dramatically) and adds the monetization + distribution rails.

---

## 1. Image-similarity lookup (Haiku-free path)

**Problem** — every scan today costs ~$0.012 of Haiku tokens. Once the
`verified_cards/contributions/{code__rarity}/` folder fills up with a few
thousand photos, we can identify cards by visual match instead.

**Plan**
- Generate a **perceptual hash** (pHash, dHash, or aHash) for every uploaded
  scan and every SAMPLE image as they land in Storage. Store the hash on the
  Firestore doc.
- New `/api/visual-lookup.js`: takes an image, computes its pHash, queries
  Firestore for docs within Hamming-distance ≤ 6 (visually identical
  threshold).
- `/api/scan.js` becomes: image-hash exact match → visual-pHash match → Haiku.
- Optional v14.2: replace pHash with **CLIP embeddings** for stronger matching
  on parallel/alt-art cards. Run a small embedding model inside the
  serverless function or pre-compute embeddings on contribution.

**Expected impact** — once `verified_cards` has 2–3k records, ~70% of scans
should resolve without a Haiku call.

---

## 2. RevenueCat IAP — subscription tiers

**Plan**
- Integrate **RevenueCat** as the unified Apple/Google IAP layer.
- Define **Free / Pro / Trader** tiers:
  - Free: 30 scans/month, basic vault, single currency.
  - Pro ($4.99/mo): unlimited scans, quality scoring, dual currency, eBay
    pricing, Mercari deep-links.
  - Trader ($14.99/mo): everything + sold-history graphs, price alerts,
    bulk-binder scanning, market trend reports.
- `src/subscription.js` hook reads RevenueCat entitlements; gate features in
  Scanner / Vault / Pricing components.
- Server-side: RevenueCat webhook → Firestore `/subscriptions/{uid}` doc → 
  rules already allow read.

---

## 3. Bulk binder / page scanning

**Problem** — scanning one card at a time is too slow for an actual
collection import.

**Plan**
- New "Scan binder page" mode in Scanner: take one photo of a 3×3 or 4×3
  binder page.
- Server-side: `sharp` detects card edges, crops 9 or 12 individual card
  images, runs each through `/api/scan` in parallel.
- UI: progress strip showing each cell as it identifies, then a single
  bulk-confirm step before everything lands in the vault.

---

## 4. Price-trend graphs + alerts

**Plan**
- Daily Vercel cron (or Firebase Functions) — for each unique
  code+rarity in the user's vault, hit `/api/prices` and snapshot the
  median into `/price_history/{code__rarity}/snapshots/{date}`.
- Vault item view gets a **30-day / 90-day / 1-year sparkline** powered
  by Recharts.
- Per-card **price alert** preference: user sets a target (e.g. "tell me
  when this hits $200"). Web push + email when crossed.

---

## 5. Mobile distribution

**iOS (TestFlight first, App Store later)**
- Apple Developer Program enrollment ($99/yr).
- Capacitor build + sign in Xcode.
- TestFlight internal testing with ~10 friends.
- After two weeks of bug-shake, submit for App Store review.

**Android**
- Google Play Console one-time $25.
- Capacitor build + sign with upload keystore.
- Internal testing track first, then open beta, then production.

---

## 6. CLIP / Embedding model for true visual recognition

**Plan**
- v14.2 stretch goal. Replace pHash with a fine-tuned CLIP-style image
  encoder.
- Pre-compute 768-dim embeddings for all `verified_cards` SAMPLE + 
  contribution images. Store as binary blob in Firestore (or a Pinecone /
  Weaviate vector DB for proper similarity search).
- Visual lookup becomes: encode incoming image → cosine-similarity search
  → top match wins.
- This handles parallel-art, JP vs EN variants, off-angle photos, partial
  occlusion — things pHash misses.

---

## 7. Yu-Gi-Oh! parity

Most v14 features apply equally to YGO. Specifically:
- Build a YGO equivalent of the `optcgapi.com` adapter — YGOProDeck API
  (already public, generous free tier).
- Mirror YGO SAMPLE images using the same `verified_cards` storage scheme.
- Test the visual-lookup path with PSE / Quarter-Century / Overframe foils
  — the highest-stakes variants for grading.

---

## 8. Pricing data quality

- **Cardmarket integration** for European pricing — Magic the Gathering
  treats Cardmarket as canonical; TCG players use it for OP / YGO too.
- **Yuyutei scraper** (Apify or self-hosted Playwright) for JP-side prices.
- **130point.com API** if/when they publish one — currently we deep-link.
- Cross-source median: pick the lowest of eBay-sold / Cardmarket / Yuyutei
  and call that the "fair" price.

---

## 9. Quality-of-life polish

- **Vault search + filters** (currently the list is just sorted by purchase
  date — needs full-text search over name / code / rarity).
- **CSV export** of the vault for tax / insurance.
- **Trade / sell flow** — pick cards in vault, generate a Mercari draft
  listing, or hand off to a Shopee/eBay seller-side import.
- **Multi-language UI** — Thai for your home market first.
- **Offline mode** — cache verified_cards locally via IndexedDB so the
  scanner works on flaky network.

---

## Suggested v14 ordering

1. **Image-similarity lookup** (#1) — biggest cost win, unblocks v14.2's
   model upgrade later.
2. **Bulk binder scan** (#3) — biggest UX win, makes onboarding much faster.
3. **RevenueCat IAP** (#2) — once #1 + #3 give you genuine value to gate.
4. **Price-trend graphs** (#4) — depends on #2's daily cron infra.
5. **Mobile distribution** (#5) — once feature set is stable.
6. **CLIP embeddings** (#6) — stretch, after #1 has hit pHash's ceiling.

---

© 2026 I1NOV · made in Bangkok
