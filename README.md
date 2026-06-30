# BoBoa Scanner v12

TCG card scanner, pricing, and collection manager for One Piece and Yu-Gi-Oh! cards.
Built by **I1NOV**.

## Features

- **AI Scanner** — snap any OP or YGO card, AI extracts code + name + rarity
- **Pricing** — eBay Browse API (free) + Buyee affiliate for JP prices
- **Raw / Graded** — PSA, BGS, ARS (Tokyo-based, preferred for JP cards), CGC
- **SwibsVault** — collection tracker with P/L, sold tracking, compact/expanded views
- **6 Currencies** — THB, USD, PHP, JPY, MYR, SGD (live FX via Frankfurter)
- **Cyberpunk night-viewing theme** — deep navy #0F1228, desaturated pink accents

## Quick start

```bash
npm install
cp .env.example .env.local
# edit .env.local with your API keys
npm start
```

App runs at http://localhost:3000.

## Deployment to Vercel

1. Push this folder to GitHub:
   ```bash
   git init
   git add .
   git commit -m "v12 - I1NOV"
   git remote add origin https://github.com/YourName/boboa-scanner.git
   git push -u origin main
   ```
2. Go to [vercel.com](https://vercel.com) → Add New Project → Import from GitHub
3. Select the repo. Vercel auto-detects Create React App.
4. Add environment variables (see list below)
5. Deploy

## Environment variables

Add these in Vercel → Project Settings → Environment Variables:

| Variable | Where to get it | Required? |
|----------|-----------------|-----------|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | Yes (for scanning) |
| `EBAY_APP_ID` | developer.ebay.com → Production keys | Yes (for EN pricing) |
| `EBAY_CERT_ID` | developer.ebay.com → Production keys | Yes (for EN pricing) |
| `BUYEE_AFFILIATE_ID` | buyee.jp/partner | Optional (for JP referrals) |

## Project structure

```
boboa-v12/
├── src/
│   ├── App.js          # everything: screens, theme, components
│   └── index.js        # React entry point
├── api/
│   ├── scan.js         # /api/scan - Claude Haiku vision
│   └── prices.js       # /api/prices - eBay + Buyee
├── public/
│   └── index.html
├── package.json
├── vercel.json
└── .env.example
```

## What's next

- Set up Apple Developer account ($99/year) for iOS publishing
- Set up Google Play Console ($25 one-time) for Android
- Wrap in Capacitor for native builds (`npm i @capacitor/core @capacitor/cli`)
- Integrate RevenueCat for subscription management

---

© 2026 I1NOV · made in Bangkok
