# SwibSwap — Setup walkthrough: eBay Sold-History + Google Vision API

Both setups together take ~25 minutes hands-on plus 1–5 business days waiting
for eBay's approval. Vision API is fully self-service.

---

# PART 1 — eBay Marketplace Insights API (sold-history graph)

## Why
You currently see **current listings** (asking prices) when the in-app
data is sparse, because eBay's "real sold-history" endpoint requires
an extra approval beyond your existing Browse API access. Once approved,
SwibSwap automatically switches the pricing pipeline to use it — no
new env vars, no code changes from you.

## Step 1 — Sign in to your eBay developer account
1. Open **https://developer.ebay.com** in your browser.
2. Click **Sign In** (top right).
3. Use the same eBay account that issued your existing `EBAY_APP_ID`. If
   unsure, look at `D:\Downloads\SWIB\boboa-v13\.env.local` — sign in is
   by the account that owns that App ID.

## Step 2 — Find your Production keyset
1. Top menu → **My Account** → **Application Keys**.
2. You'll see the **Production** panel with **App ID (Client ID)**,
   **Dev ID**, and **Cert ID (Client Secret)**.

## Step 3 — Request access to Marketplace Insights
1. On the same Production keyset page, scroll down to find
   **Application Access Requests** (sometimes labeled "API Permissions").
2. Find **Marketplace Insights API** in the list.
3. Click **Request access** (or **Apply** — wording varies).

## Step 4 — Fill the application form
Use this exact text (works for individual dev accounts):

- **Application name**: `SwibSwap`
- **Primary purpose**: *"Trading card collection management app — we
  display historical sold prices to help collectors price their One Piece
  TCG cards."*
- **End users**: *"Individual collectors and casual sellers of trading cards."*
- **Estimated daily call volume**: `2000`
- **Data retention**: *"Cached server-side for up to 7 days per code+rarity.
  Never redistributed in raw form."*
- **How will data be used?**: *"Displayed in-app alongside median price,
  low/high range, and a per-condition trading-history table. Used to inform
  users about real market prices before they list or sell their cards."*
- **Will the data be shown to end users?**: **Yes**.
- **Country of operation**: **Thailand**.

Click **Submit**.

## Step 5 — Wait for approval (1–5 business days)
You'll get an email when approved. If they email back asking for clarification,
just reply with more detail — typical questions are about expected volume and
whether you're a business or individual (individual is fine).

## Step 6 — Send me the confirmation
When the approval email lands, paste it (or a screenshot) into our chat.
I flip one priority constant in `/api/prices.js` and the entire pricing
pipeline starts using the new endpoint. Your existing `EBAY_APP_ID` and
`EBAY_CERT_ID` already unlock it — no new env vars needed.

The in-app sold-history graph (proper scatter plot with dates, trend line,
volume bars) will land in v14.1 about 30 minutes after approval.

---

# PART 2 — Google Cloud Vision API (image confirmation)

## Why
The `/api/visual-match.js` endpoint is stubbed and ready. When you set
`GOOGLE_VISION_API_KEY` it activates and adds an extra confidence check
on every scan: "does this photo visually match the SAMPLE image we
think it should?" Useful for catching mis-identified parallels and
flagging counterfeits.

Pricing: first 1,000 calls per month are **free**. After that it's
$1.50 per 1,000 Web Detection calls. SwibSwap won't hit that cap until
you have ~30 daily active users.

## Step 1 — Create a Google Cloud project
1. Open **https://console.cloud.google.com**. Sign in with the same Google
   account you used for Firebase.
2. Top bar → click the project dropdown (left of the search bar).
3. Click **NEW PROJECT** (top right of the dialog).
4. Project name: `swibswap-vision` (or anything).
5. Leave Organization blank if it's a personal account.
6. Click **CREATE**. Wait ~30 seconds.
7. Make sure the new project is selected in the project dropdown.

## Step 2 — Enable billing on the project
Vision API requires a billing account, even though usage is free under 1000 calls.

1. Left sidebar → **Billing**.
2. **LINK A BILLING ACCOUNT** → if you already have one (from Firebase Blaze),
   pick it. If not, **CREATE BILLING ACCOUNT** and add a credit card.
3. Confirm.

## Step 3 — Enable the Vision API
1. Top search bar → type **Vision API** → click the result.
2. On the API page, click the blue **ENABLE** button. Wait ~10 seconds.
3. The page refreshes showing **API enabled**.

## Step 4 — Create an API key
1. Left sidebar → **APIs & Services** → **Credentials**.
2. Top → **+ CREATE CREDENTIALS** → **API key**.
3. A dialog shows your new key — looks like `AIzaSy…`. **Copy it.**

## Step 5 — Restrict the API key (do this — it prevents abuse)
1. In the new-key dialog (or back in Credentials → click the key name):
2. **Application restrictions**:
   - Pick **HTTP referrers (web sites)**.
   - Add referrers:
     - `https://boboa-v13.vercel.app/*`
     - `https://*.vercel.app/*` (covers preview deploys)
     - (later) `https://swibswap.com/*`
3. **API restrictions**:
   - Pick **Restrict key**.
   - Tick only **Cloud Vision API**.
4. **SAVE**.

## Step 6 — Add the key to Vercel
1. Open **https://vercel.com/dashboard** → your `boboa-v13` project.
2. **Settings → Environment Variables → Add New**.
3. Key: `GOOGLE_VISION_API_KEY`
4. Value: paste the `AIzaSy…` string from Step 4.
5. Environments: tick all three (Production, Preview, Development).
6. **Save**.

OR run this from your project root:

```powershell
cd D:\Downloads\SWIB\boboa-v13
echo "GOOGLE_VISION_API_KEY=AIzaSyYOURACTUALKEYHERE" | Add-Content .env.local
powershell -ExecutionPolicy Bypass -File .\scripts\push-env-to-vercel.ps1
```

## Step 7 — Redeploy
```powershell
vercel --prod
```

## Step 8 — Test it
Open the live site → scan any card → in browser DevTools → Network tab,
look for the next call to `/api/visual-match`. The response should change
from:
```json
{ "ok": true, "degraded": true, "reason": "GOOGLE_VISION_API_KEY not set." }
```
to:
```json
{ "ok": true, "degraded": false, "confident": true, "labels": [...], "webEntities": [...] }
```

Once that returns, the Scanner UI can start showing a confidence badge
("Vision confirmed ✓" / "Vision uncertain — please verify"). That's v14.1.

---

# Troubleshooting

**"Vision API request returned 403"** — API key restrictions don't match the
domain the request is coming from. Either remove the HTTP-referrer restriction
during testing or add `https://*.vercel.app/*`.

**"Vision API request returned 400 INVALID_ARGUMENT"** — the base64 image is
too large. The Vision API caps single-call image size at 20 MB. Our
preprocessor already keeps images well under that.

**eBay form rejects you** — extremely rare for TCG use cases. Re-apply with
more detail on the "data use" field. Mention specific user-visible features:
"median sale price", "30-day low/high range", "per-condition tabs", etc.

---

© 2026 I1NOV · made in Bangkok
