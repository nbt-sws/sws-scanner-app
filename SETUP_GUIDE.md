# BoBoa Scanner — free-tier service setup guide

This guide walks you through signing up for every service needed to launch BoBoa Scanner to your first 10 subscribers at **$0/month** running cost. Budget for the first 6 months of operation is covered below.

---

## Cost summary at 10 subscribers

| Service | Purpose | Free tier limit | Your usage at 10 subs | Cost |
|---------|---------|-----------------|------------------------|------|
| **Vercel** | Web hosting + API routes | 100 GB-hours/mo | ~2 GB-hours | $0 |
| **Anthropic Console** | Claude Haiku vision | $5 signup credit | ~$1.50/mo | $0 (first 3 months) |
| **eBay Developer** | Price lookup API | 5,000 calls/day | ~500 calls/day | $0 |
| **Buyee Affiliate** | JP market referrals | Unlimited | Earns you money | +$4.50/mo |
| **GitHub** | Code hosting | Unlimited public repos | 1 repo | $0 |
| **Frankfurter** | FX rates | Unlimited, no signup | Daily calls | $0 |
| **Domain** | Custom URL (optional) | — | boboascanner.com | $12/yr = $1/mo |

**Total: $0/month for first 3 months, ~$2.50/mo after Anthropic credit expires, offset by Buyee affiliate earnings.**

---

## Step 1 · GitHub (2 minutes)

Host your source code so Vercel can deploy from it.

1. Go to [github.com](https://github.com) → Sign up (use your I1NOV email).
2. Create a new repository:
   - Name: `boboa-scanner`
   - Visibility: **Private** (recommended — keeps your code hidden)
   - Don't initialize with README (we have our own).
3. On your Windows PC, install Git for Windows from [git-scm.com](https://git-scm.com/download/win).
4. Open Command Prompt in the folder where you unzipped `boboa-v12`:
   ```bash
   cd C:\path\to\boboa-v12
   git init
   git add .
   git commit -m "v12 - I1NOV initial"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/boboa-scanner.git
   git push -u origin main
   ```

**Note:** When it asks for authentication, use a [Personal Access Token](https://github.com/settings/tokens) instead of password. Generate one with `repo` scope and use that as your password.

---

## Step 2 · Anthropic Console (5 minutes)

This is where you get the Claude Haiku API key for card scanning.

1. Go to [console.anthropic.com](https://console.anthropic.com) → Sign up.
2. Verify your email, then verify your phone number (required for API access).
3. Anthropic gives you **$5 free credit** on signup — no credit card needed initially.
4. Navigate to **Settings → API Keys** → **Create Key**.
5. Name it `boboa-prod` and copy the key. **Save it somewhere safe — you won't see it again.**
6. Key format: `sk-ant-api03-XXXXXXXXXX...`

**Cost math:** Claude Haiku 4.5 charges ~$0.004 per card scan. Your $5 credit = ~1,250 free scans. At 10 subscribers × 50 scans/day × 30 days = 15,000 scans/month, you'll burn through the $5 credit in about 2.5 days of full usage. **Top up $10-20 when credit runs out** — that covers you for 2-3 months.

Add a [payment method](https://console.anthropic.com/settings/billing) with a $20 auto-reload trigger so you never run out.

---

## Step 3 · eBay Developer Program (10 minutes + 2-3 day wait)

Free, official, commercial-licensed API for EN market pricing.

1. Go to [developer.ebay.com](https://developer.ebay.com) → **Join the eBay Developers Program**.
2. Use your I1NOV email. Accept the API license agreement.
3. Once logged in, go to **My Account → Application Keys**.
4. Create a **Production** keyset (not Sandbox):
   - App name: `BoBoa Scanner`
   - Description: "TCG card price lookup and collection manager"
5. You'll get three values: **App ID**, **Dev ID**, **Cert ID**. Copy all three.
6. Also under My Account → **Application Access Requests**, request access to the **Buy API** (Browse endpoint specifically). This takes 1-3 business days to approve for production use.

**Note:** While waiting for Buy API approval, you can test with Sandbox keys. The `api/prices.js` file handles both.

---

## Step 4 · Buyee Affiliate Program (10 minutes)

Free signup. Pays you 1,000 JPY (~$7) per new user referral, plus commission on purchases.

1. Go to [buyee.jp/help/affiliate](https://buyee.jp/help/affiliate) → Apply.
2. Fill out the application:
   - Referral source: "BoBoa Scanner mobile app, Thailand-based TCG collection manager"
   - Expected traffic: "100-500 clicks/month initially, growing to 5,000+"
3. Approval is manual and takes 3-7 days.
4. Once approved, you get a referral code (e.g., `I1NOV` or `BOBOA2026`).
5. Your affiliate URLs look like: `https://buyee.jp/mercari/search?keyword=XXX&ref=YOUR_CODE`.

The `api/prices.js` file already builds these URLs correctly — just set `BUYEE_AFFILIATE_ID` env variable.

---

## Step 5 · Vercel (5 minutes)

Hosts your web app + serverless API functions. This is the only piece that actually runs your app.

1. Go to [vercel.com](https://vercel.com) → Sign up with your **GitHub account** (important — enables auto-deploy).
2. Authorize Vercel to access your GitHub repos.
3. Click **Add New → Project**.
4. Import the `boboa-scanner` repository you pushed in Step 1.
5. Vercel auto-detects it as a Create React App project. Accept defaults.
6. Before clicking Deploy, click **Environment Variables** and add all four:

   | Name | Value |
   |------|-------|
   | `ANTHROPIC_API_KEY` | `sk-ant-api03-XXXX` (from Step 2) |
   | `EBAY_APP_ID` | Your App ID (from Step 3) |
   | `EBAY_CERT_ID` | Your Cert ID (from Step 3) |
   | `BUYEE_AFFILIATE_ID` | Your referral code (from Step 4) |

7. Click **Deploy**. Build takes 1-2 minutes.
8. Once deployed, you get a URL like `boboa-scanner-yd7d5.vercel.app`. Test it on your phone.

**Every future `git push` to main automatically deploys.** No manual steps needed.

---

## Step 6 · Custom domain (optional, $12/year)

Makes your app look professional. Skip this until you have paying subscribers.

1. Buy `boboascanner.com` or similar from [Namecheap](https://namecheap.com) or [Cloudflare](https://cloudflare.com/products/registrar/). Cloudflare is cheapest (at-cost pricing).
2. In Vercel → Project Settings → Domains → Add your domain.
3. Vercel gives you DNS records to add at your registrar. Paste them in.
4. Wait 10-30 minutes for propagation.

---

## Step 7 · Analytics (free, optional)

Track how many people use your app.

Add Vercel Analytics (built in, free):
1. Vercel dashboard → your project → Analytics tab → Enable.
2. No code changes needed.

For more detailed tracking (pageviews per screen), add [PostHog](https://posthog.com) — free up to 1M events/month. Sign up, get a project key, paste it into `src/index.js` above the `ReactDOM.createRoot` line:
```js
import posthog from 'posthog-js';
posthog.init('phc_YOUR_KEY', { api_host: 'https://app.posthog.com' });
```

---

## Step 8 · User authentication (free, optional for MVP)

For the first 10 subscribers, you can skip real auth and store subscription state in localStorage.

When ready for real auth, use [Supabase](https://supabase.com) — free tier supports 50,000 monthly active users:
1. Sign up at supabase.com.
2. Create project. Copy the project URL and anon key.
3. Add to Vercel env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
4. I'll wire it up in v13 when you're ready.

---

## Step 9 · Mobile app publishing (later — $99 Apple, $25 Google)

Don't do this yet. Wait until you have ~50 subscribers using the web version first.

When ready:
1. Apple Developer Program — $99/year — [developer.apple.com](https://developer.apple.com/programs/)
2. Google Play Console — $25 one-time — [play.google.com/console](https://play.google.com/console/)
3. Wrap in Capacitor: `npm install @capacitor/core @capacitor/ios @capacitor/android`
4. Build: `npx cap sync && npx cap open ios`

---

## Order of operations (day 1 to launch)

**Day 1 (today):**
- [ ] GitHub signup + push code
- [ ] Anthropic Console signup + get API key
- [ ] Buyee Affiliate application (waits 3-7 days)
- [ ] eBay Developer signup + request Buy API access (waits 2-3 days)

**Day 2-3:**
- [ ] Vercel signup + deploy with placeholder env vars (eBay can use Sandbox first)
- [ ] Test on your phone: splash → sign-in → scan a card → see AI extraction

**Day 4-7:**
- [ ] eBay approves Buy API → update env vars in Vercel → redeploy
- [ ] Buyee approves affiliate → update env var → redeploy

**Week 2:**
- [ ] Invite 5 friends to use it. Watch for bugs.
- [ ] Fix whatever breaks.

**Week 3-4:**
- [ ] Announce in a TCG Discord / Reddit community
- [ ] First paying subscribers

---

## What could go wrong (and how to fix)

**"eBay rejected my Buy API application."**
They sometimes do this on first submission. Re-apply with a link to your deployed Vercel URL so they can see the app is real. Approval usually happens on second attempt.

**"Claude Haiku costs too much."**
Add caching. Same card scanned twice should not re-call the API. I can write v13 with Redis/Supabase cache.

**"Vercel is charging me!"**
Free tier allows 100 GB-hours/month. You won't hit this with 10 subscribers. If you see a charge, go to Settings → Usage to find what's over-limit. Most common cause: a runaway function crashing and retrying infinitely.

**"Camera doesn't work in the browser."**
Vercel serves over HTTPS by default, which is required for camera access. If it still fails, check the browser console — usually a permissions issue on iOS Safari (user needs to grant camera access explicitly).

**"I'm getting CORS errors."**
The API routes in `/api/*.js` run on the same domain as the frontend, so there shouldn't be CORS issues. If you see them, you're probably hitting the API from outside the app. Not a problem for normal users.

---

## Quick checklist — everything you need

Before you start coding, collect these:

```
[ ] GitHub account created
[ ] Anthropic API key (sk-ant-api03-...)
[ ] eBay App ID + Cert ID
[ ] Buyee affiliate code
[ ] Vercel account linked to GitHub
```

Once you have all five, deployment takes about 10 minutes total.

---

© 2026 I1NOV · made in Bangkok
