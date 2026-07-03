# V14 — One Piece TCG Progress Board (JP / EN / CN)

Last updated: 2026-05-19

This is the focused work board for One Piece TCG identification across the
three printed languages (Japanese, English, Simplified Chinese). Other TCGs
(YGO, Pokemon, Lorcana, Conan) are out of scope until OP is bulletproof.

The board is split into four columns: what's currently working in
production, what just shipped (SCN15 — OCR-first identification), what's
next for the OP pipeline, and the test matrix used to verify each change.

---

## 1. What's currently working in production

| Capability                                       | Status   | Notes |
| ------------------------------------------------ | -------- | ----- |
| Photo / camera scan upload                       | OK       | iOS Safari uses native camera input fallback |
| Language picker before each scan                 | OK       | SCN10 — modal, JP / EN / CN for OP |
| Haiku visual scan (full + 4 corner zoom-ins)     | OK       | Returns `{code, rarity, nameEn/Jp, type}` |
| Vision WEB_DETECTION → trusted-source code       | OK       | SCN9 + SCN11 — onepiece-cardgame.com/.cn, cardpiece.com, optcgapi.com, apitcg.com |
| Vision DOCUMENT_TEXT_DETECTION (OCR)             | OK       | Pulled in same Vision request as WEB_DETECTION |
| Haiku ↔ Vision cross-check                       | OK       | SCN11 — both agree → confidence floor 95 |
| Perceptual hash (pHash) community lookup         | OK       | Skips Haiku entirely when another user already scanned the same card |
| Verified-cards cross-reference                   | OK       | SAMPLE image + official metadata |
| Cache versioning                                 | OK       | Bumps invalidate stale entries |
| 200% corner-thumb zoom + wheel zoom + drag-pan   | OK       | SCN13 |
| Watermark only on vault save (not on scan view)  | OK       | SCN13 |
| eBay pricing — sold + active, multi-condition    | OK       | Query format `Name Code Rarity Set Type - Lang` |
| cardpiece.com SAMPLE images (CN)                 | OK       | Shopify predictive-search JSON API |
| Bandai SAMPLE images (JP / EN / CN)              | OK       | per-language image hosts, fallback chain |
| DON visual lookup (variant picker)               | OK       | `/api/don-cards` analytics scrape + DonVisualLookup |
| DON-specific eBay query format                   | OK       | `{Name} Don Card {variant} {setCode} - One piece {lang}` |

---

## 2. What just shipped — SCN15 (OCR-first identification)

This is the rework the user asked for. The DON-card → P-066 Boa Hancock
misidentification was caused by Haiku hallucinating a Character-card guess
on every faceless DON token, with no authoritative signal to override it.

### The fix

Vision's `DOCUMENT_TEXT_DETECTION` already runs in the same request as
`WEB_DETECTION`. We now treat the OCR text as the PRIMARY identifier — it
literally reads the printed card text. Haiku becomes a fallback.

### Components

1. **`skills/ocr-extract-skill.js`** — new pure function.
   - Input: raw OCR text + language hint.
   - Output: `{ cardCode, isDonCard, characterName, language, powerValue, donLang, signals, ocrSnippet }`.
   - Handles all three languages:
     - JP: `ドン!!カード`, `ドン!!`
     - EN: `DON!! CARD`, `DON!!`
     - CN: `咚!!卡`, `咚!!`, `DON!!`
   - Character roster of ~30+ characters with EN / JP katakana / CN simplified
     regex patterns each.
   - Card-code regex covers OP##-### / ST##-### / EB##-### / PRB##-### / P-###.
   - DON detection loosened: EITHER DON marker OR `+1000` power is enough
     (was requiring both, which rejected DON cards where `+1000` was too
     small for OCR to capture).

2. **`api/scan.js`** — wired `extractFromOcr` into the pipeline.
   - Runs immediately after Vision returns, BEFORE the Haiku/Vision cross-check.
   - Priority ladder:
     1. **OCR-extracted card code** → overrides Haiku's code, confidence floor 92.
     2. **OCR-confirmed DON marker** → forces `card.type = 'Don!!'`,
        blanks Haiku's Character name, DON-vision then enriches with
        variant + set + (web-derived) character name.
     3. **Haiku** → fallback when OCR is silent.
   - New cache-poison guard: refuses to cache when OCR says DON but final
     card is still a Character classification.
   - `ocrExtract` now surfaced on both fresh-scan and cache-hit responses
     for client-side diagnostics.
   - `CACHE_VERSION` bumped to `v14-scn15-ocr-first` → invalidates ALL
     prior caches including the Boa Hancock false positives.

3. **`skills/don-vision-skill.js`** — refactored to consume `extractFromOcr`.
   - Single canonical source of truth for OCR signals (instead of two
     parallel regex sets drifting apart).
   - OCR-derived character name (printed on the card) is now preferred
     over web-corpus name matching.
   - Confidence ladder:
     - OCR DON marker + OCR character name → base 0.85
     - OCR DON marker only (name from web) → base 0.55
     - Web-corpus fallback → base 0.25
   - Returns new fields: `tier`, `ocrSignals`, `ocrLanguage`.

---

## 3. What's next for One Piece (priority order)

### P0 — Verify the fix is real

- [ ] Re-scan the DON card photo that was returning P-066 Boa Hancock.
      Expected: with cache invalidated by version bump, scan re-runs
      against the new pipeline; OCR catches `ドン!!カード` (or
      `DON!! CARD` for EN print, `咚!!卡` for CN), `card.type` is set
      to `Don!!`, DON-vision enriches with character name from web.
- [ ] If OCR doesn't catch the DON marker on that specific photo,
      capture the raw OCR text via the `ocrExtract.ocrSnippet` field in
      the response and tune the regex set to match what Vision actually
      returns for that particular print.
- [ ] Verify three-language coverage: scan one JP DON, one EN DON,
      one CN DON, confirm all three are identified.

### P1 — Tighten OCR card-code extraction

- [ ] Confirm OCR regex catches codes printed at every position
      (top-right corner stamp vs. bottom-left for some promo prints).
- [ ] Test against blurry / glare photos — current pipeline relies on
      preprocessor enhancing exposure first, but the regex should also
      tolerate OCR drops like `OP 13-051` → `OP13-051`.
- [ ] Add character regexes for the next ~20 most-traded DON subjects
      not yet in the roster (Marco, Vista, Cavendish, Bartolomeo, etc.
      — currently in `don-vision-skill` CHARACTERS but not yet copied
      into `ocr-extract-skill` CHARACTERS).

### P2 — Cross-language character name reconciliation

- [ ] When user scans a JP card but app language is EN, `card.nameJp`
      should still be filled from OCR (current pipeline already does
      this for verified_cards hits, but not for OCR-first identifications).
- [ ] CN scan → display both Simplified CN name and canonical EN name
      in PricingResult.

### P3 — DON-card metadata enrichment

- [ ] When OCR confirms DON but DON-vision can't find a character name
      in the web corpus (image not yet indexed by Google), surface a
      "Pick the character" carousel — same UI as DonVisualLookup
      variant picker, but for character-not-yet-identified.
- [ ] When OCR finds a P-### code on a DON token (P-066 etc.),
      treat that as the canonical setCode for the DON's pricing query.

### P4 — Resilience

- [ ] Vision API quota / 403 handling — currently we return Haiku-only
      identification when Vision errors, which is exactly the scenario
      that produced the original Boa Hancock false-positive. Add a
      "low-confidence, please re-scan" banner to the UI when Vision is
      unavailable AND Haiku's identification is the only signal.
- [ ] Rate-limit handling — burst protection so a user mass-scanning a
      box of 24 packs doesn't hit Vision quota mid-session.

### P5 — Diagnostic surface for support

- [ ] In the scanner UI, behind a long-press on the Scan button, show
      the raw `ocrExtract` + `crossCheck` + `donVision` JSON. Lets
      support reproduce false positives without console access.
- [ ] `/api/diag` admin endpoint that takes an image and dumps the
      full pipeline trace.

---

## 4. Test matrix to verify each release

| # | Card                            | Lang | Expected code | Expected type | Notes |
|---|---------------------------------|------|---------------|---------------|-------|
| 1 | Donquixote Doflamingo DON Gold  | JP   | (synthetic)   | Don!!         | The OG failing case — was P-066 Boa Hancock |
| 2 | Gol D. Roger DON Gold           | EN   | (synthetic)   | Don!!         | EN DON OCR `DON!! CARD` |
| 3 | Charlotte Linlin DON            | CN   | (synthetic)   | Don!!         | CN DON OCR `咚!!卡` |
| 4 | Shanks OP01-001                 | JP   | OP01-001      | Character     | OCR-first code extraction |
| 5 | Boa Hancock P-066               | JP   | P-066         | Character     | Real P-066 (not a DON misidentification) |
| 6 | Eustass Kid ST04-002            | EN   | ST04-002      | Character     | Starter deck code |
| 7 | Trafalgar Law EB01-008          | JP   | EB01-008      | Character     | Extra-booster code |
| 8 | Crocodile PRB-01-XXX            | CN   | PRB01-XXX     | Character     | Premium-booster code in Simplified CN |
| 9 | A glare-heavy bad photo of #1   | JP   | (synthetic)   | Don!!         | Should still ID as DON via web-corpus fallback |
| 10| A blurry photo of #4            | JP   | OP01-001      | Character     | Falls back to Haiku + pHash community lookup |

Pass criteria: 10/10 identified correctly with no false positives.
Cache version bumps any time this matrix produces a new wrong answer.

---

## 5. Cache-version history (for forensics)

| Version                    | Change                                                                 |
|----------------------------|------------------------------------------------------------------------|
| `v13.4-skills`             | Pre-Vision Haiku-only baseline                                         |
| `v14-scn14`                | Parallel Vision + DON-vision rescue                                    |
| `v14-scn14-novc`           | Refused to cache when Vision unavailable                               |
| `v14-scn14-don-tight`      | Refused Haiku-only DON-suspect cache writes                            |
| `v14-scn14-ocr`            | DON-vision uses Vision OCR + OP-context check                          |
| `v14-scn15-ocr-first`      | **Current.** OCR extraction is primary identifier. Invalidates all prior. |

---

## 6. Files touched in SCN15

```
skills/ocr-extract-skill.js   (NEW — OCR signal extractor, all 3 languages)
skills/don-vision-skill.js    (refactor — consumes extractFromOcr)
api/scan.js                   (wired OCR-first; CACHE_VERSION bump)
V14-ONEPIECE-PROGRESS.md      (NEW — this document)
```
