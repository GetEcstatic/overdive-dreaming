# iOS PWA login fix — custom Firebase auth domain

**Why:** iOS standalone PWAs lose auth state when Firebase's OAuth handler lives on `*.firebaseapp.com` (third-party cookie / cross-site iframe restrictions). Hosting the auth handler on a subdomain of `overdive.app` makes it same-site, fixing the redirect round-trip.

## What is already done in this repo

- `firebase.json` now has a `hosting` block pointing to `public-auth/`.
- `public-auth/index.html` + `404.html` placeholder pages are committed.
- The Firebase Hosting site is deployed: https://overdive-dreaming-fb.web.app
- Vercel deploy is unaffected (Firebase Hosting only serves the `auth.overdive.app` subdomain — your app stays on Vercel at `overdive.app`).

## Manual steps you still need to do

### 1. Add the custom domain in Firebase Console
1. Open https://console.firebase.google.com/project/overdive-dreaming-fb/hosting/sites
2. Click **Add custom domain** → enter `auth.overdive.app` → Continue.
3. Firebase shows DNS records to add. Note them down. There will be:
   - One **TXT** record on `auth.overdive.app` (or `@`) for ownership verification.
   - Two **A** records (two IP addresses) once verified.

### 2. Add DNS records at your registrar (where overdive.app lives)
- Add the TXT record first. Wait for Firebase to verify (usually < 15 min).
- Then add the two A records for `auth` (host = `auth`).
- **Do NOT change** any existing records pointing `overdive.app` / `www` to Vercel — only add the `auth` subdomain.
- Wait for Firebase to provision SSL (5–60 min). Status visible in Hosting page.

### 3. Add the new domain to Firebase Auth allowlist
- Open https://console.firebase.google.com/project/overdive-dreaming-fb/authentication/settings
- Under **Authorized domains**, click **Add domain** → `auth.overdive.app`.
- Confirm `overdive.app` is already in the list (add if missing).

### 4. Add OAuth redirect URI in Google Cloud Console
- Open https://console.cloud.google.com/apis/credentials?project=overdive-dreaming-fb
- Click your **OAuth 2.0 Client ID** for the web app.
- Under **Authorized redirect URIs**, add:
  ```
  https://auth.overdive.app/__/auth/handler
  ```
- Save.

### 5. Update env var and redeploy
- In Vercel project settings → Environment Variables, change `PUBLIC_FIREBASE_AUTH_DOMAIN` from `overdive-dreaming-fb.firebaseapp.com` to `auth.overdive.app` (Production + Preview + Development).
- Locally, update `.env`:
  ```
  PUBLIC_FIREBASE_AUTH_DOMAIN=auth.overdive.app
  ```
- Redeploy on Vercel (push a commit or click Redeploy).

### 6. Test
- Open the app on iOS, add to home screen, launch standalone, sign in with Google. Auth should now persist after redirect.
- Clear app site data first if testing on a device that previously failed.

## Rollback
If anything breaks, revert `PUBLIC_FIREBASE_AUTH_DOMAIN` to `overdive-dreaming-fb.firebaseapp.com` in Vercel and redeploy. The DNS records and Firebase Hosting can stay; they're inert without the env var change.
