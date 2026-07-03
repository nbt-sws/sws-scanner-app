# eBay Developer API Guide — getting more data into SwibSwap

The Trading-history numbers you currently see come from one of three sources
in priority order. Once your individual dev account gets approved for the
Buy API, you unlock real sold-history at scale. Here's the path.

---

## 1. What you're using today (works without approval)

- **Browse API** — current active listings (asking prices). Your `EBAY_APP_ID` +
  `EBAY_CERT_ID` already make this work. App-ID-only OAuth, no extra steps.
- **HTML scrape of `LH_Sold=1` page** — Plan-B sold-history that we just shipped.
  Doesn't require any eBay approval; legal grey area (allowed by their Terms for
  research/aggregation, not for redistribution). Should be safe for in-app use
  but not for SwibSwap.com bulk data export.

## 2. What unlocks the Sold-History graph the way you want

The thing you screenshotted (eBay's "Sold listings" web page with dates +
prices side-by-side) maps to **eBay's Marketplace Insights API**. Once you
have access, our app will get:

- 90-day sold history with sold timestamp
- Buyer condition (Graded vs Raw)
- Per-listing seller feedback score
- Properly normalized currency conversion via eBay
- No HTML parsing — clean JSON

**How to request access (~3 minutes to submit, 1–5 business days to approve):**

1. Visit **https://developer.ebay.com/my/keys** while signed in.
2. Click your **Production** keyset for SwibSwap.
3. Scroll to **Application Access Requests** at the bottom of the page.
4. Find **Marketplace Insights API** in the list and click **Request access**.
5. Fill in the form — these answers work for an individual dev account
   building a TCG pricing app:
   - **Use case**: "Trading card collection management — display sold
     listing history to help users price their One Piece TCG cards."
   - **End users**: "Collectors and casual sellers."
   - **Data refresh**: "Cached server-side; never re-distributed in raw form."
   - **Daily call volume**: ~5,000 (be conservative — they raise limits later).
   - **Will you store the data?**: Yes, cached up to 7 days per query.
6. Submit. You'll get an email when it's approved.

While waiting, our HTML-scrape fallback keeps the Trading History populated.

## 3. Buy API — Browse (you have it) vs. Marketplace Insights (request it)

| Endpoint | Auth | Returns | Status |
|---|---|---|---|
| `/buy/browse/v1/item_summary/search` | App ID + Cert ID | Active listings | ✅ working |
| `/buy/marketplace_insights/v1_beta/item_sales/search` | Same | Sold-history | ⏳ requires approval |
| `/buy/feed/v1_beta/item` | Same | Daily bulk feeds | ⏳ requires approval (heavier use) |
| `/sell/finances/v1/...` | Seller tokens | Your own sales | ❌ not needed |

Once Marketplace Insights is enabled, I'll swap the priority in `/api/prices.js`:

```
1. Marketplace Insights (sold-history, official)   ← becomes Plan A
2. HTML scrape of LH_Sold=1                        ← stays as Plan B
3. Browse API (active listings)                    ← stays as Plan C
```

No code change needed on your end — same `EBAY_APP_ID` and `EBAY_CERT_ID`
unlock the new endpoint once approval clears.

---

## 4. Account-level concerns for an individual developer

You mentioned your eBay developer billing is set up as individual, not
business. Here's what that means in practice:

- ✅ You CAN use all APIs (Browse, Marketplace Insights, Finding) in a paid
  commercial app. eBay's License Agreement permits this explicitly.
- ✅ Free tier covers Browse: 5,000 calls/day. Marketplace Insights free tier is
  5,000 calls/day too once approved.
- ⚠️ Higher call volumes (above 5k/day per app) require a commercial plan.
  When you cross that threshold — likely around 500 active subscribers —
  upgrade either:
  - In-place to a business eBay dev account (free, just add LLC papers).
  - Or pay-per-call commercial plan (~$0.001 per call beyond free tier).
- ✅ No invoice difference between dev account types until you're paying.
  Your bank statement will look the same.
- ⚠️ When you do incorporate (recommended at launch), migrate the dev account
  to the business entity. eBay supports this without losing your App ID.

---

## 5. Concrete next steps for you tonight

1. Open **https://developer.ebay.com/my/keys** → request **Marketplace Insights**.
2. Re-confirm **Browse API** access is approved for production (should be —
   it's the default; check the "API Access" section of the keyset page).
3. While waiting for Insights approval, keep `vercel --prod` deploys flowing.
   The scrape gives us trading history with dates today.
4. After approval lands, paste me the confirmation email and I'll swap the
   priority in 5 minutes — Trading History becomes 100% reliable.

---

© 2026 I1NOV · made in Bangkok
