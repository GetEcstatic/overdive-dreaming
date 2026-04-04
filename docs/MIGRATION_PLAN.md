# Firebase Migration Plan: Convex vs Supabase

## Current Stack
- **Backend**: Firebase (Auth, Firestore, Storage)
- **Frontend**: SvelteKit + TypeScript + Svelte 5
- **Auth**: Google OAuth via Firebase Auth
- **Database**: Firestore (NoSQL, document-based)
- **Storage**: Firebase Storage (photos, CSVs)
- **Collections**: routineLogs, routines, sessions, users, publicProfiles, personalBests, userSettings, comments, config

---

## Option A: Convex

### What Convex Is
A serverless backend platform with realtime by default. Your backend logic lives as TypeScript functions that Convex hosts and runs. Database is document-based with schemas, built-in file storage, and reactive queries.

### Free Tier
| Resource | Limit |
|----------|-------|
| Database storage | 0.5 GB |
| File storage | 1 GB |
| Function calls | 1,000,000/month |
| Action compute | 20 GB-hours/month |
| Data egress | 1 GB/month |
| Database I/O | 1 GB/month |
| Concurrent sessions | 1,000 |

### Starter Tier: ~$25/mo
Same limits as free but usage-based pricing for overages instead of hard caps.

### SvelteKit Integration
- Official `convex-svelte` package with Svelte 5 support
- `setupConvex()` in root layout
- `useQuery()` / `useMutation()` for reactive data
- Functions dir configured under `src/convex/`

### Auth
- Convex Auth (beta) supports Google OAuth directly
- Alternatively: Clerk, Auth0, or WorkOS
- No security rules — auth checks in server functions
- `ctx.auth.getUserIdentity()` in every function

### File Storage
- Built-in upload/serve/delete
- `storage.generateUploadUrl()` for client uploads
- `storage.getUrl(storageId)` for serving
- Files referenced by `Id<"_storage">` in documents

### Migration Steps

1. **Install packages**
   ```bash
   npm install convex convex-svelte
   ```

2. **Configure convex path** (SvelteKit needs functions under `src/`)
   ```json
   // convex.json
   { "functions": "src/convex/" }
   ```

3. **Define schema** (`src/convex/schema.ts`)
   - Map `types.ts` interfaces to Convex schema validators
   - routineLogs, routines, users, comments, etc.
   - Convex uses `v.string()`, `v.number()`, etc.

4. **Write server functions** (`src/convex/`)
   - `routineLogs.ts` — queries + mutations for CRUD
   - `routines.ts` — template queries
   - `users.ts` — user profile ops
   - `comments.ts` — comment CRUD
   - `personalBests.ts` — PB tracking
   - Each function checks auth: `const identity = await ctx.auth.getUserIdentity()`

5. **Replace Firebase imports**
   - Delete `src/lib/firebase.ts`, `src/lib/firestore.ts`, `src/lib/storage.ts`
   - Replace with Convex client usage
   - Update `+layout.svelte` to use `setupConvex()`

6. **Update components**
   - Replace Firestore queries with `useQuery(api.routineLogs.list, { userId })`
   - Replace `addDoc`/`updateDoc` with `useMutation(api.routineLogs.create)`
   - Replace `getDownloadURL` with `storage.getUrl(storageId)`

7. **Set up Google Auth**
   - Configure Convex Auth with Google OAuth provider
   - Replace Firebase Auth stores with Convex auth state

8. **Migrate data**
   - Export Firestore data (JSON)
   - Transform to Convex format
   - Import via `npx convex import`

### Pros
- Realtime by default (no extra setup)
- TypeScript-first with auto-generated API types
- Server functions = no client-side security rules to manage
- Built-in file storage, auth, scheduling
- Document-based (similar mental model to Firestore)
- Official Svelte 5 support

### Cons
- Convex Auth is beta (may change)
- Smaller ecosystem / community than Supabase
- Vendor lock-in (proprietary backend)
- No self-hosting option
- 1 second execution limit on queries/mutations
- Less mature (newer product)
- Free tier is smaller (0.5GB DB vs Supabase 500MB)

### Migration Effort: **Medium-High**
- ~20-30 files to modify
- New server functions to write
- Schema definition needed
- Data export/import
- Auth flow rewrite

---

## Option B: Supabase

### What Supabase Is
Open-source Firebase alternative built on PostgreSQL. Provides database, auth, storage, realtime, and edge functions. SQL-based with Row Level Security for authorization.

### Free Tier
| Resource | Limit |
|----------|-------|
| Database size | 500 MB |
| File storage | 1 GB |
| Monthly active users | 50,000 |
| API requests | Unlimited |
| Egress | 5 GB |
| Realtime connections | 200 concurrent |
| Edge function invocations | 500,000 |

**Note**: Free projects pause after 1 week of inactivity. Limit 2 active projects.

### Pro Tier: $25/mo
8 GB DB, 100 GB storage, 250 GB egress, 100K MAUs, daily backups.

### SvelteKit Integration
- Official `@supabase/ssr` package for SvelteKit
- `createBrowserClient()` / `createServerClient()`
- Supabase client works in both browser and server contexts
- Well-documented SvelteKit guide in official docs

### Auth
- Built-in Google OAuth (native, not beta)
- Row Level Security (RLS) policies for authorization
- Similar concept to Firestore rules but SQL-based
- `auth.uid()` in RLS policies

### File Storage
- S3-compatible storage with CDN
- Upload via `storage.from('bucket').upload(path, file)`
- Public URLs via `storage.from('bucket').getPublicUrl(path)`
- Transformations available (resize, crop)

### Migration Steps

1. **Install packages**
   ```bash
   npm install @supabase/supabase-js @supabase/ssr
   ```

2. **Create Supabase project** (supabase.com dashboard)
   - Enable Google Auth provider
   - Create storage buckets

3. **Define SQL schema**
   ```sql
   CREATE TABLE routine_logs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES auth.users NOT NULL,
     routine_id TEXT,
     discipline_used TEXT,
     date TIMESTAMPTZ,
     total_distance NUMERIC,
     total_time NUMERIC,
     -- ... all fields from types.ts
   );
   ```

4. **Write RLS policies**
   ```sql
   -- Users can read their own logs
   CREATE POLICY "Users read own logs" ON routine_logs
     FOR SELECT USING (auth.uid() = user_id);

   -- Public logs visible to all
   CREATE POLICY "Public logs readable" ON routine_logs
     FOR SELECT USING (is_public = true);
   ```

5. **Replace Firebase imports**
   - Create `src/lib/supabase.ts` (client initialization)
   - Rewrite `src/lib/firestore.ts` as SQL queries
   - Rewrite `src/lib/storage.ts` for Supabase storage

6. **Update components**
   - Replace Firestore queries with Supabase client queries
   - `supabase.from('routine_logs').select('*').eq('user_id', userId)`
   - Replace `onSnapshot` with `supabase.channel().on('postgres_changes', ...)`
   - Storage: `supabase.storage.from('photos').upload(path, file)`

7. **Set up Google Auth**
   - Configure in Supabase dashboard (Google client ID/secret)
   - Replace Firebase Auth with `supabase.auth.signInWithOAuth({ provider: 'google' })`
   - Update auth stores

8. **Migrate data**
   - Export Firestore data (JSON)
   - Transform to SQL INSERT statements
   - Run via Supabase SQL editor or pg_restore
   - Migrate storage files to Supabase buckets

### Pros
- Open source (can self-host if needed)
- PostgreSQL = industry standard, powerful querying
- SQL is portable (no vendor lock-in for data)
- Larger community and more mature
- Native Google OAuth (not beta)
- Better free tier (5 GB egress, unlimited API requests)
- Image transformations built-in
- Row Level Security = powerful and familiar
- Excellent SvelteKit documentation

### Cons
- SQL is more verbose than Convex's JavaScript queries
- RLS policies can be complex to debug
- Free projects pause after 1 week inactivity
- Realtime requires explicit subscription setup
- Need to manage SQL migrations
- NoSQL → SQL requires data model flattening

### Migration Effort: **Medium-High**
- ~20-30 files to modify
- SQL schema + migrations to write
- RLS policies for every table
- Data transformation (NoSQL → SQL)
- Auth flow rewrite
- Storage migration

---

## Head-to-Head Comparison

| Feature | Convex | Supabase |
|---------|--------|----------|
| **Database type** | Document (NoSQL) | PostgreSQL (SQL) |
| **Realtime** | Built-in by default | Opt-in per table |
| **Auth** | Beta (Convex Auth) or third-party | Native, mature |
| **Google OAuth** | Supported (via Convex Auth beta) | Native, production-ready |
| **File storage** | Built-in | Built-in with CDN |
| **SvelteKit support** | Official package | Official package |
| **Authorization** | Server functions | Row Level Security |
| **Free DB** | 0.5 GB | 500 MB |
| **Free storage** | 1 GB | 1 GB |
| **Free egress** | 1 GB | 5 GB |
| **Free API calls** | 1M/month | Unlimited |
| **Inactivity pause** | No | Yes (1 week) |
| **Open source** | Partially | Fully |
| **Self-hostable** | No | Yes |
| **Vendor lock-in** | Higher | Lower |
| **Community size** | Smaller | Larger |
| **Data portability** | Convex format export | Standard SQL dump |
| **Migration from Firestore** | Easier (document→document) | Harder (document→SQL) |
| **Pricing transparency** | Good | Good |
| **Maturity** | Newer | More established |

### Data Model Migration Complexity

**Firestore → Convex**: Easier. Both are document-based. Your nested objects, arrays, and optional fields map directly. Schema validators enforce types.

**Firestore → Supabase**: Harder. Need to flatten nested objects, decide on JSON columns vs normalized tables, handle Firestore timestamps → PostgreSQL timestamps, convert arrays to junction tables or JSONB columns.

---

## Recommendation

**For Overdive specifically**, both are viable. Key factors:

- **If you value realtime and similar mental model**: Convex — document DB feels like Firestore, queries are reactive by default
- **If you value stability and portability**: Supabase — PostgreSQL is battle-tested, data is trivially portable, no vendor lock-in
- **If you value the largest community/docs**: Supabase
- **If you want the easiest migration from Firestore**: Convex (document → document)

The migration effort is roughly equal for both. The main difference is what you're comfortable maintaining long-term.
