# SwibSwap — Security & Legal Launch Checklist (v14)

Everything that must be in place before charging real money. Organized by
"do this yourself" (you, the developer) vs "Anthropic/Google/Apple require it
from anyone shipping a paid app."

---

## 1. Privacy & data handling

**You handle user PII** (Firebase Auth records: email, display name, photoURL).
Three documents are required for the App Store / Play Store and for GDPR / Thai
PDPA compliance:

| Document | Why | Where it lives |
|---|---|---|
| **Privacy Policy** | App Stores reject without it; PDPA + GDPR require it | `/privacy` route on swibswap.com |
| **Terms of Service** | Limits your liability when AI mis-identifies a card | `/terms` route on swibswap.com |
| **Cookie / tracker disclosure** | Required if you add analytics later | Either in Privacy Policy or banner |

Minimum content for the Privacy Policy:
- What data you collect (email, photos uploaded for scanning, scan results,
  purchase prices entered, sale prices entered, device info).
- Why (sign-in, scan caching, community DB, market history).
- Who you share with (Anthropic for AI scanning, Google Cloud for hosting,
  eBay/Mercari for price lookups — but you don't send PII to those).
- How long you keep it (vault data: until user deletes account; scans cache:
  90 days then auto-purge).
- User rights (export, deletion, correction). PDPA + GDPR require these
  be honored within 30 days.
- DPO contact email (yours).

Templates: termsfeed.com or iubenda.com auto-generate these for ~$70–$120
one-time. Custom legal review for Thai jurisdiction adds $200–$500.

**Account deletion endpoint is mandatory** as of 2024 for App Store:
- Sign-in screen needs a "Delete my account" link.
- It must: delete `/users/{uid}`, all `/vault/{*}` where userId == uid, and
  the user's auth record. Subscriptions handled separately via RevenueCat.
- 30-day grace window with email confirmation is best practice.

I'll generate a draft for this — say the word.

---

## 2. Firebase security audit

Run these checks before going public.

- [ ] **Firestore rules** — confirm the rules file matches what's deployed:
  ```
  firebase deploy --only firestore:rules
  ```
  Then in Firebase Console → Firestore → Rules → "Rules Playground" simulate:
  - Unauthenticated read of `/users/{someoneElse}` → must DENY.
  - Authenticated read of `/vault/{otherUserItem}` → must DENY.
  - Authenticated write of `/transactions/{x}` → must DENY (server-only).
  - Authenticated write of `/verified_cards/{x}` → must DENY.

- [ ] **Storage rules** — confirm `cards/{uid}/*` is owner-only and
  `verified_cards/*` is public-read.

- [ ] **API key restrictions** — In Firebase Console → Project Settings →
  General → "Web API Key" → click the key in Google Cloud Console:
  - HTTP referrers restrictions: lock to `*.vercel.app/*`,
    `*.swibswap.com/*`, `localhost:3000/*`.
  - API restrictions: limit to Firebase Auth, Firestore, Storage, Frankfurter
    (none — public CDN).

- [ ] **Service account scope** — the `FIREBASE_SERVICE_ACCOUNT_B64` you put
  in Vercel must only have these roles in Google Cloud → IAM:
  - Firebase Admin SDK Administrator Service Agent (default).
  - Storage Object Admin (default).
  Anything broader is overkill and a leak risk.

- [ ] **Authorized domains for Auth** — Firebase Console → Authentication →
  Settings → Authorized domains. Only entries that should be there:
  - `localhost`
  - `*.vercel.app` (during testing)
  - your final production domain
  Remove anything else.

---

## 3. Third-party APIs — license + ToS compliance

| Service | Bills you | Risk |
|---|---|---|
| **Anthropic Claude Haiku** | Pay-as-you-go on your console. Already in your name; if you're a sole proprietor in Thailand this is fine. | None as long as you don't claim Anthropic "endorses" SwibSwap. |
| **eBay Developer (individual account)** | **Free; no billing required for Browse/Finding API at current call volumes.** | Limited: individual accounts cap at lower rate limits and lack some sold-history endpoints. eBay does NOT prohibit using their API in a paid app — read the [API License Agreement](https://developer.ebay.com/api-license-agreement). |
| **Mercari Japan** | We only deep-link to their search URL — no API call. Compliant. | Don't scrape their actual price data; that's against ToS. |
| **optcgapi.com / apitcg.com** | Community APIs, free, no auth required. | Both have rate limits (~60 req/min). Cache aggressively. |
| **Bandai (onepiece-cardgame.com)** | We embed their card images for SAMPLE display. | **Fair-use territory.** Card-images are marketing materials Bandai distributes freely. We don't claim ownership, we credit them, and we use them for identification (not for sale). This is the same pattern Collectr, Manabox, and TCGPlayer use. Document the policy clearly in your Terms. |
| **Frankfurter** | Free FX rates, public API, no signup. | None. |
| **Google Cloud Vision** | Pay-as-you-go ($1.50/1000 Web Detection calls; 1000/month free). | Standard Google ToS. |

**eBay-specific note for individual developers**: the API License Agreement
explicitly allows commercial use including paid apps. Your account being
billed as an individual rather than a business affects only how eBay invoices
**you** for any usage above their free tier — it doesn't restrict what you
can build. Once SwibSwap.com is a registered LLC / sole prop, you can
migrate the eBay account to business; until then, your current setup is fine.

---

## 4. Subscription billing (RevenueCat path, recommended)

When you're ready to charge:

1. **RevenueCat** is the unified Apple/Google/Stripe layer. Free up to
   $2,500/mo of tracked revenue.
2. **Apple Developer Program** ($99/yr) — required for App Store IAP.
   Bank account in your name as a sole proprietor works for Thailand.
3. **Google Play Console** ($25 one-time) — required for Play Store IAP.
4. **Stripe** (optional web-only fallback) — needs a business entity for
   Thailand. Until you incorporate, route Thai users to App/Play Store
   subscriptions only.

**Tax**: Apple and Google withhold and remit VAT on your behalf for most
jurisdictions, including the EU and Thailand. You report the net payout as
income on your Thai personal tax return until you incorporate.

**Refund policy** — required text:
- 7-day no-questions refunds for the first subscription period.
- Cancellations effective at end of current billing period.
- No refunds for partial months after first period.

---

## 5. App store submission readiness

Before submitting to TestFlight / Play Store internal testing:

- [ ] Privacy Policy URL live and reachable.
- [ ] Terms of Service URL live and reachable.
- [ ] Account-deletion flow tested end-to-end.
- [ ] App icon (we have it — `public/logo512.png`).
- [ ] 6.5" iPhone screenshot bundle (5 minimum) showing main flows.
- [ ] Short + long app description.
- [ ] Age rating: 4+ (TCG content, no gambling, no mature).
- [ ] **Content rights disclaimer** — confirm in the App Store review notes
  that "Card images shown are publicly-distributed marketing materials from
  Bandai/Konami used for identification purposes only. We do not claim
  ownership."

---

## 6. Operational security

- [ ] **Rotate** `ANTHROPIC_API_KEY` every 90 days. Set a calendar reminder.
- [ ] **Rotate** `EBAY_CERT_ID` every 12 months.
- [ ] **Rotate** `FIREBASE_SERVICE_ACCOUNT_B64` every 6 months (in Firebase
  Console → Service Accounts → "Manage all service account keys").
- [ ] **Audit logs** — enable Firebase Audit Logs in GCP for sensitive
  operations (auth events, security-rule denials, admin-SDK calls).
- [ ] **Rate limiting** — Vercel functions have built-in soft limits but
  add explicit per-uid rate limits on `/api/scan`, `/api/quality`,
  `/api/contribute`, `/api/transactions` (max 30/min per user) before
  launching. v14 task.

---

## 7. Pre-launch sanity test (run this whole sequence)

1. Open production URL in incognito mode.
2. Create a fresh account.
3. Scan a card. Confirm: variant selection appears → pick one → SAMPLE shows
   in hero → pricing query uses "Name Code Rarity Lang" format → SOLD HISTORY
   or ACTIVE LISTINGS appears.
4. "Save to community database" → enter purchase price + currency → confirm.
   Check Firestore: `/verified_cards/{code}__{rarity}` doc exists, AND a
   sibling `/contributions/` doc, AND `/transactions/` has a `purchase`
   event.
5. Vault tab: confirm "VAULT VALUE" gradient card shows the total.
6. Mark an item "sold" with a price. Confirm `/transactions/` gets a `sale`
   event.
7. Market tab: search the code+rarity. Confirm graph + recent list
   include both events.
8. Sign out. Try to access any `/api/*` endpoint that requires auth without
   a token. Confirm 401 or empty response.
9. Sign in as a second user. Confirm you cannot see the first user's vault.
10. Run `npm audit` and `firebase deploy --only firestore:rules,storage` one
    more time.

Once that whole sequence runs clean, you're production-ready for paid
subscriptions on the App Store / Play Store.

---

© 2026 I1NOV · made in Bangkok
