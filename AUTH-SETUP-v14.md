# Firebase Auth — Google & Apple provider setup

Both providers are already wired in the code (`src/auth.js`, `src/firebase.js`,
`src/screens/SignIn.js`). What's missing is the Firebase Console enablement
plus the OAuth registrations on Google's and Apple's developer portals.

---

## Google Sign-In (10 minutes — free)

1. **Firebase Console → Authentication → Sign-in method tab.**
2. Find **Google** in the provider list. Click → toggle **Enable**.
3. Two fields to fill:
   - **Project public-facing name**: `SwibSwap` (this is what appears on the
     OAuth consent screen).
   - **Project support email**: your email address.
4. Click **Save**.
5. Test in production: open the site → "Continue with Google" → choose an
   account → you should land back in the app, signed in.

That's it. No Google Cloud Console steps needed for web sign-in — Firebase
handles the OAuth client automatically.

**For native iOS / Android via Capacitor** (when you ship the mobile build):
- Add the Firebase iOS / Android SDK config files (`GoogleService-Info.plist`
  for iOS, `google-services.json` for Android) into the Capacitor project.
- Inside Xcode for iOS, add the **reversed client ID** as a custom URL scheme
  (Info.plist → URL Types → URL Schemes). The reversed-ID looks like
  `com.googleusercontent.apps.123456789-abc...`.
- iOS-specific `@capacitor-firebase/authentication` plugin (or
  `@react-native-firebase/auth` pattern if you ever migrate) handles the
  native sign-in popup.

---

## Apple Sign-In (25 minutes — $99/yr Apple Developer Program required)

Apple is stricter. You need an Apple Developer account active before this
works in production.

1. **developer.apple.com → Certificates, Identifiers & Profiles.**
2. **Identifiers → +** → register an **App ID**:
   - Description: `SwibSwap`.
   - Bundle ID: `app.swibswap.scanner` (matches `capacitor.config.ts`).
   - Capabilities → tick **Sign In with Apple**. Save.
3. **Identifiers → + again → Services IDs** (this is what Firebase needs for
   web sign-in):
   - Description: `SwibSwap Web`.
   - Identifier: `app.swibswap.scanner.web` (or any reverse-DNS string).
   - Tick **Sign In with Apple → Configure**:
     - Primary App ID: the one from step 2.
     - Domains: `boboa-v13.vercel.app` (or your actual production domain).
     - Return URLs: `https://boboa-scanner.firebaseapp.com/__/auth/handler`
       (the firebase Auth callback URL — substitute your project ID).
   - Save.
4. **Keys → +** → register a new key with **Sign In with Apple** enabled
   and the App ID from step 2. Download the `.p8` file once — **Apple does
   not let you re-download it**.
5. **Firebase Console → Authentication → Sign-in method → Apple** → Enable.
6. Fill in the form:
   - Services ID: from step 3 (`app.swibswap.scanner.web`).
   - Apple Team ID: top-right of the Apple Developer console, 10-char string.
   - Key ID: from step 4 (10 chars).
   - Private key: open the `.p8` file in a text editor, paste the contents
     (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`).
   - Save.
7. **Verify on the live site**: open the production URL → "Continue with Apple"
   → Apple sign-in sheet appears.

**Two gotchas Apple is notorious for:**
- Apple's review process **requires** Sign In with Apple when you offer any
  other third-party login (Google, Facebook, etc.). If you ship Google
  sign-in to the App Store without Apple sign-in, your app gets rejected.
  Hence keeping both.
- The first time a user signs in with Apple, Apple shares the email
  **once**. After that they only return the user identifier. Your
  `ensureUserDoc()` in `src/auth.js` handles this — saves the email on first
  sign-in.

---

## Authorize domains (mandatory for both providers to work)

**Firebase Console → Authentication → Settings → Authorized domains.**

Make sure these are listed (anything not listed will fail sign-in):
- `localhost` (for `npm start` / `vercel dev`)
- `boboa-v13.vercel.app` (or your actual prod URL — verify in Vercel)
- `*.vercel.app` if your Firebase version supports wildcards (newer versions
  do; older ones require explicit entries). Useful for preview deploys.
- Final domain when you hook up `swibswap.com`.

Remove any entries not in that list — every authorized domain widens your
attack surface.

---

## Smoke test after enabling

After both providers are configured:

1. Visit production URL in **incognito**.
2. Try **Continue with Google** → succeed → check Firebase Console →
   Authentication → Users tab: a new entry appears.
3. Sign out.
4. Try **Continue with Apple** → succeed → check Authentication → Users:
   another entry appears (Apple uses a different uid, so this is a fresh
   account, not a merge).
5. Try the email/password form too as a third path.
6. Confirm each successful sign-in creates a `/users/{uid}` document in
   Firestore (via `ensureUserDoc()`).

If any provider fails, the browser console will print the Firebase error
code. Most common ones:
- `auth/unauthorized-domain` → you forgot step "Authorize domains" above.
- `auth/operation-not-allowed` → you forgot to toggle the provider on in
  Firebase Console → Sign-in method.
- `auth/invalid-credential` (Apple) → wrong Team ID / Key ID / private key.
  Re-check step 6 above carefully — every field is case-sensitive.

---

© 2026 I1NOV · made in Bangkok
