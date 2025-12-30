# Overdive Dreaming - Project Context

## Project Overview

**Name:** Overdive Dreaming
**Purpose:** A Strava-like freediving training tracker focused on pool freediving disciplines
**Primary Use Case:** Mobile-first web app for recording training and competition dives, analyzing progress, and sharing achievements

### Core Requirements
- Track pool freediving disciplines (STA, DYN, DNF, DYNB)
- Record dive data with notes
- Analytics with progress summaries (1 month, 6 months, 1 year)
- Social sharing capabilities (planned)
- Google authentication
- Mobile-first design
- Dark theme with teal/green modern tech aesthetic
- Minimalist, clarity-focused UI

### Future Plans
- Initially using Firebase (free tier experimentation)
- Eventually rebuild with custom Zef DB backend
- Competition mode tracking
- Social features (following, comparing with friends)

## Tech Stack

### Current Implementation
- **Frontend Framework:** SvelteKit (chosen over React/Next.js per user preference)
- **Styling:** Tailwind CSS v4 (CSS-based configuration)
- **Language:** TypeScript
- **Authentication:** Firebase Auth (Google OAuth)
- **Database:** Firestore (Firebase's NoSQL database)
- **Deployment:** TBD (likely Vercel or Firebase Hosting)

### Why These Choices
- **SvelteKit:** User prefers Svelte; provides full-stack capabilities with routing, SSR, and API endpoints
- **Firebase:** Best free tier for early experimentation, native Google auth, generous limits
- **Tailwind v4:** Utility-first CSS for rapid development, v4 uses CSS-based config
- **TypeScript:** Type safety for better developer experience

## Project Structure

```
overdive-dreaming/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   └── BottomNav.svelte          # Mobile bottom navigation
│   │   ├── stores/
│   │   │   └── auth.ts                   # Auth state management (Svelte stores)
│   │   └── firebase.ts                   # Firebase initialization & exports
│   ├── routes/
│   │   ├── (app)/                        # Authenticated route group
│   │   │   ├── +layout.svelte            # Auth wrapper + bottom nav
│   │   │   ├── dashboard/
│   │   │   │   └── +page.svelte          # Overview/stats page
│   │   │   ├── dives/
│   │   │   │   └── +page.svelte          # Dive logging form
│   │   │   ├── analytics/
│   │   │   │   └── +page.svelte          # Progress visualization
│   │   │   └── profile/
│   │   │       └── +page.svelte          # User profile + sign out
│   │   ├── +layout.svelte                # Root layout (imports global CSS)
│   │   └── +page.svelte                  # Landing/login page
│   ├── app.css                           # Global styles + CSS variables
│   └── app.html                          # HTML template
├── static/                               # Static assets
├── .env                                  # Firebase config (gitignored)
├── .env.example                          # Template for Firebase setup
├── .gitignore
├── package.json
├── svelte.config.js
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Design System

### Color Scheme (Dark Theme)
```css
--color-primary: #14b8a6;      /* teal-500 - primary actions, highlights */
--color-secondary: #10b981;     /* green-500 - secondary accents */
--color-bg: #0f172a;            /* slate-900 - main background */
--color-bg-card: #1e293b;       /* slate-800 - card/panel backgrounds */
--color-text: #f1f5f9;          /* slate-100 - primary text */
--color-text-muted: #94a3b8;    /* slate-400 - secondary text */
```

### Design Principles
- **Mobile-first:** Primary usage on phones
- **Minimalist:** Clean, uncluttered interfaces
- **Clarity:** Easy to read, understand, and interact with
- **Data-focused:** Modern tech aesthetic, emphasis on metrics and progress
- **Dark by default:** Easier on eyes during pool sessions

### Typography
- System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`
- Gradient text for headers: `from-[var(--color-primary)] to-[var(--color-secondary)]`

## Routing Architecture

### Public Routes
- `/` - Landing page with Google sign-in

### Authenticated Routes (wrapped in `(app)` layout)
- `/dashboard` - Home dashboard after login
- `/dives` - Log new dives
- `/analytics` - View progress and statistics
- `/profile` - User settings and sign out

### Route Protection
- `(app)/+layout.svelte` uses `onAuthStateChanged` listener
- Redirects to `/` if user not authenticated
- Landing page redirects to `/dashboard` if already authenticated

## Authentication Flow

### Implementation Pattern
```typescript
// Stores (src/lib/stores/auth.ts)
export const user = writable<User | null>(null);
export const loading = writable(true);

// Firebase setup (src/lib/firebase.ts)
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Auth listener (used in layouts)
onAuthStateChanged(auth, (firebaseUser) => {
  user.set(firebaseUser);
  loading.set(false);
  // Handle redirects
});

// Sign in (landing page)
await signInWithPopup(auth, googleProvider);

// Sign out (profile page)
await signOut(auth);
```

### User Flow
1. User visits `/` → sees landing page
2. Clicks "Sign in with Google" → Firebase popup
3. On success → redirected to `/dashboard`
4. Navigation via bottom nav (Home, Log, Stats, Profile)
5. Sign out from profile → returns to landing

## Data Models (Planned)

### User Document (`users/{userId}`)
```typescript
{
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdAt: timestamp;
  updatedAt: timestamp;
}
```

### Dive Document (`dives/{diveId}`)
```typescript
{
  userId: string;
  discipline: 'STA' | 'DYN' | 'DNF' | 'DYNB';
  date: timestamp;
  duration?: string;      // For STA (mm:ss format)
  distance?: number;      // For DYN/DNF/DYNB (meters)
  notes?: string;
  createdAt: timestamp;
  updatedAt: timestamp;
}
```

### Firestore Security Rules (TODO)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /dives/{diveId} {
      allow read, write: if request.auth != null &&
        request.auth.uid == resource.data.userId;
      allow create: if request.auth != null &&
        request.auth.uid == request.resource.data.userId;
    }
  }
}
```

## Key Components

### BottomNav.svelte
- Fixed bottom navigation for mobile
- 4 items: Home (🏠), Log (➕), Stats (📊), Profile (👤)
- Highlights active route
- Uses SvelteKit's `$page.url.pathname` for active state

### Authentication State
- Global Svelte stores for `user` and `loading`
- `onAuthStateChanged` listener in both root and app layouts
- Prevents flash of unauthenticated content

## Firebase Setup (Required)

### Environment Variables (.env)
```bash
PUBLIC_FIREBASE_API_KEY=
PUBLIC_FIREBASE_AUTH_DOMAIN=
PUBLIC_FIREBASE_PROJECT_ID=
PUBLIC_FIREBASE_STORAGE_BUCKET=
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
PUBLIC_FIREBASE_APP_ID=
PUBLIC_FIREBASE_MEASUREMENT_ID=
```

### Firebase Console Steps
1. Create Firebase project
2. Enable Authentication → Google provider
3. Create Firestore database (test mode for dev)
4. Add web app → copy config values to .env
5. (Later) Deploy security rules for production

## Current Implementation Status

### ✅ Completed
- [x] SvelteKit project initialization
- [x] Tailwind CSS v4 setup with dark theme
- [x] Firebase configuration structure
- [x] Google authentication UI and logic
- [x] Route structure with protected routes
- [x] Mobile bottom navigation
- [x] Landing page with features showcase
- [x] Dashboard layout (placeholder stats)
- [x] Dive logging form UI (discipline selector, input fields)
- [x] Analytics page layout (placeholder charts)
- [x] Profile page with sign out
- [x] Auth state management with Svelte stores
- [x] Responsive mobile-first design
- [x] README with setup instructions
- [x] Firebase credentials configured in .env
- [x] Development server verified working
- [x] Google sign-in flow tested and working

### 🚧 TODO - Immediate Next Steps
- [ ] Implement Firestore integration for dive logging
- [ ] Add real-time dive history display on dashboard
- [ ] Implement data fetching and aggregation for analytics
- [ ] Add form validation for dive entries
- [ ] Create loading states and error handling
- [ ] Add success/error toast notifications

### 📋 TODO - Future Features
- [ ] Chart visualization library (Chart.js or Recharts)
- [ ] Personal bests tracking and display
- [ ] Dive history list with filtering (by discipline, date)
- [ ] Edit/delete existing dives
- [ ] Export data functionality
- [ ] Social features (sharing, following, comparisons)
- [ ] Competition mode tracking
- [ ] Profile customization (avatar, bio)
- [ ] Offline support with PWA
- [ ] Push notifications for training reminders
- [ ] Migration path to Zef DB

## Important Patterns & Conventions

### SvelteKit Routing
- `+page.svelte` - Page component
- `+layout.svelte` - Layout wrapper for child routes
- `(name)` - Route groups (don't add to URL path)
- `[param]` - Dynamic route parameters

### Svelte Reactivity
- `$store` - Auto-subscribe to store value
- `$:` - Reactive statements
- `bind:value` - Two-way binding
- `on:click` - Event handlers

### Tailwind Custom Values
- Use `[var(--color-name)]` for CSS variable values
- Example: `bg-[var(--color-primary)]`

### Firebase Best Practices
- Never commit .env file
- Use PUBLIC_ prefix for client-side variables in SvelteKit
- Import from `$env/static/public` in firebase.ts
- Always check `request.auth` in security rules

## Development Commands

```bash
npm run dev          # Start dev server (localhost:5173)
npm run build        # Build for production
npm run preview      # Preview production build
npm run check        # TypeScript checks
npm run check:watch  # Watch mode for checks
```

## Notes & Decisions

### Why Firebase Over Supabase?
- Better free tier limits for this use case (50k reads/day vs 2GB bandwidth)
- Native Google authentication integration
- Simpler setup for early experimentation
- Plan to migrate to Zef DB later anyway

### Why Mobile-First?
- Primary usage context: at the pool, logging dives on phone
- Easier to scale up to desktop than down to mobile
- Bottom navigation is standard mobile pattern

### Discipline Abbreviations
- **STA** - Static Apnea (hold breath while stationary)
- **DYN** - Dynamic Apnea (swim horizontally with fins)
- **DNF** - Dynamic No Fins (swim horizontally without fins)
- **DYNB** - Dynamic Bifins (specific fin type variant)

### Current Limitations
- No Firestore CRUD operations yet (just UI shells)
- No charts library integrated
- No form validation
- No error boundaries
- Test mode Firestore rules (insecure for production)
- No loading skeletons
- No image optimization
- No favicon

## Context for AI Assistance

When resuming this project:
1. Check if .env file exists and has Firebase credentials
2. Run `npm install` if node_modules missing
3. Focus areas are likely: Firestore integration, charts, validation
4. Maintain mobile-first approach
5. Keep design minimal and data-focused
6. Use TypeScript strictly
7. Follow established color scheme and component patterns
8. Test on mobile viewport (375px width)

## Useful File Paths

**Quick reference for common edits:**
- Auth logic: `src/lib/firebase.ts`, `src/lib/stores/auth.ts`
- Dive form: `src/routes/(app)/dives/+page.svelte`
- Dashboard: `src/routes/(app)/dashboard/+page.svelte`
- Analytics: `src/routes/(app)/analytics/+page.svelte`
- Theme colors: `src/app.css` (CSS variables)
- Navigation: `src/lib/components/BottomNav.svelte`
- Auth layout: `src/routes/(app)/+layout.svelte`

## Questions to Explore Later

- Should we use a charting library or custom D3 visualizations?
- How to handle offline dive logging? (PWA with local storage?)
- What social features are most valuable? (Leaderboards? Activity feeds?)
- How to migrate data when moving to Zef DB?
- Should we add video upload capability for form checks?
- Competition vs training mode - separate tracking?
- Multi-language support needed?
