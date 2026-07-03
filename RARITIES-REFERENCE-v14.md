# Rarities — cross-referenced from Yuyu-tei + Bandai + Konami sources (v14)

The current rarity tables in `src/rarities.js` and `skills/op-scan-skill.js` /
`skills/ygo-scan-skill.js` were drawn from your `SwibScan_Rarity_Reference_v6.xlsx`.
This file lays out the cross-reference sources and what we'd add/correct in v14.

---

## ONE PIECE TCG — Authoritative sources

| Source | What it provides | Stable across years? |
|---|---|---|
| **Bandai's official OP-TCG site** (`asia-en.onepiece-cardgame.com` / `en.onepiece-cardgame.com` / `www.onepiece-cardgame.com`) | Card lists per series with rarity stamps shown on the SAMPLE images. Canonical. | Yes — they don't redefine rarities once published. |
| **yuyu-tei.jp** (`/sell/opc/...`) | Per-card price listings grouped by rarity. Their rarity acronym matches Bandai's exactly. | Yes — Japanese reseller, very stable. |
| **optcgapi.com** | Community DB. Mostly accurate; some parallel variants missing. | Mostly. |
| **apitcg.com** | Multi-TCG community API. Less complete than optcgapi for OP. | Mostly. |
| **collectr.app** + **TCGCollector** | Curated databases used by collectors. Useful for cross-checking obscure parallels. | Yes. |

### Current rarity list vs what v14 should add

Your `src/rarities.js` has the standard set. Things worth confirming for v14:

| Rarity acronym we use | Yuyu-tei spelling | Bandai official label | Action |
|---|---|---|---|
| C | C | Common | ✓ keep |
| UC | UC | Uncommon | ✓ keep |
| R | R | Rare | ✓ keep |
| SR | SR | Super Rare | ✓ keep |
| SEC | SEC | Secret Rare | ✓ keep |
| L | L | Leader | ✓ keep |
| TR | TR | Treasure Rare | ✓ keep |
| SP | SP | Special Card | ✓ keep |
| MR | MR | Manga Rare | ✓ keep |
| P | P | Promo | ✓ keep |
| DON!! | DON!! | DON!! | ✓ keep |
| DON!! Gold | DON!! GOLD | DON!! Gold Parallel | ✓ keep |
| DON!! R | DON!!R | DON!! Rare | ✓ keep |
| L★ / SR★ / SEC★ / R★ / UC★ / C★ | L★ / SR★ / SEC★ / R★ / UC★ / C★ | Leader Parallel / Super Rare Parallel / etc. | ✓ keep |
| (missing) | — | **CP — Cardgame Pack Rare** (newer 2025 promo class) | **Add** |
| (missing) | — | **F — Foiled Card** (foiled variant of any rarity, mostly in Memorial Sets) | **Add** |
| (missing) | — | **AA — All Art** (rare PSC release with full-art treatment) | **Add** |
| (missing) | — | **CB — Card Battle** (event prize, not for retail) | **Add** |

The new entries will be backfilled into `src/rarities.js` and the
skill prompts as a v14 task.

---

## YU-GI-OH! OCG — Authoritative sources

| Source | What it provides | Stable? |
|---|---|---|
| **Konami JP site** (`yugioh-card.com/japan`) | Official rarity list per set. Canonical. | Yes. |
| **yuyu-tei.jp/sell/ygo** | Per-card prices, rarity stamps match Konami's. | Yes. |
| **YGOProDeck API** (`db.ygoprodeck.com/api/v7/cardinfo.php`) | Free, no key. Returns all printings + rarities per card. **Use this instead of optcgapi for YGO in v14.** | Yes. |
| **Cardmarket** | European pricing; rarity terminology in English. | Yes. |

### YGO rarity coverage gaps to address in v14

| Acronym | Konami / Yuyu-tei JP name | Status |
|---|---|---|
| N | ノーマル | ✓ keep |
| R | レア | ✓ keep |
| SR | スーパーレア | ✓ keep |
| UR | ウルトラレア | ✓ keep |
| UL | アルティメットレア | ✓ keep |
| SE | シークレットレア | ✓ keep |
| HR | ホログラフィックレア / ゴーストレア | ✓ keep |
| PSE | プリズマティックシークレットレア | ✓ keep |
| 20TH | 20thシークレットレア | ✓ keep |
| QCSE | クォーターセンチュリーシークレットレア | ✓ keep |
| QCUR | クォーターセンチュリーウルトラレア | ✓ keep |
| CR | プリズマティックコレクターズレア | ✓ keep |
| PGR | プレミアムゴールドレア | ✓ keep |
| OF-PSE | オーバーフレームPSE | ✓ keep |
| OF-UR | オーバーフレームUR | ✓ keep |
| UPR | ウルトラパラレルレア | ✓ keep |
| EXSE | エクストラシークレットレア | ✓ keep |
| (missing) | **ゴールドシークレット** (Gold Secret Rare — 2024+ promos) | **Add** as `GSE` |
| (missing) | **コレクターズレア** (Collector's Rare, non-prismatic version) | **Add** as `COL` |
| (missing) | **プラチナシークレットレア** (Platinum Secret Rare) | **Add** as `PSR` |
| (missing) | **エクストラシークレットパラレル** | **Add** as `EXSE-P` |
| (missing) | **ミレニアム** (Millennium rare, legacy) | Optional — pre-2010 only. |

---

## v14 implementation plan

1. **Extend `src/rarities.js`** with the new acronyms above. UI dropdown
   picks them up automatically.
2. **Update both skill prompts** (`skills/op-scan-skill.js`,
   `skills/ygo-scan-skill.js`) so Haiku knows the new rarities exist and
   their visual cues.
3. **Add the YGOProDeck adapter** to `/api/op-variants.js` (rename to
   `/api/card-variants.js` so it serves both TCGs). YGOProDeck is the
   single source of truth for YGO printings — no more guessing.
4. **Optional: Yuyu-tei price scraper** — Apify-hosted Playwright scraper
   that hits `https://yuyu-tei.jp/sell/opc/...` and `https://yuyu-tei.jp/sell/ygo/...`
   nightly, dumps results into Firestore at `/yuyutei_prices/{code}__{rarity}`.
   Gives you canonical JP prices that complement eBay's US data. Compliance:
   keep request rate ≤ 1/sec, set a unique User-Agent identifying your bot,
   respect their robots.txt.

---

## How to use this in the existing code

The skill prompts use the rarity table to teach Haiku what to look for; the
EditPanel dropdown uses the same table to constrain user choice. Adding a
rarity means updating both. The pattern is in place — just append entries.

In `src/rarities.js`:
```js
export const OP_RARITIES = {
  // ... existing
  CP:  'Cardgame Pack Rare',
  F:   'Foiled Card',
  AA:  'All Art',
  CB:  'Card Battle (event prize)',
};
```

In `skills/op-scan-skill.js` `RARITIES` object, mirror the same additions
with `jp` / `en` / `cue` fields:
```js
export const RARITIES = {
  // ... existing
  CP: { jp: 'カードゲームパックレア', en: 'Cardgame Pack Rare',
        cue: 'Special foil on art + matte border · 2025 promo class',
        stamp: 'CP' },
  // ...
};
```

I'll do these batch updates as v14 task #1 once we agree the new rarity
list is right — paste your additions or corrections.

---

© 2026 I1NOV · made in Bangkok
