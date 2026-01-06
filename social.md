


# Social V1 Plan (Minimal)

## Goal
Enable a public feed of posted sessions from other users with minimal disruption to existing features.

## Scope (V1)
- Public-only feed (no follows, no friends yet).
- Session visibility toggle: `private` or `public`.
- Author attribution on session cards (display name + avatar).
- Likes remain, comments deferred.

## Data Model Changes
- Add to `RoutineLog`:
  - `visibility: 'private' | 'public'` (default `private`)
  - `authorDisplayName`, `authorPhotoURL` (denormalized for feed speed)
- Add/update a public profile doc (optional but recommended):
  - `usersPublic/{uid}` with `displayName`, `photoURL`, `bio` (future‑proofing)
- Add global privacy default in settings:
  - `UserSettings.defaultSessionVisibility: 'private' | 'public'`

## Firestore Rules & Indexes
- Rules: allow read when `visibility == 'public'` or `userId == auth.uid`.
- Index: `routineLogs` on `visibility` + `date` (descending).

## Feed Queries
- Public feed:
  - Query `routineLogs` where `visibility == 'public'`, order by `date desc`, paginate.
- Personal feed (existing):
  - Keep current user-only feed intact.
- UI toggle: “My Sessions” vs “Community”.
  - Use pill/segmented control in the feed header (no extra page).
  - Persist last selection in `UserSettings` or `localStorage`.

## UI Updates
- Quick Log + Edit Session: add visibility toggle (private/public).
- Settings: add a global default visibility selector; new sessions inherit unless overridden.
- Session card: show author name + avatar (if not current user).
- Feed page: add pill/segmented control for community feed.

## Migration
- Backfill existing logs to `visibility: 'private'`.
- Populate `authorDisplayName` and `authorPhotoURL` on save (from auth user).

## Risks / Constraints
- Public data exposure: ensure sensitive fields aren’t displayed (e.g., menstrual cycle, meal timing).
- Feed scale: per-user queries are fine at V1 scale; avoid fan-out until needed.

## Next Steps
1) Add `visibility` to the data model + forms.
2) Update Firestore rules + indexes.
3) Add community feed query + UI toggle.
4) Extend session card to show author info when not the viewer.


# Questions I have about the implementation
