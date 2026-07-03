# SwibSwap — Session Handoff Brief

If you're picking this up in a new Cowork chat, read this first, then read
`PROGRESS-v14.md` for the full feature list. Files are all at
`D:\Downloads\SWIB\boboa-v13\`.

---

## What you're looking at

**SwibSwap** (formerly BoBoa Scanner v13). A One Piece TCG card scanner +
collection manager built by I1NOV / BoBoBoA420 in Bangkok. Web app on Vercel,
Firestore + Storage for data, Capacitor wrap for iOS/Android (not yet shipped).
Current version: **v13.10** approaching v14.

The user's project folder is `D:\Downloads\SWIB\boboa-v13\`. Deploy target is
`https://boboa-v13.vercel.app` (or a hash variant — check Vercel dashboard).

---

## Tech stack

- React 18 (Create React App) frontend
- Vercel serverless functions for the backend (`/api/*.js`)
- Firebase Auth (email + Google + Apple — providers need Console enablement still)
- Firestore + Firebase Storage
- Anthropic Claude Haiku 4.5 for card vision
- eBay Browse + Finding APIs + HTML scrape of sold-listings page
- Cardpiece.com scraper for CN-language card images
- Bandai's official cardlist sites for SAMPLE images
- Sharp for server-side image processing (corner crops, watermarks)

---

## Current focus areas (recent work)

1. **CN (Simplified Chinese) cards** — variant picker pulls from cardpiece.com
   first when `lang=CN` because the official .cn site is geo-restricted.
2. **Variant selection workflow** — user scans, picks a SAMPLE variant from a
   grid, confirms rarity, then pricing fires. Pinned variant can't be
   overwritten by background enrichment.
3. **eBay pricing** — sold-history HTML scrape is the primary source; Browse
   API is the fallback for active listings. Both use the same canonical query
   format: `"Name Code Rarity Set Type - One piece Lang"`.
4. **Vault rebuild** — folders, vault value, realized vs unrealized P/L,
   profitability sparkline.

---

## Key files

- `src/screens/Scanner.js` — biggest file (~1700 lines). Has the variant picker,
  ConfirmRarityPanel, SampleHero, PricingResult, TradingHistory, watermark, save
  flow. **This is the single most important file in the app.**
- `src/screens/Vault.js` — vault dashboard with folders, P/L tiles, sparkline.
- `src/sets.js` — One Piece set catalog (boosters / starters / anniversary
  promos / CN exclusives). Used by the EditPanel Set dropdown.
- `src/rarities.js` — full rarity acronym tables for both TCGs.
- `skills/op-scan-skill.js` — Haiku prompt for OP cards, including CN-specific
  example for P-066 Boa Hancock 3rd Anniversary.
- `api/scan.js` — main vision endpoint. Cache check → pHash visual lookup →
  Haiku call → community DB cross-reference.
- `api/op-variants.js` — variant picker data source (5 sources merged).
- `api/op-details.js` — SAMPLE image lookup + Firebase mirror.
- `api/cardpiece-search.js` — Shopify scrape of cardpiece.com.
- `api/prices.js` — eBay pricing pipeline (Finding → scrape → Browse).
- `api/ebay-sold-scrape.js` — robust eBay sold-listings HTML parser.
- `api/contribute.js` — community DB write with cache learning back-patch.
- `api/transactions.js` — market-event log (purchase/sale per code+rarity).

---

## Outstanding items / known issues

- **CN cards still imperfect** — Haiku sometimes misidentifies Simplified
  Chinese names. The prompt has a worked example for P-066 but accuracy
  varies. cardpiece.com is the most reliable CN image source.
- **eBay Marketplace Insights** — pending approval at developer.ebay.com.
  Until then, sold-history relies on the HTML scrape. Setup guide is in
  `EBAY-SOLD-HISTORY-SETUP.md`.
- **Google Vision API** — endpoint stubbed at `/api/visual-match.js`. Needs
  `GOOGLE_VISION_API_KEY` env var on Vercel to activate.
- **Apple sign-in** — code path works but needs Apple Developer Program
  enrollment ($99/yr) before the App ID + Services ID + Key ID are filled in
  on Firebase Console. Walkthrough in `AUTH-SETUP-v14.md`.
- **iOS deploy** — Capacitor config exists (`capacitor.config.ts`) but no
  TestFlight build yet. Awaiting Apple Developer Program signup.
- **YGO and Market tabs** — hidden in UI but code intact. Uncomment the
  TABS array entry in `src/App.js` to re-enable Market.

---

## Recent fixes (v13.10)

- Removed "None of these — keep Haiku's call" button (variant pick now mandatory).
- Added **Confirm Rarity** card after variant selection — focused dropdown to
  re-confirm or change rarity, triggers price refresh.
- Dropped CGC9 / PSA9 / BGS9 condition tabs — now only PSA10, BGS10 BL, BGS10,
  CGC10, ARS10, Lower grades, Raw.
- cardpiece.com scraper for CN-priority SAMPLE images.
- Same canonical query for sold-history AND active-listing views, plus
  side-by-side "Sold History ↗" + "Current Listings ↗" deep-links.
- Renamed pricing label from MEDIAN → CURRENT VALUE.
- v13.9 Haiku prompt has a worked example for CN Boa Hancock P-066 (code,
  Simplified Chinese name, 3rd Anniversary stamp, 区BX region marker).

---

## Things to remember when iterating

- `vercel --prod` deploys from the linked project.
- PowerShell scripts: `scripts/push-env-to-vercel.ps1` bulk-uploads `.env.local`.
- Test card library: `D:\Downloads\SWIB\boboa-v13\OP-TCG\` has ~50 photos
  organized by language / rarity.
- Logo + design language: cyan-to-magenta gradient, Orbitron display font,
  Inter body, deep navy `#0A0F2E` background. Logo files in `public/`.
- Tone the user expects: technical but conversational, never overwhelming. They
  test on iPhone Safari; HTTPS is required for live camera (LAN IP doesn't
  work, file-input fallback engages automatically).

---

## Where to pick up next

Pending in priority order:
1. Confirm Confirm-Rarity flow works end-to-end with a CN card scan.
2. Wire Google Vision API after the user adds the env var.
3. Request eBay Marketplace Insights → unlock proper Sold History graph.
4. Account-deletion endpoint (required for App Store submission).
5. RevenueCat IAP for paid tier launch.
6. iOS TestFlight build.

---

© 2026 I1NOV · made in Bangkok
