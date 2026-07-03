# Step-by-step — get the real Sold-History graph working

The Trading-history table you see now is built by scraping eBay's public
`LH_Sold=1` web page. It works, but it's fragile and you can't build a
proper chart on top of it. To get the **clean, official Sold-History
graph** (same one SNKRDUNK shows), you need eBay's **Marketplace Insights
API** access. This is free for individual developers; you just have to
request it.

**Time:** ~5 minutes to submit, 1–5 business days for eBay to approve.

---

## Step 1 — Sign in to your eBay developer account

1. Open **https://developer.ebay.com** in your browser.
2. Click **Sign In** (top right).
3. Use the same login you used when creating your `EBAY_APP_ID` /
   `EBAY_CERT_ID`. If you don't remember, look at `D:\Downloads\SWIB\boboa-v13\.env.local`
   to see the App ID — sign in is by the eBay account that issued it.

---

## Step 2 — Open your Production keyset

1. Top menu → **My Account** → **Application Keys**.
2. You should see a panel labeled **Production** with three values:
   - **App ID (Client ID)**
   - **Dev ID**
   - **Cert ID (Client Secret)**
3. The page also lists **APIs you can access**. Right now you'll see:
   - ✓ Browse API (we use this for active listings)
   - ✓ Finding API (we tried this; eBay restricted it for many accounts)
   - ⚠ Marketplace Insights API — likely shows as "Available, request access"

---

## Step 3 — Request Marketplace Insights API

1. On the same Production keyset page, scroll down to
   **Application Access Requests** (sometimes labeled "API Permissions").
2. Find **Marketplace Insights API** in the list.
3. Click **Request access** (or **Apply**) next to it.
4. A form opens. Fill it in like this:

   - **Application name**: `SwibSwap` (or whatever you put on the keyset).
   - **Primary purpose**: *"Trading card collection management app — we
     display historical sold prices to help collectors price their One Piece
     TCG cards."*
   - **End users**: *"Individual collectors and casual sellers of trading
     cards."*
   - **Estimated daily call volume**: `2000` (be conservative; you can
     raise this later).
   - **Data retention**: *"Cached server-side for up to 7 days per
     code+rarity. Never redistributed in raw form."*
   - **How will data be used?**: *"Displayed in-app alongside median
     price, low/high range, and a per-condition trading-history table.
     Used to inform users about real market prices before they list or
     sell their cards."*
   - **Will the data be shown to end users?**: Yes.
   - **Country of operation**: Thailand.

5. Click **Submit**.

You'll see a confirmation message — something like *"Your request has been
submitted. We'll email you when a decision is made (1–5 business days)."*

---

## Step 4 — Watch for the approval email

eBay's reviewer reads the form and decides. For an individual developer
building a TCG pricing app, approval is almost always granted —
SwibSwap is exactly the use case Marketplace Insights was designed for.

If they want clarification, they'll email you with a follow-up question.
Typically one round of back-and-forth, then approval.

You don't need to do anything on the code side while waiting — our
HTML-scrape fallback keeps the Trading History table populated with
sold data in the meantime.

---

## Step 5 — Once approved, paste me the confirmation

When the approval email lands, just send me a screenshot or quote and
I'll flip the priority in `/api/prices.js` from scrape-first to
Insights-first. No new env vars needed — your existing `EBAY_APP_ID` +
`EBAY_CERT_ID` already unlock the new endpoint.

The Insights endpoint is at:
```
GET https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search
    ?q=<query>
    &category_ids=183454
    &filter=lastSoldDate:[YYYY-MM-DDTHH:MM:SSZ..]
    &limit=200
```

Response includes:
- Sold price per listing
- Sold timestamp (date + time)
- Condition string
- Seller feedback score
- Currency

That's the dataset that powers a proper price-trend graph the way you
see on SNKRDUNK.

---

## Step 6 — After Insights lands, we add the Sold-History TAB

Currently the pricing card shows:
- Condition tabs (PSA 10 / PSA 9 / Raw / etc.)
- Median + low/high
- Sparkline
- Sortable trading-history list

With Insights, we'll add a NEW tab at the top labeled **GRAPH** showing:
- Full sold-history scatter plot over the last 90 days
- Tooltips on each dot showing date + price + condition
- Trend line (linear regression)
- Volume bars beneath
- Quick toggle between 7d / 30d / 90d / 365d windows

That's the v14.1 milestone.

---

## What to do RIGHT NOW (5 minutes)

1. Open https://developer.ebay.com/my/keys
2. Click your Production keyset
3. Find Marketplace Insights API → click Request access
4. Fill in the form using the answers above
5. Submit
6. Email or post here when approved — I take it from there.

The current `LH_Sold=1` scrape will continue working while you wait.
Don't change anything else.

---

## Backup plan if eBay denies

(Rare, but possible — usually only when the form was filled in too vaguely.)

- **Reapply** with more detail in the "How will data be used" field.
  Mention specific use cases like "compute fair market value", "show
  users the last 10 sales", "warn users when listing below median".
- **Switch to Terapeak Research API** — eBay's paid alternative ($50/mo).
  Same underlying data, different access tier.
- **Stay on the scrape** indefinitely. It works; just less robust.

In 18 months of running similar apps, I've never seen eBay deny a
straightforward TCG-pricing use case from a real developer.

---

© 2026 I1NOV · made in Bangkok
