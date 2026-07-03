# SwibSwap v14 — Build Plan

Synthesized from two source docs you shared today:

- `swibswap_project.md` — finalized fee engine spec (BSA tables, consign decay,
  multi-hop chain math, NBT_Rate_3_2026-05-08.json config)
- `README_v2.md` + `design_tokens_v2.json` — 5-tab unified mobile app
  architecture, auction subsystem, KYC + composite-share flow

This plan is what we build between v13.x (where we are now — scan + verify +
local vault + eBay pricing) and the actual SwibSwap.com integration.

---

## ✅ Decisions locked (2026-05-18)

| ID | Choice | Rationale |
|---|---|---|
| **D1** | Keep cyan/magenta palette | Logo stays the source of truth; no re-theming work; v13 UI ports as-is |
| **D2** | Stay on Firebase Auth | Add **LINE OAuth as a new Firebase provider** in C1; no SDK migration |
| **D3** | **React Native rewrite** | RN/Expo for iOS+Android; keep React-DOM for desktop swibswap.com web |

**Impact of D3 = React Native:**
- Capacitor wrap is **deprecated** — `capacitor.config.ts` will not ship.
- A new Expo project `swibswap-mobile/` lives **alongside** `boboa-v13/`.
- Shared code lives in `boboa-v13/src/lib/` (theme tokens, rarities, sets,
  fee engine, API client, auth helpers) — **plain JS, no DOM, no RN imports**.
- Web (`boboa-v13/src/screens/`) keeps React-DOM for desktop swibswap.com.
- Mobile (`swibswap-mobile/screens/`) is RN — bottom-sheet pattern native.
- The 5-tab nav (Scan / Vault / Browse / Auctions / Profile) is implemented
  twice: React Router on web, `@react-navigation/bottom-tabs` on mobile.
- C1 (mobile shell) is now a 3-4 week track, not 1 day. Front-loaded.

---

## Phase mapping (READMEv2 → our codebase)

Their five phases vs what we already have done:

| README_v2 Phase | Their estimate | Status today |
|---|---|---|
| **Phase 1** — SwibScan v13 (mobile foundation) | Weeks 1-2 | ✅ Effectively done — we have scan + variant picker + community DB + watermark proof + DON workflow + Vision API |
| **Phase 2** — eBay integration | Weeks 3-4 | ✅ Mostly done — Browse API + sold-listings scrape live, Marketplace Insights pending approval |
| **Phase 3** — Auth + persistent vault | Weeks 5-6 | ⚠ Partial — Firebase Auth code-wired but providers not enabled in Firebase Console; vault is persistent; KYC + LINE OAuth not started |
| **Phase 4** — SwibSwap.com integration | Weeks 7-10 | 🟡 v14 territory — auction subsystem, share-to-social composite generator, "List on SwibSwap" button |
| **Phase 5** — Subscriptions | Weeks 11-12 | 🟡 v14 territory — RevenueCat, Stripe, paywalls |

So we're effectively at the start of Phase 4. v14's first half = SwibSwap.com
plumbing + auction subsystem; second half = subscriptions + TestFlight prep.

---

## v14 task list (sequence + estimates)

Each task is sized so it lands in 1–3 deploys.

### 🅰 — SwibSwap.com plumbing (the bridge)

**A1. Port the fee engine into the React app** *(3-5 days)*
- Copy `js/calc.js`, `config.js`, `NBT_Rate_3_2026-05-08.json` from the handoff into `src/lib/fees/`.
- Convert to ES modules.
- Add `src/lib/fees/index.js` re-exporting `calc`, `calcChain`, `getBSAFee`, `getConsignRate`.
- Wire into Vault's "Mark Sold" + Scanner's "List on SwibSwap" flows so users see real fee breakdowns BEFORE confirming.

**A2. Membership tier UI** *(2 days)*
- New Settings sub-screen: "Membership" — shows current tier (User / Silver / Gold / Platinum), tier benefits, upgrade CTA.
- Tier stored on `/users/{uid}.subscriptionTier` (Firestore field already exists).
- Buy/sell affordances gated by tier (User tier = read-only; Silver+ can list/consign).
- Connects to A5 once RevenueCat is in.

**A3. New `/api/swibswap-fees.js`** *(1 day)*
- POST `{ price, buyerTier, sellerTier, txType, deliveryMode, payment, ... }` → returns full `calc()` output.
- Hides the BSA rate table server-side so the client doesn't see raw config.
- Single source of truth for fee math; both Vault (preview) + future SwibSwap.com web checkout call this.

**A4. "List on SwibSwap" button on Scanner result** *(1 day)*
- New CTA in SampleHero after a card is verified.
- Opens a sheet: choose Buy-Sell vs Auction, asking price, consign days, payment method.
- Calls A3 to show fee preview.
- Final submit creates a Firestore `/listings/{id}` doc.

**A5. Vault "Mark Sold" flow upgrade** *(2 days)*
- When marking sold, show the fee breakdown (BSA + shipping + payment fee + VAT).
- Records the realized P/L net-of-fees, not gross.
- Already logs to `/transactions` via `logSale()` — extend to include fee components.

### 🅱 — Auction subsystem

**B1. `/api/auctions.js` — auction lifecycle** *(3-4 days)*
- POST: create auction (single card / bundle / Vault Auction folder up to 18 cards).
- GET `/api/auctions/{id}` → current bid, bid history, end time, status.
- POST `/api/auctions/{id}/bid` → place bid with SwibBid proxy support.
- Cron-like: a Vercel scheduled function checks ending auctions every minute, fires `auction.ended` event.
- Hard T-5 min cutoff on SwibBid auto-bid; standard increment table after that.

**B2. Auctions tab UI** *(3-4 days)*
- New bottom-nav entry. Lists user's own auctions (active, ending, ended) + browseable auctions from other users.
- Per-auction screen: photo gallery, bid history, time-remaining ring, increment table, place-bid sheet.
- Bid retraction policy (eBay-style: 3 strikes, requires reason).
- Cancellation penalty system.

**B3. Vault Auction folder mode** *(2-3 days)*
- New Vault sub-mode: select 1-18 cards from your vault → "Create Vault Auction".
- 5×4 grid composite preview (5:7 aspect per slot — NEVER 1:1).
- Master auction + per-slot end-time pills.

**B4. Server-side composite generator** *(2-3 days)*
- New `/api/composite.js` — `sharp`-based 1080×1350 generation.
- Photo-only layout: SwibSwap logo header, slot number badges (01-18), end-time pill, master URL footer, "Details in caption ↑" hint.
- Cache `vault_auction_id → composite_url` on Firebase Storage.
- Used for FB / LINE / Messenger shares (see B5).

**B5. Share to social** *(2 days)*
- Share sheet with FB / LINE / Messenger / Copy Link.
- FB caption template with all card metadata (code, name, rarity, language, asking price per slot).
- Direct deep-links to each platform's compose flow.

### 🅲 — Mobile shell (React Native) + Auth + KYC

**C0. React Native scaffold + shared-lib extraction** *(5-7 days)*
- Create `swibswap-mobile/` as a fresh **Expo SDK 51+** project at repo root.
- Extract platform-agnostic modules from `boboa-v13/src/` into
  `boboa-v13/src/lib/` (or a sibling `packages/swibswap-shared/`):
  - `lib/theme/tokens.js` — colors, fonts, spacing (no `css` strings; just constants)
  - `lib/rarities.js`, `lib/sets.js` — already pure data
  - `lib/fees/` — fee engine (see A1)
  - `lib/api/client.js` — `fetch` wrapper to the Vercel `/api/*` endpoints
  - `lib/firebase/` — auth + Firestore helpers using `@react-native-firebase` on mobile and web SDK on web (one common signature)
- Set up monorepo-friendly imports (yarn workspaces OR direct relative imports
  during v14 — workspaces can come later).
- Configure Expo for: camera, image-picker, secure-store, file-system, sharing.
- Smoke test: Expo Go opens, shows a single SwibSwap-branded splash screen.

**C0a. RN tab navigation shell** *(2-3 days)*
- `@react-navigation/native` + `@react-navigation/bottom-tabs`.
- Five tabs: Scan / Vault / Browse / Auctions / Profile.
- Empty screen placeholders matching the cyan/magenta-on-navy palette.
- Auth gate: redirect unauthenticated users to a `SignInScreen`.

**C0b. Port Scanner to RN** *(5-7 days)*
- Use `expo-camera` (replaces web `getUserMedia`).
- Card-frame guide overlay via `react-native-svg`.
- Auto-capture via edge-contrast detection on the live preview.
- Reuse the existing `/api/scan`, `/api/quality`, `/api/op-details`,
  `/api/op-variants`, `/api/visual-match` endpoints unchanged.
- Variant picker, EditPanel, ConfirmRarityPanel — all rebuilt as RN screens
  with `react-native-modalize` (or `@gorhom/bottom-sheet`) for the sheets.

**C0c. Port Vault + Pricing + Settings to RN** *(5-7 days)*
- Vault: same Firestore listener, RN `FlatList` for folders + cards.
- Pricing: `victory-native` charts (replaces the React-DOM SVG bar chart).
- Settings: native pickers.

**C1. LINE OAuth provider for Firebase** *(1 day)*
- Firebase Console → enable LINE under custom OIDC providers.
- LINE Developer Console: create channel, get Channel ID + Secret.
- Wire `signInWithLine()` into `src/lib/firebase/auth.js`.
- Test on iOS Expo Go + Android Expo Go.

**C2. KYC flow** *(4-5 days)*
- Three states: Pending / Approved / Denied stored on `/users/{uid}.kyc`.
- RN onboarding screen: Thai ID upload (front + back + selfie) via `expo-camera` + `expo-image-picker`.
- Web fallback: file input for desktop swibswap.com.
- Admin review queue (separate web admin app — see G2).
- KYC required for: creating listings, bidding on auctions. NOT required for: browsing, watchlisting, scanning.
- AML compliance notes — keep audit log of KYC submissions.

**C3. Bottom-sheet pattern** *(in C0c via `@gorhom/bottom-sheet`)*
- Native bottom-sheet on RN, React-DOM modal on web — `<BottomSheet>` exported from `lib/components/`.
- Use for: cancel auction, retract bid, win confirmation, payment failure.

### 🅳 — Payment integration

**D1. Omise integration — PromptPay + cards** *(4-5 days)*
- Omise SDK init in client + server.
- Buyer flow: PromptPay (with 2.5% subsidy discount on fixed-price only) OR credit card (3.5% fee on subtotal).
- Auction prices LOCKED — no PP discount, both methods pay same final.
- Failure recovery: 24h grace + 3-strike system per README.

**D2. Payout flow for sellers** *(2-3 days)*
- Omise Recipient API for Thai bank transfers.
- Seller dashboard: pending payouts, completed payouts, fee breakdown.
- VAT-compliant invoice generation (Revenue Code §78/1).

### 🅴 — Subscriptions

**E1. RevenueCat integration (mobile)** *(2-3 days)*
- Wrap the React app in Capacitor before this step.
- RevenueCat SDK init in `src/subscription.js`.
- Apple App Store IAP products: silver_monthly, silver_annual, gold_monthly, gold_annual, platinum_monthly, platinum_annual.
- Google Play Console: same product IDs.
- Webhook → server → Firestore `/subscriptions/{uid}` write.

**E2. Stripe (web)** *(1-2 days)*
- For web users who don't go through App/Play Store.
- Same tier model; Stripe Customer Portal for self-service.
- Webhook → server → same `/subscriptions/{uid}` write.

**E3. Tier gating across the app** *(1 day)*
- `useSubscription()` hook reads Firestore.
- Hide / disable list-on-SwibSwap, auction creation, consign for User tier.
- Show upgrade-prompt sheet when a free user taps a gated action.

### 🅵 — Browse tab

**F1. eBay Browse + community catalog read-only feed** *(2 days)*
- Browse tab populated from a) eBay Browse API for trending OP cards
  and b) `/verified_cards` Firestore collection.
- Search + filter UI (rarity / set / language / price range).
- Tap → card detail page (the existing SampleHero, full-screen).

### 🅶 — Operational / non-feature work

**G1. Privacy Policy + Terms of Service pages** *(1-2 days)*
- `/privacy` and `/terms` routes on swibswap.com.
- Account deletion endpoint (App Store requirement).
- PDPA / GDPR compliance text per the security doc.

**G2. Admin dashboard** *(3-5 days)*
- Separate Next.js app at admin.swibswap.com.
- Server-side Firebase Admin SDK.
- KYC review queue, dispute resolution, fee adjustments, fraud flags.

**G3. TestFlight submission** *(2-3 days)*
- Apple Developer Program enrollment ($99/yr).
- Capacitor build → Xcode → archive → upload.
- TestFlight internal testing with ~10 collectors.
- Then App Store submission with PP, ToS, KYC flow live.

**G4. Push notifications** *(2 days)*
- Firebase Cloud Messaging for both iOS + Android.
- Notification copy + timing for: outbid, auction ending soon, you won, payment failed, item shipped, KYC status change.

### 🅷 — Stretch / "would be nice"

**H1. Yuyu-tei JP-price scraper** — separate Apify or self-hosted Playwright cron.
**H2. Cardmarket EU pricing** — for EU market parity.
**H3. PSA pop-report scraper** — supply-side data on grading scarcity.
**H4. Image-similarity Haiku skip** — already partially done (pHash); full CLIP embedding lookup as the upgrade.

---

## Critical implementation notes (lifted from README_v2)

These are non-negotiable per the design spec — bake them into every v14 task:

| Rule | Source |
|---|---|
| Card photo aspect ratio is **5:7 portrait** — never 1:1 square | README §1 |
| Auction prices LOCKED — no PromptPay discount on auctions | README §2 |
| Vault Auction max 18 cards (UI must disable add button at 18) | README §3 |
| Composite image generator MUST be server-side (sharp) | README §4 |
| SwibBid auto-bid cutoff T-5 min, no anti-snipe | README §5 |
| KYC required for both bidders AND sellers; browsing free | README §6 |
| CSP allowlist: cdnjs / esm.sh / cdn.jsdelivr / unpkg only | README §7 |
| Bottom-sheet pattern on mobile, centered modal on web only | README §8 |

---

## Fee engine — what to port verbatim from the handoff

These functions in `js/calc.js` should be ported as a pure module — no DOM,
no state, just inputs and outputs. The simulator is the authoritative
reference; if my React port disagrees with the simulator, the simulator wins.

| Function | Why we need it |
|---|---|
| `getBracket(price)` | Maps a THB price to one of 4 brackets |
| `getBSAFee(price, tier, bsaRates)` | Returns THB fee per party for that bracket |
| `getConsignRate(daysRemaining, C)` | Decay table lookup (Day 1 = 0.42% … Day 7 = 2.5%) |
| `calc(...)` | Full single-transaction calculation — every line item |
| `calcChain(...)` | Multi-hop consignment chain (up to 7 hops) |

`NBT_Rate_3_2026-05-08.json` is the finalized config. Import it as a static
JSON in `src/lib/fees/config.json` so the React build inlines it.

Key constants to mirror exactly:

```
shippingCharge:   ฿50    (buyer pays)
shippingCost:     ฿30    (platform pays courier)
ccFee:            3.5%   (CC processing)
ppFee:            1.0%   (PP transfer)
ppDisc:           2.5%   (PP subsidy — fixed-price only, NOT auctions)
vat:              7.0%   (on platform fee revenue only)
consignExtraRate: 2.5%   (Day 7 max)
consignPayback:   0%     (zero in this config)
auctionSellerFeeRate: 0.5 (auction sellers pay 50% of BSA)
```

Tier index: User=0, Silver=1, Gold=2, Platinum=3.

---

## What we keep from v13

Everything we've shipped survives v14:

- The Scan tab + variant picker + DON workflow + Vision API + cardpiece.com fallback
- The community DB (`verified_cards` + watermarked SAMPLE + pHash visual learning)
- The Vault dashboard (folders, P/L, profitability sparkline) — extended in A2/A5/E3
- The pricing card (All/Graded/Raw tabs, bar chart, Current Listing / Last Sold / SwibSwap.com source tabs)
- Firebase Auth + Storage + Firestore (extended with LINE OAuth + KYC in C1/C2)
- ~~The Capacitor wrap~~ (deprecated per D3 — replaced by Expo/EAS in C0)

The plan above is purely additive; no v13 features get removed.

---

## v14 launch checklist (when do we ship?)

Ready-to-ship gate for SwibSwap.com public launch:

- [ ] D1, D2, D3 decisions made
- [ ] Fee engine A1 / A3 ported + verified against the simulator
- [ ] Membership tier UI A2 working with at least mock subscription data
- [ ] Auction subsystem B1-B5 working end-to-end with two test users
- [ ] LINE OAuth (C1) + KYC (C2) flows live
- [ ] Payment D1 wired to Omise test mode + at least one successful sandbox tx
- [ ] RevenueCat (E1) configured + sandbox subscription test passed
- [ ] Privacy Policy + Terms of Service (G1) live
- [ ] TestFlight (G3) approved + 5+ internal testers shipping data back
- [ ] Marketplace Insights eBay approval through (currently pending)
- [ ] PostHog or similar analytics wired for funnel tracking

Estimated calendar time at 1 developer (you) working part-time: **8–12 weeks**.
Faster with a second dev focused on the admin dashboard / KYC review queue.

---

## Execution order (post-decisions, updated for D3 = React Native)

1. **A1 — Shared lib: fee engine** *(3 days)* — port `calc.js` / `config.js` to `src/lib/fees/` as pure ES modules. Add a Vitest harness verifying my outputs match the simulator's outputs on 20 reference inputs.
2. **A3 — `/api/swibswap-fees.js`** *(1 day)* — server-side wrapper around A1.
3. **C0 — RN scaffold + shared-lib extraction** *(5-7 days)* — Expo project, move theme/rarities/sets/firebase helpers into `src/lib/`, monorepo wiring.
4. **C0a — RN tab navigation shell** *(2-3 days)* — five-tab layout in cyan/magenta.
5. **C0b — Port Scanner to RN** *(5-7 days)* — `expo-camera`, variant picker, edit panel, all using existing `/api/*` endpoints.
6. **A5 — Vault "Mark Sold" fee preview** *(2 days)* — on web first (faster turnaround); RN follows in C0c.
7. **C0c — Port Vault + Pricing + Settings to RN** *(5-7 days)*.
8. **C1 — LINE OAuth** *(1 day)* — once auth is centralized in `lib/firebase/`.
9. **B1 + B2 — Auction backend + UI shell** *(1 week)* — `/api/auctions.js`, RN + web Auctions tab.
10. **D1 — Omise PromptPay + cards** *(1 week)* — payment infra prerequisite for auction settlement.
11. **A2 + E1 + E3 — Membership UI + RevenueCat + tier gating** *(1 week)*.
12. **C2 + G3 — KYC + TestFlight build (EAS Build, not Xcode/Capacitor)** *(1 week)*.
13. **B3 + B4 + B5 — Vault Auction folder + composite + share** *(1 week)*.
14. **G1 + G2 — Privacy/ToS + admin dashboard** *(1 week)*.
15. **Soft launch** — TestFlight (via EAS) → App Store + Play Store + swibswap.com web.

Total: **~11 weeks** at 1 dev (added ~2 weeks vs Capacitor path for the RN
port). Compresses to ~7 if a second dev takes G2 + D1 in parallel.

---

© 2026 I1NOV · made in Bangkok
