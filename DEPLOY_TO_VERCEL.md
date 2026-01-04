# Deploying Overdive Dreaming to Vercel (Using Firebase Backend)


  | Command              | What It Does                     | Affects Production? |
  |----------------------|----------------------------------|---------------------|
  | npm run dev          | Local development server         | ❌ No               |
  | git commit           | Save changes locally             | ❌ No               |
  | git push origin main | Push to GitHub → Triggers Vercel | ✅ Yes!             |



This guide explains how to deploy the SvelteKit app to Vercel while **keeping Firebase** for Auth/Firestore/Storage and **not** using Firebase Hosting.

- Target scale: ~50 test users
- Goal: live in a few hours with minimal changes

---

## Overview

- **You keep**:
  - Firebase Auth
  - Firestore
  - Firebase Storage
- **You change**:
  - App hosting: from localhost/Firebase Hosting → Vercel
- **You’ll need**:
  - A Git repository (GitHub/GitLab/Bitbucket)
  - A Vercel account
  - Your Firebase config as environment variables

In the steps below:

- **[CLI]** = Can be done from the terminal.
- **[UI]** = Must be done in a web browser (Vercel or Firebase console).

---

## 1. Ensure the app builds locally

**[CLI]**

From the project root:

```bash
npm install
npm run build
```

You should see a successful build.  
If there are errors, fix them before continuing.

---

## 2. Set up Git (if not already)

If this project is not yet in a Git repo:

**[CLI]**

```bash
git init
git add .
git commit -m "Initial deploy to Vercel"
```

Then create a remote (e.g. GitHub) and push:

```bash
git remote add origin <YOUR_REMOTE_URL>
git push -u origin main
```

> Replace `<YOUR_REMOTE_URL>` with your Git hosting URL.

---

## 3. Verify Firebase config usage in code

Your Firebase client code should be reading config from `import.meta.env` (e.g. `VITE_FIREBASE_API_KEY`).

In `src/lib/firebase.ts` (or equivalent), check for something like:

```ts
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};
```

If your config is hard-coded, switch it to use `import.meta.env.VITE_...` variables so Vercel can inject them.

---

## 4. Create a project on Vercel

**[UI]**

1. Go to Vercel and create an account (or log in).
2. Click **“Add New…” → “Project”**.
3. Choose your Git repo (GitHub/GitLab/Bitbucket).
4. Vercel should auto-detect **SvelteKit**.
5. Confirm the build settings:
   - Build Command: `npm run build`
   - Install Command: `npm install` (default)
   - Framework Preset: `SvelteKit`

You don’t need to change anything else here yet.

---

## 5. Configure environment variables in Vercel

**[UI]**

In the Vercel dashboard:

1. Open your project.
2. Go to **Settings → Environment Variables**.
	1. Add variables matching what you use in `firebase.ts`, for example:

   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

4. Use the same values as in your local `.env` file.
5. Make sure the environment is set to **Production** (and Preview if you want).

> Note: In Vite/SvelteKit, variables **must** start with `VITE_` to be exposed to the client.

---

## 6. Allow the Vercel domain in Firebase Auth

Your Firebase Auth must trust the new domain Vercel gives you.

**[UI]**

1. Go to **Firebase Console → Authentication → Settings → Authorized domains**.
2. Add:
   - Your Vercel URL: `your-project-name.vercel.app`
   - Any custom domain you plan to use later.

Without this, sign-in/sign-up will fail on the hosted app.

---

## 7. Trigger a deployment

Once the project is imported and env vars are set:

**Option A – Auto deploy**  
Every push to `main` triggers a new deployment automatically.

**Option B – Manual re-deploy (if env vars were added later)**

**[UI]**

1. In Vercel, open your project.
2. Go to **Deployments**.
3. Click **“Redeploy”** on the latest deployment.

---

## 8. Smoke test the deployed app

**[UI]**

Visit the Vercel URL, e.g.:

- `https://your-project-name.vercel.app`

Test:

1. **Auth**
   - Sign up with a test user or log in.
   - Ensure there are no CORS or redirect errors.
2. **Core flows**
   - Create a routine.
   - Log a dive / training session.
   - Open dashboard/analytics pages.
3. **Console**
   - Open browser dev tools and check Console/Network for errors.
   - If something fails, note the error messages.

---

## 9. (Optional) Turn off Firebase Hosting

If you previously used Firebase Hosting and want to avoid confusion:

**[UI]**

1. Firebase Console → Hosting.
2. Optionally disable or ignore existing hosting configs, and avoid deploying there.

You do **not** need to delete it immediately; just stop running `firebase deploy --only hosting`.

Your primary production URL for testers becomes the Vercel URL.

---

## 10. What can be automated from the terminal?

These steps can be safely run from your terminal:

- **Install and build locally**  
  - `npm install`  
  - `npm run build`
- **Git setup and pushes**  
  - `git init`, `git add .`, `git commit ...`  
  - `git remote add origin ...`  
  - `git push ...`
- **Code changes**  
  - Editing `src/lib/firebase.ts` to use `import.meta.env.VITE_...` variables.
  - Any Svelte/TS fixes needed to make `npm run build` pass.

These steps **must be done in the browser UI**:

- Creating/configuring the **Vercel project**.
- Adding **environment variables in Vercel**.
- Adding **authorized domains in Firebase Auth**.
- Checking deployment status and opening the deployed URL.

---

## 11. If something breaks

When you hit issues:

1. Grab the relevant logs:
   - Vercel build logs.
   - Browser console errors.
2. Paste them into our chat.
3. Adjust config or code until the build and runtime are clean.
