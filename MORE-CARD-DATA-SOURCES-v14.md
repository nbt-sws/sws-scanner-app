# Additional Card-Data Sources for SwibSwap UX

What we already pull, plus what's worth wiring in next.

---

## TIER 1 — Already integrated

| Source | What we get | Used in |
|---|---|---|
| **optcgapi.com** | One Piece card metadata (name/type/color/cost/power/life/effect) + images | `/api/op-details`, `/api/op-variants` |
| **apitcg.com** | OP secondary source for the same fields | same endpoints |
| **Bandai cardlist** (`asia-en.onepiece-cardgame.com`) | Official SAMPLE images for every printed code, including parallels with `_p1`–`_p5` suffixes | `/api/op-details`, `/api/op-variants` |
| **eBay Browse API** | Active listings | `/api/prices` |
| **eBay HTML scrape** | Sold-listings web page | `/api/ebay-sold-scrape` |
| **Frankfurter** | FX rates (free, no signup) | client-side conversion |

---

## TIER 2 — Worth adding next

### Yuyu-tei (yuyu-tei.jp)
- **Why**: canonical JP retail prices for OP-TCG + YGO-OCG. Single
  authoritative source many Japanese collectors check.
- **How**: simple HTML scraper via Apify or a self-hosted Playwright Vercel
  cron. URL pattern: `https://yuyu-tei.jp/sell/opc/s/{code}` for OP.
- **Compliance**: keep ≤ 1 req/sec, identify your bot in User-Agent,
  cache aggressively (7 days), don't redistribute bulk data.
- **Effort**: 1 day of work.

### YGOProDeck (db.ygoprodeck.com)
- **Why**: official-grade YGO card database with all printings, rarities,
  card text, tournament legality. Free, no key, generous rate limits (~20/sec).
- **How**: `GET https://db.ygoprodeck.com/api/v7/cardinfo.php?name=<card>` or `&fname=<partial>`.
- **Effort**: 4 hours when we re-enable YGO mode.

### Cardmarket (api.cardmarket.com)
- **Why**: largest European TCG marketplace. Real-time price snapshots for
  OP-TCG and YGO. Useful EU-side counterpart to eBay's US-side data.
- **How**: OAuth2 client credentials. Requires Cardmarket seller account
  ($50/yr) + API key request.
- **Effort**: 1 day including auth setup.

### TCGPlayer (api.tcgplayer.com)
- **Why**: dominant US marketplace for English OP-TCG releases. Includes
  market price + low / mid / high tiers, plus eBay-comparable sold data.
- **How**: paid API access ($500/yr base) OR scrape product pages.
- **Effort**: 2–3 days; only worth it for v15 once you have paying users.

### Card Trader API (api.cardtrader.com)
- **Why**: international marketplace with TCG + Pokemon coverage. Free tier.
- **How**: standard REST + Bearer token after signup.
- **Effort**: half day.

### Bigweb / Card Rush JP
- **Why**: major JP retailers; their published catalog prices are what
  Japanese collectors actually pay before resale.
- **How**: scraping. Both have stable URL patterns by card code.
- **Effort**: half day each.

---

## TIER 3 — Specialized

### PSA Population Reports (psacard.com)
- **Why**: How many copies of this card have been graded at each tier
  (PSA 10 / 9 / 8). Massive value signal for collectors.
- **How**: public web pages by cert number; no API. Scraping required.

### eBay Terapeak (terapeak.com)
- **Why**: eBay's own deeper analytics platform — 365 days of sold history,
  product-level trends. Officially available through Buy API once approved.
- **How**: same OAuth as Marketplace Insights.

### One Piece TCG Discord communities
- **Why**: real-time grail/value chatter, often weeks ahead of public APIs.
- **How**: Discord bot listening to specific channels (with permission),
  parsing for `[CODE]` mentions, aggregating sentiment.
- **Effort**: 2 days. Compelling differentiator.

---

## What would land first in v14

Given the cost / value ratio:

1. **Yuyu-tei scraper** → instant JP pricing for the 80% of your users
   who care about JP prints. Estimate: 1 dev day.
2. **YGOProDeck integration** → unlock YGO mode properly. Estimate: 4 hours.
3. **Marketplace Insights** approval → upgrades the entire pricing pipeline
   from "scrape" to "official API". Estimate: 5 minutes to request, days to wait.
4. **Cardmarket** if you have EU users → second day of work.

Beyond that, ROI drops fast — focus on Vault UX, RevenueCat, and TestFlight
launch instead.

---

© 2026 I1NOV · made in Bangkok
