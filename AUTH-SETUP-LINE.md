# LINE OAuth setup — v14, C1

The app code is wired. To finish C1, you need to complete two console
setups (~15 minutes total) and then test on the live deploy.

## Why LINE?

Thailand's collector community lives on LINE. Asking users to "Continue with
Google" feels foreign here — every Thai person already has a LINE account
and prefers to use it. LINE Login also gives us a profile picture and a
display name, which is enough to create a SwibSwap account without an
email step.

Apple/Google sign-in stays available for the broader audience.

## What's already in the code

- `src/firebase.js` — exports `lineProvider = new OAuthProvider('oidc.line')`
  with scopes `profile openid email`.
- `src/auth.js` — exports `signInWithLine()` mirroring the Apple/Google flows.
- `src/screens/SignIn.js` — "Continue with LINE" button at the top of the
  OAuth list (LINE first per Thai market preference).
- Mobile equivalent lands in C0c via the same provider ID through
  expo-auth-session.

Nothing in this file changes the existing Apple/Google sign-in.

## Step 1 — LINE Developer Console (one-time)

1. Sign in at https://developers.line.biz/console/ with your LINE account
2. Click **Create new provider** → name it `SwibSwap`
3. Inside the provider, click **Create a new channel** → choose **LINE Login**
4. Fill in:
   - **Channel name:** `SwibSwap`
   - **Channel description:** `TCG card scanner + marketplace`
   - **App types:** check both **Web app** and **Native app** (so you can
     reuse the same channel for mobile)
   - **Email address:** your contact email
   - Accept the LINE Developers Agreement
5. After creation, open the channel → **Basic settings** tab → copy these:
   - `Channel ID` — this is the OIDC **Client ID**
   - `Channel secret` — this is the OIDC **Client secret**
6. **LINE Login** tab → **OpenID Connect** → set **Email address permission**
   to "Granted" (so we get the user's email).
7. **LINE Login** tab → **Callback URL** → add:

   ```
   https://swibswap-prod.firebaseapp.com/__/auth/handler
   ```

   Replace `swibswap-prod` with your actual Firebase project ID (visible
   in the URL of the Firebase Console). The `/__/auth/handler` path is
   the Firebase OIDC callback — same shape regardless of which OIDC
   provider you wire up.

   For local dev, ALSO add `http://localhost:3000/__/auth/handler` (CRA
   default port). For your Vercel preview deploy, add the preview URL too.

## Step 2 — Firebase Console (one-time)

1. Open the Firebase Console → your SwibSwap project → **Authentication**
   → **Sign-in method** tab
2. Click **Add new provider** → **OpenID Connect**
3. Fill in:
   - **Provider ID:** `oidc.line` ← this MUST be exactly `oidc.line` —
     `src/firebase.js` matches on this string
   - **Provider name:** `LINE`
   - **Client ID:** Channel ID from Step 1.5
   - **Client secret:** Channel secret from Step 1.5
   - **Issuer:** `https://access.line.me`
4. Click **Save**

The provider is now live. Any signed-in `oidc.line` user will appear in
the **Users** tab of Firebase Auth with provider `oidc.line` and the
LINE display name + email.

## Step 3 — Verify

1. Open the live app (Vercel deploy or `npm start`)
2. Sign out if you're signed in
3. Click **Continue with LINE**
4. You should see LINE's consent screen → accept → you're back in the app
   signed in with your LINE profile

If the popup throws `auth/popup-closed-by-user`, the LINE callback URL
in Step 1.7 isn't matching the Firebase auth handler URL. Double-check
the URL exactly — the `/__/auth/handler` suffix is required.

## Step 4 — Mobile (deferred to C0c)

The same `oidc.line` provider works in React Native via Firebase Auth's
`signInWithCredential()` + an `expo-auth-session` flow that gets the LINE
ID token. This lands when we port the auth helpers to the mobile shell in
**C0c** — by then we'll already have an unified `lib/firebase/auth.js`
that both runtimes share.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `auth/operation-not-allowed` | OIDC provider `oidc.line` not enabled in Firebase Console (Step 2) |
| `auth/invalid-credential` | Channel secret in Firebase doesn't match LINE Developer Console |
| Popup opens then closes immediately with no error | Callback URL mismatch (Step 1.7) |
| User authenticates but `email` is undefined | LINE channel needs `Email address permission` granted (Step 1.6) |
| Browser blocks popup | Use `signInWithRedirect` instead — Firebase auth supports it with the same provider object |

## Reference

- LINE Login OIDC docs: https://developers.line.biz/en/docs/line-login/integrate-line-login/
- Firebase custom OIDC: https://firebase.google.com/docs/auth/web/openid-connect

---

© 2026 I1NOV · made in Bangkok
