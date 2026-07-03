# SwibSwap — Progress Board

Updated through v13.7 (May 2026). Each entry is something already shipped
in `D:\Downloads\SWIB\boboa-v13\`.

---

## CORE PIPELINE

### Scanner / AI
- [x] Claude Haiku 4.5 vision card scan (`/api/scan`)
- [x] Multi-image scan (full + 4 corner zoom-ins) for rarity detection
- [x] OP + YGO skill prompts encoding the 3-step workflow from Skill1/2 PNGs
- [x] Exact image-hash cache (`/scans/{sha256}`)
- [x] Perceptual hash (pHash) for visual learning across slight angle changes
- [x] User-correction cache patch — saving a corrected card writes back to /scans
- [x] Verified_cards cross-reference enrichment on cache hits
- [x] "Re-scan" button to force-bypass cache when needed
- [x] Edit-fields panel with rarity / type / language dropdowns
- [x] **YGO hidden in UI** (code paths still present for re-enabling)

### Card photo capture
- [x] Web getUserMedia camera with card-frame guide and auto-capture
- [x] iOS Safari fallback via `<input capture="environment">`
- [x] Capacitor native camera handoff when running inside the iOS/Android shell
- [x] Highest-resolution requests (4K ideal) + continuous autofocus

### Variant selection
- [x] `/api/op-variants` — pulls from verified_cards + optcgapi + apitcg + Bandai direct URLs
- [x] Bandai fan-out across 3 hostnames × 10 suffixes (_p1 through _p5, _alt, _aa, _f, _r)
- [x] `/api/proxy-image` to bypass CDN hot-link rejections
- [x] **Pinned variant pick** — user's choice can't be overwritten by background enrichment
- [x] Grid UI showing 2–5 SAMPLE images per code

### Quality scoring
- [x] `/api/quality` — sharp-based CV (centering / corners / surface) + Haiku final grade
- [x] Subscores + PSA-style tier estimate ("PSA 8-9 candidate" etc.)

### SAMPLE images
- [x] `/api/op-details` — multi-source (optcgapi, apitcg, Bandai direct)
- [x] Auto-mirror to Firebase Storage at `verified_cards/{code}__{rarity}.jpg`
- [x] Collectr-style hero display with full metadata

### Community database
- [x] `/api/contribute` — saves verified card record with metadata-rich filename
- [x] `verified_cards/{code}__{rarity}` Firestore docs
- [x] `verified_cards/{key}/contributions/{auto}` history subcollection
- [x] pHash stored on every contribution for fuzzy-match v14
- [x] Cache learning loop: contribute → /scans patched → next scan returns correction

---

## PRICING

- [x] eBay Finding API (sold history) — primary source when account has access
- [x] eBay web-page scrape (`/api/ebay-sold-scrape`) — Plan B for individual dev accounts
- [x] eBay Browse API (active listings) — Plan C with amber "ACTIVE LISTINGS" label
- [x] Query format: `{Name} {Code} {English Rarity} {Language}`
- [x] Condition tiers parsed from titles (PSA 10 / 9 / 8↓ / BGS 10 / 9.5 / 9 / 8↓ / CGC / ARS / Raw)
- [x] SNKRDUNK-style UI with condition tabs + median + low/high
- [x] Sparkline of sold-price trajectory
- [x] Direct "View Full Sold History on eBay" deep-link button
- [x] Currency switcher (USD / JPY / THB / SGD / MYR / PHP) per-card
- [x] **Trading history with SORT button** (Date ↓↑ / Price ↓↑) and visible dates
- [x] **Mercari Japan hidden** (backend still returns URLs)

---

## VAULT

- [x] Firestore-backed SwibsVault tied to user uid
- [x] **Folder system** — items grouped by user-defined folder, "All" default
- [x] **Vault Value hero** — current 30-day median × FX, primary currency
- [x] **Realized vs Unrealized P/L tiles** — split between sold and held
- [x] **Profitability sparkline** — cumulative paid vs cumulative value
- [x] Per-item move-to-folder dropdown, mark-sold, delete
- [x] Purchase date picker
- [x] 30-day median computed at save time and stored as `vaultValue`
- [x] Auto-log to `/transactions` on save (purchase) and mark-sold (sale)

---

## DESIGN SYSTEM

- [x] SWIBSWAP logo extracted, manifest icons + favicon generated
- [x] Cyan→magenta gradient palette pulled from the logo
- [x] Orbitron display font + Inter body (Google Fonts)
- [x] Top header with logo, glassy backdrop blur
- [x] Bottom TabBar with cyan-accent active state
- [x] All buttons use Orbitron uppercase to match the tabs
- [x] Variant grid, watermark proof, DON visual lookup, pricing card UX

---

## INFRASTRUCTURE

- [x] Vercel serverless function setup (`/api/*`)
- [x] Firebase Firestore + Storage with security rules
- [x] Firebase Auth: email/password, Google, Apple (provider enablement instructions in `AUTH-SETUP-v14.md`)
- [x] PowerShell `push-env-to-vercel.ps1` to bulk-upload env vars
- [x] `.env.example` + `.env.local.template`
- [x] Per-route `vercel.json` config
- [x] Capacitor config for iOS + Android (`capacitor.config.ts`)
- [x] Server-side image proxy (`/api/proxy-image`) with allowlist
- [x] eBay Finding + Browse + scrape APIs in production
- [x] Google Vision API stub (`/api/visual-match`) — needs env var to activate

---

## SAFETY / COMPLIANCE

- [x] `SECURITY-LEGAL-v14.md` — full pre-launch audit including ToS, Privacy Policy,
      eBay individual-dev limits, Firestore rules verification
- [x] `AUTH-SETUP-v14.md` — Google + Apple provider enablement walkthrough
- [x] `RARITIES-REFERENCE-v14.md` — Yuyu-tei / Bandai / Konami cross-references
- [x] Firestore rules audited via Rules Playground
- [x] Account-deletion flow design (still needs to be built — see CHECKLIST below)

---

## CURRENTLY DEFERRED (hidden in UI, code paths intact)

- [ ] Yu-Gi-Oh! TCG mode (skill prompts done, UI commented out)
- [ ] Market tab (transaction graphs) — `/api/transactions` works, UI tab hidden
- [ ] Google Vision API match — endpoint exists, no key set yet
- [ ] Yuyu-tei scraper — research done, not implemented
- [ ] DON card visual workflow — code path exists, only triggers when rarity = DON*

---

## OPEN FOR v14 — TO DO

- [ ] **Account-deletion endpoint** (legally required for App Store submission)
- [ ] **Daily Vault Value refresh** — Vercel cron + price snapshots in `/price_history`
- [ ] **eBay Buy API approval** request through developer.ebay.com
- [ ] **Yuyu-tei nightly scraper** for JP-side prices
- [ ] **Bulk binder scan** — 3×3 / 4×3 page detection + parallel scans
- [ ] **Privacy Policy / ToS pages**
- [ ] **RevenueCat IAP**
- [ ] **TestFlight submission**

---

© 2026 I1NOV · made in Bangkok
