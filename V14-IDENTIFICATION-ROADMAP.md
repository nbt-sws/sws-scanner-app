# SwibSwap v14 — Multi-TCG Identification Pipeline Roadmap

The current scanner is One Piece-only and brittle on edge cases (DON tokens,
faceless promos, low-resolution photos). This document lays out the
**user journey** for a robust multi-TCG identification flow, the
**technical pipeline** behind it, the **free + legal data sources** we can
build against, and the **phased rollout** to v14 and beyond.

Audience: us — the dev team. Updated 2026-05-19.

---

## 1. User journey (the happy path)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  [1] Open Scanner tab                                           │
│        ↓                                                        │
│  [2] Pick TCG (One Piece / YGO / Pokémon / Lorcana / Conan)     │
│        ↓                                                        │
│  [3] Pick language (JP / EN / CN / KR / FR / DE / ES …)         │
│        ↓                                                        │
│  [4] Capture (camera) OR upload (gallery)                       │
│        ↓                                                        │
│  [5] Pipeline runs in parallel  ─────────────────────────────┐  │
│      ├── Smart crop + auto-exposure                          │  │
│      ├── Vision OCR (DOCUMENT_TEXT_DETECTION)                │  │
│      ├── Vision web detection (reverse-image search)         │  │
│      ├── Vision label / web-entity detection                 │  │
│      ├── Claude Haiku multimodal scan (4 corners + full)     │  │
│      └── Perceptual hash → community-DB lookup               │  │
│        ↓                                                     │  │
│  [6] Cross-reference signals → identify card                 │  │
│        ↓                                                     │  │
│  [7] Lookup card in free TCG-specific API                    │  │
│        ↓                                                     │  │
│  [8] Confidence scoring                                      │  │
│        │                                                     │  │
│        ├── confidence ≥ 95 → auto-confirm, show result       │  │
│        ├── confidence 70-94 → show result + "Is this right?" │  │
│        └── confidence < 70  → show top 3 candidates, pick    │  │
│        ↓                                                     │  │
│  [9] User confirms → community DB updated, eBay pricing runs │  │
│      └─────────────────────────────────────────────────────────┘
```

The user only ever sees steps 1–4 and 9. Steps 5–8 happen in 2–4 seconds
behind a progress indicator.

---

## 2. Pipeline architecture (technical)

Five parallel signal extractors. Each one produces a `{ key: value, source: ‘…’, confidence: 0..1 }` tuple. A scorer combines them into a single ranked identification.

### Signal 1 — OCR (text printed on the card)

Vision `DOCUMENT_TEXT_DETECTION`. Returns the exact characters printed on
the card front. Every TCG prints a card code on the card — extracting that
code via OCR + regex is the **highest-trust** signal.

Code-format regex per TCG (already in our codebase, will expand):
| TCG       | Pattern                                  | Example         |
|-----------|------------------------------------------|-----------------|
| One Piece | `(OP\|ST\|EB\|PRB)\d{1,2}-\d{1,3}\|P-\d{1,3}`     | `OP13-051`      |
| YGO       | `[A-Z]{2,5}-(EN\|JP)\d{3,4}`              | `RA02-EN040`    |
| Pokémon   | `\d{1,3}/\d{1,3}\|SWSH\d+\|PR-\w+`        | `15/189`        |
| Lorcana   | `\d{1,3}/\d{1,3}\|\d{1,3} of \d{1,3}`     | `47/204`        |
| Conan     | `CT-\w-\d+`                               | `CT-D-001`      |

OCR also catches the **language-specific DON marker** on One Piece DON
tokens — `ドン!!カード` / `DON!! CARD` — which is what trips Haiku alone.

### Signal 2 — Reverse-image search (where this picture appears online)

Vision `WEB_DETECTION`. Returns `pagesWithMatchingImages` —
URLs of pages where Google has indexed this exact or near-exact image.

Filter to trusted hosts only:

```
onepiece-cardgame.com / .cn / asia-en / en
cardpiece.com
optcgapi.com / apitcg.com
db.ygoprodeck.com
pokemontcg.io
ravensburger.com / lorcana.com
en.bushiroad.com
```

Parse the URL + page title for the card code or character name. This is
the second-highest-trust signal because pages on Bandai's official site
canonically identify their own cards.

### Signal 3 — LLM multimodal scan (visual analysis)

Claude Haiku 4.5 with 5 image blocks (full + 4 corner zooms) and a
TCG-specific prompt with the rarity ladder, set conventions, character
roster. Best at filling in fields the OCR can't read (e.g. small rarity
stamps, foil patterns, language flavor).

### Signal 4 — Web entity / labels (high-level identity)

Vision `WEB_ENTITIES` + `LABEL_DETECTION`. Returns conceptual tags like
"One Piece (anime)", "Trading card game", "Donquixote Doflamingo". When
combined with OCR confirmation that it IS a TCG card, these tags
disambiguate which TCG / which character.

### Signal 5 — Perceptual hash (community memory)

pHash of the captured image, looked up against
`/verified_cards/{code}__{rarity}.pHash` in Firestore. If another user
has already scanned + confirmed this exact image, return their
identification immediately — zero API cost.

### Cross-reference scoring

```
final_confidence =
    0.40 × ocr_signal             # OCR'd code matches API lookup
  + 0.25 × reverse_image_signal   # web detection found trusted-host match
  + 0.15 × llm_signal             # Haiku committed with high self-reported confidence
  + 0.10 × web_entity_signal      # entities match expected character/set
  + 0.10 × phash_signal           # community-DB hit
```

If two signals agree on the same code → confidence is boosted. If signals
disagree → user is shown the top candidates with thumbnails to pick from.

---

## 3. Free + legal data sources per TCG

All sources below are **free for at least non-commercial / attributable
use**. The "ToS notes" column flags anything that affects commercial use.
Before each goes into prod we'll do a ToS read and confirm — column 4
shows the legal status as we currently understand it.

### One Piece TCG

| Source                                | Coverage                    | Auth      | ToS for commercial                                                          |
|---------------------------------------|-----------------------------|-----------|-----------------------------------------------------------------------------|
| **optcgapi.com**                      | All cards JP + EN           | None      | Community wiki, no formal ToS published — credit them prominently           |
| **apitcg.com / api/one-piece**        | All cards EN                | None      | "Free for use" per site footer — confirm before paid launch                 |
| **onepiece-cardgame.com** (Bandai JP) | Official JP cardlist + SAMPLE images | None (page scrape) | Card art is © Bandai — fair use for identification, must watermark on storage |
| **onepiece-cardgame.cn** (Bandai CN)  | Official CN cardlist + SAMPLE | None      | Same as above                                                               |
| **asia-en.onepiece-cardgame.com**     | Asian-English cardlist      | None      | Same as above                                                               |
| **cardpiece.com**                     | CN retailer with predictive search JSON | None | Public store catalog — link-back attribution                                |

Already integrated. Used in production.

### Yu-Gi-Oh!

| Source                                | Coverage                  | Auth | ToS for commercial                                              |
|---------------------------------------|---------------------------|------|-----------------------------------------------------------------|
| **ygoprodeck.com/api-guide/**         | All cards, all languages  | None | Explicitly free for commercial use with attribution (per docs)  |
| **apitcg.com / api/yu-gi-oh**         | Wraps ygoprodeck          | None | "Free for use"                                                  |
| **db.yugioh-card.com** (Konami official) | Official EN/JP database | None (scrape) | Card art © Konami — fair use rules apply                       |

Easiest TCG to add — ygoprodeck.com is unusually generous about commercial use.

### Pokémon TCG

| Source                              | Coverage             | Auth                       | ToS for commercial                              |
|-------------------------------------|----------------------|----------------------------|-------------------------------------------------|
| **pokemontcg.io**                   | All sets, all langs  | Free key for 20k req/day  | Free tier explicitly allows commercial use      |
| **api.tcgdx.net**                   | Community alt        | None                       | Open license per repo                           |
| **api.scryfall.com**                | (MtG only — not us)  | None                       | n/a                                             |

Pokémon TCG is the most polished of the free APIs. Includes high-res images and pricing data already aggregated from TCGplayer.

### Lorcana

| Source                                | Coverage      | Auth | ToS for commercial                  |
|---------------------------------------|---------------|------|-------------------------------------|
| **api.lorcana-api.com**               | All cards EN  | None | Community API, attribution preferred|
| **lorcast.com / api/v0**              | All cards     | None | Open                                |
| **ravensburger.com** (official)       | Cardlist only | None (scrape) | Card art © Disney / Ravensburger    |

### Detective Conan (Bushiroad Universus-style)

| Source                                | Coverage      | Auth | ToS for commercial                  |
|---------------------------------------|---------------|------|-------------------------------------|
| **en.bushiroad.com** (official)       | Cardlist      | None (scrape) | Card art © Bushiroad — same fair-use rule as above  |
| Community wikis (TCG.fandom)          | Patchy        | None | Per-page CC-BY-SA                  |

This is the toughest one — no clean public API exists. We'd build a
custom scraper for en.bushiroad.com's Detective Conan section.

### Pricing data

| Source                          | Use                                   | Auth      | Commercial                                                                 |
|---------------------------------|---------------------------------------|-----------|----------------------------------------------------------------------------|
| **eBay Browse API**             | Active listings                       | OAuth     | Already approved on our dev account                                        |
| **eBay Finding API**            | Sold history (limited)                | App ID    | Already approved                                                           |
| **eBay Marketplace Insights**   | Full sold history                     | Approval  | In approval queue — submitted Application Growth Check                     |
| **Mercari Japan**               | JP secondhand                         | None (scrape, link-only) | We link out; we do NOT republish their data       |
| **TCGplayer**                   | Pokémon + Lorcana prices              | Partnership required | Not free for commercial — partnership needed for paid tier      |

---

## 4. OCR strategy in detail

### Why OCR is the foundation

Every TCG card prints these elements:
- **Card code** (set abbreviation + number)
- **Card name** (in the printed language)
- **Type / category text** (Character, Spell, Trainer, etc.)
- **Effect text** (multi-paragraph rules)
- **Rarity stamp** (usually bottom-right corner)
- **Set logo + symbol**
- **For DON tokens specifically: "ドン!!カード" + "+1000"**

OCR extracts all of this in one API call. We then run TCG-specific
regex on the OCR output to find the canonical code, which becomes the
primary identifier.

### Per-TCG OCR pipeline

```
input → DOCUMENT_TEXT_DETECTION → text blob
                                     ↓
              fork into TCG-specific extractors:
              ├── OP code regex → optcgapi.com lookup
              ├── YGO code regex → ygoprodeck.com lookup
              ├── PKM number/set regex → pokemontcg.io lookup
              ├── Lorcana #/# regex → lorcana-api.com lookup
              └── Bushiroad CT-D-### regex → bushiroad scrape
                                     ↓
              best match → official artwork URL + metadata
                                     ↓
              cross-reference with LLM identification → confirm
                                     ↓
              ≥ confidence threshold → done
              < confidence threshold → show user candidates
```

### Language-aware OCR routing

Same image, different language hints produce different OCR confidence.
For known JP cards we send `languageHints: ['ja']` to Vision; for CN
cards `languageHints: ['zh-Hans']`; for EN `['en']`. The user's
language pick (step 3 of the user journey) drives this routing.

When ambiguous (auto-detect), Vision's default behavior runs all
languages and picks the highest-confidence script — fine for fallback.

### OCR-fail fallback

When OCR returns garbled / empty text (low-res photo, glare, motion
blur), we fall through to LLM + reverse-image identification. The
confidence scorer down-weights those signals proportionally. If nothing
crosses the 70% threshold, we show the candidate picker.

---

## 5. Commercial compliance checklist

Before paid launch, we need legal sign-off on each row:

- [ ] **Card artwork display** — fair use for identification; we
  watermark + attribute. Document each publisher's permitted-use policy
  for product photos.
- [ ] **API source attribution page** — visible "Powered by …" footer
  in Settings → About, listing all third-party APIs we depend on,
  with their license terms.
- [ ] **Terms of Service for SwibSwap** — explicitly states we're a
  scanner + marketplace; we don't claim ownership of card art; users
  are responsible for ensuring listings comply with their local IP law.
- [ ] **Privacy Policy** — PDPA (Thailand) + GDPR (EU) compliant; we
  already have `Privacy.js` draft.
- [ ] **Subscription value clarity** — paid features are the Vault,
  fee calculator, multi-hop chain math, KYC marketplace, advanced
  pricing — NOT the raw card data. Card data is and always will be
  free in the basic tier.
- [ ] **Rate-limit accounting** — log per-user API consumption so we
  can negotiate paid tiers if/when free tiers don't suffice at scale.
- [ ] **Card-publisher take-down workflow** — if Bandai / Konami /
  Pokémon Company / Disney ever objects to our use of their card art,
  we have a documented response + take-down process.

---

## 6. Phased rollout for v14

### Phase 1 — Identification core (2–3 weeks)

Goal: rock-solid One Piece identification with full OCR + cross-reference.

- [ ] **P1.1** `skills/ocr-extract-skill.js` — universal OCR text mining
  module. Accepts Vision OCR text + TCG hint, returns extracted
  `{ code, name, rarity, language, evidence }` tuples.
- [ ] **P1.2** TCG-specific code regex extractors in `src/lib/tcg/` —
  one file per TCG (`onepiece.js`, `ygo.js`, `pokemon.js`, etc.) with
  pattern table + parse function.
- [ ] **P1.3** Adapter layer `src/lib/tcg/lookup.js` — uniform
  `lookupCard(tcg, code)` interface that fans out to the right API.
- [ ] **P1.4** Replace the current ad-hoc `op-details.js` /
  `op-variants.js` calls with the new adapter layer. Backward-compatible.
- [ ] **P1.5** Confidence scorer `skills/confidence-scorer.js` —
  combines OCR + reverse-image + LLM + entity + pHash signals into a
  single 0–1 score.
- [ ] **P1.6** Candidate picker UI when confidence < 70%. Shows top 3
  with thumbnails + "None of these" escape hatch.

### Phase 2 — Yu-Gi-Oh! support (1 week)

Goal: prove the new architecture is TCG-pluggable.

- [ ] **P2.1** `src/lib/tcg/ygo.js` adapter — wraps ygoprodeck.com.
- [ ] **P2.2** YGO scan skill `skills/ygo-scan-skill-v2.js` —
  updated prompt with the YGO 2025+ frame styles, code regex.
- [ ] **P2.3** YGO rarity ladder data → already in
  `src/lib/rarities.js` `YGO_RARITIES`.
- [ ] **P2.4** Add YGO to the TCG picker (`tcg = 'ygo'` already
  scaffolded, currently hidden in v13).

### Phase 3 — Pokémon support (1 week)

- [ ] **P3.1** `src/lib/tcg/pokemon.js` adapter — wraps pokemontcg.io
  with our API key.
- [ ] **P3.2** Pokémon scan skill — Pokémon-specific prompt + corners.
- [ ] **P3.3** Pokémon-specific eBay query format ("Charizard 4/102
  Base Set Holo Rare Pokemon" etc.).

### Phase 4 — Lorcana + Detective Conan (1–2 weeks)

- [ ] **P4.1** Lorcana adapter via api.lorcana-api.com.
- [ ] **P4.2** Conan adapter via en.bushiroad.com scrape (rate-limit
  carefully — they're not API-first).
- [ ] **P4.3** Per-TCG visual fingerprints (Lorcana cards have a
  distinctive ink-color border, Conan has a detective-show overlay) —
  feeds into LLM prompts.

### Phase 5 — Localization expansion (1 week)

- [ ] **P5.1** Korean (`KR`) support — Korean OP releases via
  www.onepiece-cardgame.kr (when Bandai launches it).
- [ ] **P5.2** Traditional Chinese (`TW`) support — Bandai launched
  tw.onepiece-cardgame.com — we previously removed it; re-add now that
  TW market is growing.
- [ ] **P5.3** German + French + Spanish — for EU OP / YGO releases.

### Phase 6 — Trust + community (ongoing)

- [ ] **P6.1** Community correction flow — when a user edits a scan
  result, that correction gets propagated to the `/scans/{hash}` cache
  AND used to retrain confidence scoring weights.
- [ ] **P6.2** Confidence-metrics dashboard for admins — see which
  TCGs / languages have the lowest identification accuracy and
  prioritize fixes.
- [ ] **P6.3** Visual-similarity ML model — pHash + CLIP embeddings
  for image-to-image matching, used when no OCR + no API hit.

### Phase 7 — Compliance hardening (before paid launch)

- [ ] **P7.1** ToS + Privacy + attribution audit (column 6 of section 5).
- [ ] **P7.2** Rate-limit logging per user.
- [ ] **P7.3** Take-down workflow + designated agent.
- [ ] **P7.4** Subscription paywall on the value-add features
  (Vault auctions, fee calculator, multi-hop chain math, KYC marketplace).

---

## 7. Where we are today (2026-05-19)

- ✅ One Piece scanner works (JP / EN / CN)
- ✅ Vision OCR + WEB_DETECTION live (since this morning's SCN15 ship)
- ✅ DON-vision skill with OCR-first detection
- ✅ Cache versioning + cache-poison guard
- ✅ Auctions backend `/api/auctions.js` live
- ✅ Fee engine `src/lib/fees/` live with 23/23 parity tests
- ✅ Membership UI + tier-aware fee preview
- ✅ verified_cards community DB live
- ✅ pHash cache + visual learning
- ⚠ Universal OCR layer (P1.1) — exists in scan.js inline, not yet abstracted to a skill
- ⚠ TCG adapter layer (P1.3) — not started; current is one-off for OP
- ⚠ Candidate picker (P1.6) — not yet built; today we either auto-confirm or fall through to Haiku's best guess
- ⛔ YGO live (P2) — code paths exist but hidden in UI
- ⛔ Pokémon / Lorcana / Conan — not started

---

## 8. Single-paragraph elevator pitch for the v14 pipeline

> "Snap or upload any TCG card. The scanner runs Vision OCR to read the
> printed text, looks up the extracted code in the right free API for
> that TCG, cross-references against Claude Haiku's visual analysis,
> and shows you the verified card in under 3 seconds — or asks you to
> pick from the top 3 candidates if it's not sure. Works for One Piece,
> Yu-Gi-Oh!, Pokémon, Lorcana, and Detective Conan. Pricing comes from
> live eBay listings. Your collection lives in your Vault. All card art
> is sourced from the publishers' own product pages — we never claim
> ownership of any TCG IP. The free tier covers scanning + Vault; paid
> tiers add auction marketplace, multi-hop consign fees, and KYC trust."

---

© 2026 I1NOV · made in Bangkok
