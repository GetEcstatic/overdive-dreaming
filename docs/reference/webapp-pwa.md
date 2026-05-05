# Overdive as an iOS Home-Screen Web App — Review & Action List

> Goal: Let users add Overdive to the iOS home screen and have it behave like a real app — full-screen, persistent login, working camera/recorder, no Safari chrome, correct icons, safe-area aware, and resilient to mobile quirks.

This document reviews the current state of the codebase against what iOS Safari requires for a polished "Add to Home Screen" (A2HS) PWA experience, and lists concrete changes. It also covers the live custom-auth-domain setup and Vercel domain notes (merged from `ios-pwa-auth-domain-setup.md` and `Using overdive.app domain.md`).

---

## 1. Current state (audit)

What I found in the repo:

| Area | Status | Evidence |
|------|--------|----------|
| Web App Manifest | ❌ **Missing** | No `manifest.webmanifest` / `manifest.json`; not referenced in [src/app.html](../../src/app.html). |
| Service Worker | ❌ **Missing** | No `service-worker.ts`, no `register()` call. SvelteKit's built-in SW slot is unused. |
| Apple meta tags | ❌ **Missing** | [src/app.html](../../src/app.html#L1-L12) only has `viewport` + favicon. No `apple-mobile-web-app-*`, no `apple-touch-icon`, no `theme-color`. |
| Viewport meta | ⚠️ **Basic** | `width=device-width, initial-scale=1` — no `viewport-fit=cover`, so safe-area-insets resolve to `0` and notch padding doesn't work. |
| Icons | ❌ **Missing** | [static/](../../static/) is empty. The `<link rel="icon">` points to a `favicon.png` that doesn't exist. No 180×180 apple-touch-icon, no 192/512 PNGs for the manifest. |
| Safe-area CSS | ⚠️ **Partial** | Already used in [DiveRecorder.svelte](../../src/lib/components/DiveRecorder.svelte) and a few routes, but not in the global app shell ([BottomNav.svelte](../../src/lib/components/BottomNav.svelte), main layout). Bottom nav will be hidden under the iOS home indicator in standalone mode. |
| Auth flow | ⚠️ **Popup-only** | [src/routes/+page.svelte](../../src/routes/+page.svelte#L87) uses `signInWithPopup`. Popups are blocked / behave poorly inside iOS standalone PWAs. |
| Auth persistence | ⚠️ **Default** | [src/lib/firebase.ts](../../src/lib/firebase.ts) uses default `getAuth()`. iOS standalone WebViews have aggressive storage eviction; we should explicitly set `browserLocalPersistence` and consider IndexedDB persistence. |
| Camera / MediaRecorder | ✅ **Works in Safari ≥ 17.4** for standalone | But there are caveats around `getUserMedia` permission re-prompts, autoplay-with-sound, and orientation. |
| IndexedDB upload queue | ⚠️ **At risk** | iOS clears WebView storage if the PWA isn't opened for ~7 days. Pending video uploads can disappear. |
| Wake Lock | ⚠️ **Conditional** | [src/lib/capture/wakeLock.ts](../../src/lib/capture/wakeLock.ts) gates on capability, but iOS only added Wake Lock in 16.4 and only for HTTPS — fine, but worth noting. |
| Splash screen | ❌ **Missing** | iOS shows a white flash on launch without `apple-touch-startup-image` set. |
| Status bar styling | ❌ **Missing** | Needs `apple-mobile-web-app-status-bar-style="black-translucent"` to match the dark theme. |
| Pull-to-refresh / over-scroll | ⚠️ **Default** | Not disabled — can interfere with the dive recorder swipe controls. |
| 100vh bug | ⚠️ **Partial** | iOS `100vh` includes the URL bar; standalone mode doesn't, but mixed media queries could break. The codebase already has some `100dvh` references — verify all. |
| Custom auth domain | ✅ **Live** | `auth.overdive.app` deployed via Firebase Hosting (see §7). |

---

## 2. Foreseen iOS-specific challenges

### A. Authentication (highest risk)
- **`signInWithPopup` is unreliable in standalone PWAs.** iOS opens popups in a separate Safari tab → user signs in there → returns to a still-signed-out PWA.
  - **Fix:** Use `signInWithRedirect` + `getRedirectResult` on iOS standalone, keep popup elsewhere. Detect with `window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone`.
- **Storage eviction.** If the user doesn't open the PWA for 7 days, iOS may clear cookies/IndexedDB → user is signed out and any pending uploads are gone.
  - **Mitigation:** Set `setPersistence(auth, indexedDBLocalPersistence)`; warn users about pending uploads; consider periodic background sync (limited on iOS).
- **Cross-domain auth iframe.** Firebase Auth uses an iframe on `<authDomain>`; `authDomain` must be `auth.overdive.app` (the custom domain) rather than the default `*.firebaseapp.com` to avoid third-party cookie issues. See §7.

### B. Display / chrome
- Without `display: "standalone"` in a manifest **and** `apple-mobile-web-app-capable=yes`, iOS still shows Safari's URL bar at the top of the home-screen launch.
- The bottom nav will overlap the home-indicator handle without `padding-bottom: env(safe-area-inset-bottom)`.
- The status bar will have a white background unless `apple-mobile-web-app-status-bar-style` is set.

### C. Camera / Recorder
- iOS Safari only allows `getUserMedia` from a user-gesture-initiated handler. The current [DiveRecorder.svelte](../../src/lib/components/DiveRecorder.svelte) flow looks correct, but verify there's no async work before the `getUserMedia` call.
- iOS produces MP4/H.264 from `MediaRecorder`; Android produces WebM. The codebase ([video/overview.md](../video/overview.md)) already calls this out — make sure the upload pipeline & playback handle both MIME types.
- **Background tab kills MediaRecorder.** Standalone PWA backgrounding (lock screen, app switcher) will pause/stop recording. Document this; show a warning if user backgrounds during a recording.
- **Orientation lock** (`screen.orientation.lock`) is **not supported on iOS Safari**. The current fallback (CSS pseudo-fullscreen + `innerWidth > innerHeight` detection) is the right approach.

### D. Splash & icons
- iOS Safari needs **separate `apple-touch-startup-image` `<link>` tags per device size** (or a tool like `pwa-asset-generator`) for a non-white splash screen.
- A single 180×180 `apple-touch-icon.png` is the minimum; recommended to add 120/152/167 variants too.
- The manifest needs `192×192` and `512×512` PNGs (with a `purpose: "maskable"` 512 ideally) for Android/Chromium.

### E. Performance / size
- Firebase JS SDK + Chart.js + xlsx is heavy. On a cold launch from the home screen, parse cost matters more than network. Consider:
  - Code-splitting Firestore / Storage / Charts only on routes that need them (already partially done by SvelteKit).
  - Replacing `xlsx` with a lighter CSV-only parser if XLSX import is rare.

### F. Misc gotchas
- `100vh` ≠ visible viewport on iOS Safari. Use `100dvh` or `100svh` everywhere full-height matters. Audit needed.
- Audio playback with sound during a dive (e.g., countdown beeps) requires a prior user gesture — check countdown/beep paths.
- Pull-to-refresh interferes with horizontal-swipe UI; set `overscroll-behavior-y: contain` on full-screen recorder views.
- Long-press → callout menu on text. Add `-webkit-touch-callout: none` and `user-select: none` on interactive cards (timeline, lap rows).
- iOS won't honor `theme-color` in standalone mode (uses status-bar style instead) but Android will — set both.
- `apple-mobile-web-app-title` controls the home-screen label (defaults to `<title>`, often too long).

---

## 3. Required changes — TODO list

### 3.1 Manifest & meta (P0 — required for A2HS to feel like an app)

- [ ] Create `static/manifest.webmanifest`:
  ```json
  {
    "name": "Overdive — Freedive Training",
    "short_name": "Overdive",
    "description": "Freedive training tracker for pool disciplines.",
    "start_url": "/dashboard",
    "scope": "/",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#000000",
    "theme_color": "#0a0f14",
    "icons": [
      { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
      { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
      { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
    ]
  }
  ```
- [ ] Update [src/app.html](../../src/app.html) `<head>`:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0a0f14" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Overdive" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />
  ```
- [ ] Generate the icon set + iOS startup images (use `pwa-asset-generator` or similar) into `static/icons/` and `static/splash/`.
- [ ] Add iOS startup-image `<link>` tags (one per device — the asset generator emits the snippet).

### 3.2 Authentication (P0)

- [ ] In [src/lib/firebase.ts](../../src/lib/firebase.ts): explicitly set persistence:
  ```ts
  import { setPersistence, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';
  setPersistence(auth, indexedDBLocalPersistence).catch(() => setPersistence(auth, browserLocalPersistence));
  ```
- [ ] In [src/routes/+page.svelte](../../src/routes/+page.svelte): switch to redirect flow when running standalone:
  ```ts
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
  if (isStandalone) await signInWithRedirect(auth, googleProvider);
  else await signInWithPopup(auth, googleProvider);
  ```
- [ ] Handle `getRedirectResult(auth)` on app boot.
- [x] Move Firebase Auth `authDomain` to a custom domain (`auth.overdive.app`) — done. See §7.

### 3.3 Layout & safe-area (P0)

- [ ] Add safe-area padding to [BottomNav.svelte](../../src/lib/components/BottomNav.svelte): `padding-bottom: max(0.5rem, env(safe-area-inset-bottom));`.
- [ ] Add top safe-area padding to the `(app)` layout header / main scroll container.
- [ ] Replace stray `100vh` with `100dvh` (audit needed across `src/`).
- [ ] Apply `overscroll-behavior: contain` to the recorder/player full-screen containers.
- [ ] Add `-webkit-tap-highlight-color: transparent;` globally in [src/app.css](../../src/app.css).

### 3.4 Service worker / offline (P1)

- [ ] Add a minimal SvelteKit service worker (`src/service-worker.ts`) that:
  - Pre-caches the app shell + manifest + icons.
  - Network-first for HTML; stale-while-revalidate for static assets.
  - Does **not** cache Firestore/Storage requests.
- [ ] Register it in `src/routes/+layout.svelte` only in production.
- [ ] Show an "Update available" toast when a new SW is waiting.

### 3.5 Recorder / capture (P1)

- [ ] Show a banner/warning if the user backgrounds the PWA during a recording (use `visibilitychange`).
- [ ] Verify `getUserMedia` is invoked synchronously inside the click handler — no `await` before it.
- [ ] Surface a clear UI state when iOS denies camera permission (Settings → Safari → Camera).
- [ ] Confirm playback handles both `video/mp4` (iOS) and `video/webm` (Android) — test in [DiveVideoPlayer.svelte](../../src/lib/components/DiveVideoPlayer.svelte).
- [ ] Document the iOS 7-day storage eviction limit in the upload queue UX (warn if items have been pending > 5 days).

### 3.6 Polish / UX (P2)

- [ ] Add an "Install app" hint card on the landing page that detects iOS Safari and shows the Share → Add to Home Screen instructions (no programmatic A2HS API on iOS).
- [ ] Add `<title>` template per route so the home-screen-launched window starts with the right page title.
- [ ] Audit large dependencies (`xlsx`, `firebase-admin` mistakenly bundled, etc.) with `vite build --mode analyze`.
- [ ] Test cold-launch from home screen on a real iPhone (sign-in, dashboard, recorder, video upload, sign-out).

### 3.7 Future / nice-to-have (P3)

- [ ] Background-sync via `workbox-background-sync` (Android only — iOS doesn't support it).
- [ ] Web Push notifications (iOS 16.4+ supports them, but **only** for installed PWAs — could be the carrot to drive A2HS adoption).
- [ ] App-shortcuts in the manifest (`shortcuts: [{ name: "Log dive", url: "/record" }]`) — works on Android, ignored by iOS but harmless.

---

## 4. Quick-win checklist (1–2 hour first pass)

1. Add manifest + apple meta tags + `viewport-fit=cover` to [src/app.html](../../src/app.html).
2. Generate and drop icons into `static/icons/`.
3. Add `env(safe-area-inset-bottom)` padding to [BottomNav.svelte](../../src/lib/components/BottomNav.svelte).
4. Set Firebase Auth persistence to `indexedDBLocalPersistence`.
5. Switch sign-in to redirect flow when `display-mode: standalone`.

That alone takes the app from "Safari bookmark" to "feels like a native app on the home screen." The service worker, splash images, and offline polish can follow.

---

## 5. Testing matrix

| Device | iOS | Browser | Test |
|--------|-----|---------|------|
| iPhone (notch) | 17.x | Safari → A2HS | Launch, sign-in (redirect), record dive, save, view feed, sign-out, relaunch |
| iPhone (Dynamic Island) | 18.x | Safari → A2HS | Same + landscape video playback, safe-area on HUD |
| iPad | 17.x | Safari → A2HS | Split-screen, orientation changes |
| iPhone | 16.x | Safari → A2HS | Wake Lock fallback (16.4+ has it; older needs noop) |

---

## 6. Open questions for product

- Do we want to gate certain features (push notifications, background uploads) behind "Install the app"?
- Is portrait-only acceptable for the home-screen app, or do we need landscape-locked recorder?
- Should the install hint be dismissible permanently or re-prompted weekly?

---

## 7. Custom Firebase auth domain (`auth.overdive.app`) — live setup notes

**Why:** iOS standalone PWAs lose auth state when Firebase's OAuth handler lives on `*.firebaseapp.com` (third-party cookie / cross-site iframe restrictions). Hosting the auth handler on a subdomain of `overdive.app` makes it same-site, fixing the redirect round-trip.

### What is already done

- `firebase.json` has a `hosting` block pointing to `public-auth/`.
- `public-auth/index.html` + `404.html` placeholder pages are committed.
- The Firebase Hosting site is deployed: https://overdive-dreaming-fb.web.app
- Vercel deploy is unaffected — Firebase Hosting only serves the `auth.overdive.app` subdomain; the app stays on Vercel at `overdive.app`.

### Manual setup steps (kept for future re-runs / new environments)

#### 1. Add the custom domain in Firebase Console
1. Open https://console.firebase.google.com/project/overdive-dreaming-fb/hosting/sites
2. Click **Add custom domain** → enter `auth.overdive.app` → Continue.
3. Firebase shows DNS records to add. Note them down. There will be:
   - One **TXT** record on `auth.overdive.app` (or `@`) for ownership verification.
   - Two **A** records (two IP addresses) once verified.

Example values used:
- TXT record: `hosting-site=overdive-dreaming-fb`
- A record: `172.104.189.224`

#### 2. Add DNS records at the registrar (Linode, where overdive.app lives)

1. Log in at cloud.linode.com.
2. Sidebar → "Domains" (under Networking).
3. Click "overdive.app". You'll see existing records (SOA, NS, A/AAAA, MX, TXT).
4. Confirm NS records point to `ns1.linode.com` … `ns5.linode.com`.

Add the TXT record Firebase gave:
- "Add a TXT Record".
- Hostname: whatever Firebase shows. If `auth` or `auth.overdive.app`, enter `auth`. If `@` or apex, leave blank or `@`.
- Value: paste the exact string from Firebase (no quotes).
- TTL: Default (or 300 for faster propagation while testing).
- Save. Wait 5–15 min, click "Verify" in Firebase Console.

Once verified Firebase shows two A records. Add both:
- "Add an A/AAAA Record".
- Hostname: `auth`
- IP Address: first IP from Firebase
- TTL: Default
- Repeat for the second IP (same hostname `auth`).

**Important:** do NOT touch existing A/CNAME records pointing `overdive.app` or `www` to Vercel — leave them. Only ADD the `auth` subdomain records.

After both A records are saved, watch Firebase Console → Hosting → `auth.overdive.app` flip from "Pending" to "Connected" (5–60 min for SSL).

#### 3. Add the new domain to Firebase Auth allowlist
- https://console.firebase.google.com/project/overdive-dreaming-fb/authentication/settings
- **Authorized domains** → **Add domain** → `auth.overdive.app`.
- Confirm `overdive.app` is also in the list.

#### 4. Add OAuth redirect URI in Google Cloud Console
- https://console.cloud.google.com/apis/credentials?project=overdive-dreaming-fb
- Click the **OAuth 2.0 Client ID** for the web app.
- Under **Authorized redirect URIs**, add:
  ```
  https://auth.overdive.app/__/auth/handler
  ```
- Save.

#### 5. Update env var and redeploy
- Vercel project settings → Environment Variables: change `PUBLIC_FIREBASE_AUTH_DOMAIN` from `overdive-dreaming-fb.firebaseapp.com` to `auth.overdive.app` (Production + Preview + Development).
- Locally, update `.env`:
  ```
  PUBLIC_FIREBASE_AUTH_DOMAIN=auth.overdive.app
  ```
- Redeploy on Vercel.

#### 6. Test
- Open the app on iOS, add to home screen, launch standalone, sign in with Google. Auth should now persist after redirect.
- Clear app site data first if testing on a device that previously failed.

### Rollback
If anything breaks, revert `PUBLIC_FIREBASE_AUTH_DOMAIN` to `overdive-dreaming-fb.firebaseapp.com` in Vercel and redeploy. The DNS records and Firebase Hosting can stay; they're inert without the env var change.

---

## 8. Vercel domain setup (apex `overdive.app`)

For the main app (not the auth subdomain):

1. **Vercel Dashboard** → project → Settings → Domains → Add Domain → `overdive.app`. Vercel shows DNS records.
2. **At the registrar (Linode):**
   - A record: `@` → `76.76.21.21`
   - CNAME: `www` → `cname.vercel-dns.com`
   - (Or use Vercel nameservers for full control.)
3. Wait for DNS propagation (5–60 min).
4. SSL: Vercel auto-provisions HTTPS once DNS is verified.

Optional: configure `www.overdive.app` ↔ `overdive.app` redirect in Vercel's domain settings.
