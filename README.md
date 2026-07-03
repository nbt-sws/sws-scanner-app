# BoBoa Scanner / SwibSwap v13

TCG card scanner with Claude-Haiku vision, shared scan cache, Firebase-backed
SwibsVault, hybrid CV+AI quality scoring, and a Capacitor wrap for iOS + Android.
Built by **I1NOV**.

## What's new in v13

- **Scan cache** — Firestore-keyed by SHA-256 of the image bytes. Same physical
  card photo across all users hits the cache, saving Haiku spend.
- **Photo storage** — original scans land in Firebase Storage at `cards/{uid}/…`.
- **Quality scoring** — `sharp` extracts centering / corner / surface metrics in
  the serverless function, Haiku weighs them and returns a 1–10 grade.
- **Real auth** — email + password, Google, Apple via Firebase Auth.
- **Capacitor** — `npx cap sync` builds iOS + Android shells from the same code.

## Quick start (local dev)

```bash
cd boboa-v13
npm install
cp .env.example .env.local
# fill in Anthropic + Firebase keys
npm start
```

App runs at http://localhost:3000.

## Required environment variables

| Variable | Where to get it | Required for |
|----------|-----------------|--------------|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | scan + quality |
| `EBAY_APP_ID` / `EBAY_CERT_ID` | developer.ebay.com → Production keys | prices |
| `REACT_APP_FIREBASE_*` (6 vars) | Firebase console → Project settings → General | auth, Firestore, Storage |
| `FIREBASE_SERVICE_ACCOUNT_B64` | Firebase → Service Accounts → Generate key, then base64-encode the JSON | server-side cache + storage |
| `FIREBASE_STORAGE_BUCKET` | Same as above (`<project>.appspot.com`) | server-side image upload |

See `.env.example` for the full list with comments.

## Firebase one-time setup

1. **Create a Firebase project** at console.firebase.google.com.
2. **Enable Auth providers** → Authentication → Sign-in method: Email/Password, Google, Apple.
3. **Create Firestore database** → in Native mode, region close to your users (e.g. `asia-southeast1`).
4. **Create Storage bucket** → default settings.
5. **Push security rules**:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use <project-id>
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
6. **Service account key** → Project Settings → Service accounts → Generate new private key.
   Then:
   ```bash
   # macOS / Linux
   base64 -i ~/Downloads/service-account.json | tr -d '\n' > sa.b64
   # Windows PowerShell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Downloads\service-account.json")) | Set-Content sa.b64
   ```
   Paste the contents of `sa.b64` into `FIREBASE_SERVICE_ACCOUNT_B64` in `.env.local`
   and in Vercel's env settings.

## Deploy to Vercel

```bash
git init
git add .
git commit -m "v13"
git remote add origin https://github.com/<you>/boboa-scanner.git
git push -u origin main
```

Then in Vercel:
1. Add New Project → Import the repo.
2. Vercel auto-detects Create React App — accept defaults.
3. Add every variable from `.env.example` under Project Settings → Environment Variables.
4. Deploy.

Future `git push` to `main` auto-deploys.

## Build for iOS / Android with Capacitor

```bash
npm install
npm run build              # produces build/
npx cap add ios            # one time
npx cap add android        # one time
npm run cap:ios            # syncs + opens Xcode
npm run cap:android        # syncs + opens Android Studio
```

In Xcode / Android Studio:
- Set the bundle ID / package name (defaults `app.swibswap.scanner`).
- Sign with your Apple Developer / Google Play credentials.
- Build and submit.

## File map

```
boboa-v13/
├── api/                   # Vercel serverless functions
│   ├── _firebase-admin.js #   shared Admin SDK init + token verification
│   ├── _cache.js          #   image-hash cache helpers
│   ├── scan.js            #   POST /api/scan  — cached card identification
│   ├── quality.js         #   POST /api/quality — hybrid CV + Haiku grading
│   └── prices.js          #   GET  /api/prices — eBay + Buyee
├── src/
│   ├── App.js             # root container, tab routing, FX rates
│   ├── theme.js           # palette + currency helpers
│   ├── components.js      # Screen / Button / Pill / StatTile / Spinner
│   ├── firebase.js        # client Firebase SDK init
│   ├── auth.js            # useAuth hook + sign-in verbs
│   ├── vault.js           # useVault hook + CRUD verbs
│   ├── storage.js         # photo upload helpers
│   ├── native.js          # Capacitor camera fallback
│   ├── index.js           # ReactDOM mount
│   └── screens/
│       ├── SignIn.js
│       ├── Scanner.js
│       ├── Vault.js
│       └── Settings.js
├── public/
│   ├── index.html
│   └── manifest.json
├── firestore.rules        # collection security rules
├── firestore.indexes.json # composite indexes for vault + scans queries
├── storage.rules          # storage security rules
├── firebase.json          # firebase-tools config
├── capacitor.config.ts    # native wrap config
├── vercel.json
├── package.json
└── .env.example
```

## Deploy checklist (v13)

- [ ] `.env.local` populated with all keys
- [ ] Firebase rules deployed (`firebase deploy --only firestore:rules,storage:rules`)
- [ ] Firestore indexes deployed (`firebase deploy --only firestore:indexes`)
- [ ] `npm run build` completes without warnings
- [ ] All five Vercel env vars from `.env.example` set in Vercel dashboard
- [ ] Test on phone: sign-in → scan a card → see cache hit on second scan → save to vault → quality score
- [ ] Native: `npx cap sync` + build in Xcode/Android Studio
- [ ] (Later) RevenueCat for IAP — wired in v14

## What's still ahead (v14+)

- RevenueCat for unified Apple/Google subscription handling
- Pricing tabs (Raw / PSA / BGS / ARS / CGC) ported from v12
- Sold-tracking dashboard + monthly P/L charts
- Web push for price alerts

---

© 2026 I1NOV · made in Bangkok
