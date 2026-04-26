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

TXT record: hosting-site=overdive-dreaming-fb
A record: 172.104.189.224

### 2. Add DNS records at your registrar (where overdive.app lives)
- Add the TXT record first. Wait for Firebase to verify (usually < 15 min).
- Then add the two A records for `auth` (host = `auth`).
- **Do NOT change** any existing records pointing `overdive.app` / `www` to Vercel — only add the `auth` subdomain.
- Wait for Firebase to provision SSL (5–60 min). Status visible in Hosting page.
- 
1. Log in at cloud.linode.com.  
2. Left sidebar -> "Domains" (under Networking).  
3. Click on "overdive.app" in the list. You will see the existing record table (SOA, NS, A/AAAA, MX, TXT, etc).  
4. Confirm the NS records at top point to ns1.linode.com … ns5.linode.com. If yes, you are in the right place.  
  
Add the TXT record Firebase gave you:  
- Click "Add a TXT Record".  
- Hostname: whatever Firebase shows. If Firebase displays the host as "auth" or "auth.overdive.app", enter "auth". If it shows "@" or the apex, leave blank or enter "@".  
- Value: paste the exact string from Firebase (e.g. "google-site-verification=..." or "firebase=..."). No quotes.  
- TTL: Default (or 5 minutes / 300 for faster propagation while testing).  
- Save.  
  
Wait 5–15 min, click "Verify" in Firebase Console. Once verified Firebase shows two A records (two IPs).  
  
Add the A records in Linode:  
- "Add an A/AAAA Record".  
- Hostname: auth  
- IP Address: first IP from Firebase  
- TTL: Default  
- Save.  
- Repeat with the second IP (same hostname "auth").  
  
Important: do NOT touch any existing A/CNAME records that point overdive.app or www to Vercel — leave them alone. Only ADD the auth subdomain records.  
  
After both A records are saved, go back to Firebase Console -> Hosting -> auth.overdive.app and wait for it to flip from "Pending" to "Connected" (5–60 min for SSL).  
  
Tell me when (a) Firebase shows the TXT verification step (paste host+value here), or (b) the domain shows "Connected" in Firebase Hosting and I will continue with the next steps (Authorized domains + OAuth redirect URI + env var swap).'

sleep 120 && yebo next 2>&1 | head -120

Processing


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
