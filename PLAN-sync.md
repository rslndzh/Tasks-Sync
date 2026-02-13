# Optional Supabase Sync — Implementation Plan

**Overall Progress:** `100%` 🟩

## TLDR
Make account creation optional — the app works fully offline with Dexie. When a user wants cross-device sync, they sign up and all local data migrates to their account via Supabase. Zero friction to start, sync when you're ready.

## Critical Decisions
- **Anonymous-first, auth optional** — Remove `ProtectedRoute` gate from `/app` routes. Users land straight in the app with local-only data. Auth is only needed for sync.
- **`getCurrentUserId()` abstraction** — Single function returns the real Supabase user ID when signed in, or `"local"` when anonymous. Every store uses this instead of hardcoding `"local"`.
- **Migration on signup** — When a user creates an account, all Dexie rows with `user_id: "local"` get rewritten to the real UUID, then bulk-pushed to Supabase. This is a one-time operation.
- **Conditional sync** — `queueSync()` is already a no-op when Supabase isn't configured. We extend this: it's also a no-op when the user isn't signed in. Sync only activates after auth.
- **Realtime after pull** — On login/app-load-with-session: pull remote → merge with local → flush queue → subscribe Realtime. Clean lifecycle.
- **Stores refresh from Dexie** — Realtime changes write to Dexie, then stores reload from Dexie. Single source of truth pattern stays clean.
- **`todoist` enum in Supabase** — The migration already has `linear` and `attio` as `task_source` and `integration_type` enums. We need a migration to add `todoist` to both enums since the app already supports Todoist locally.

## What Already Exists
- `src/lib/sync.ts` — `queueSync()`, `flushSyncQueue()`, `pullFromSupabase()`, `subscribeToRealtime()` all scaffolded
- `src/lib/supabase.ts` — Typed client with `isSupabaseConfigured` flag
- `src/stores/useAuthStore.ts` — Full auth flow (signUp, signIn, signOut, magic link)
- `src/components/ProtectedRoute.tsx` — Route guard (currently blocks `/app` without auth)
- `src/hooks/useOnlineStatus.ts` — Online/offline detection
- `src/components/OfflineBanner.tsx` — Offline indicator UI
- `supabase/migrations/001_initial_schema.sql` — Full schema with RLS
- All 4 stores use `user_id: "local"` — needs replacing

## Tasks:

- [x] 🟩 **Step 1: Add `todoist` to Supabase enums**
  - Files: `supabase/migrations/002_add_todoist_enum.sql`
  - [ ] 🟥 `ALTER TYPE task_source ADD VALUE 'todoist'`
  - [ ] 🟥 `ALTER TYPE integration_type ADD VALUE 'todoist'`
  - [ ] 🟥 Add `source_description` column to tasks table (exists locally but missing in Supabase schema)
  - Edge cases: Enum additions are non-reversible in Postgres — that's fine, we want them permanently

- [x] 🟩 **Step 2: Create `getCurrentUserId()` helper**
  - Files: `src/lib/auth.ts` (new)
  - [ ] 🟥 `getCurrentUserId(): string` — returns `useAuthStore.getState().user?.id ?? "local"`
  - [ ] 🟥 `isAuthenticated(): boolean` — returns `true` when user is signed in
  - [ ] 🟥 Keep it as plain functions (not hooks) so stores can call them synchronously
  - Edge cases: Must work during the auth initialization window (returns "local" until session resolves)

- [x] 🟩 **Step 3: Replace `user_id: "local"` in all stores**
  - Files: `src/stores/useBucketStore.ts`, `src/stores/useTaskStore.ts`, `src/stores/useSessionStore.ts`, `src/stores/useImportRuleStore.ts`
  - [ ] 🟥 Import `getCurrentUserId` and use it wherever `user_id: "local"` is hardcoded
  - [ ] 🟥 `useBucketStore.addBucket()` — `user_id: getCurrentUserId()`
  - [ ] 🟥 `useBucketStore.loadBuckets()` — default bucket creation uses `getCurrentUserId()`
  - [ ] 🟥 `useTaskStore.addTask()` — `user_id: getCurrentUserId()`
  - [ ] 🟥 `useSessionStore.startSession()` — session + time entry `user_id: getCurrentUserId()`
  - [ ] 🟥 `useImportRuleStore` — rule `user_id: getCurrentUserId()`
  - [ ] 🟥 `useConnectionStore.importItem()` — task `user_id: getCurrentUserId()`
  - Edge cases: Existing local data stays `user_id: "local"` until migration (Step 6). New data created after sign-in uses the real ID immediately.

- [x] 🟩 **Step 4: Wire `queueSync()` into stores**
  - Files: `src/stores/useBucketStore.ts`, `src/stores/useTaskStore.ts`, `src/stores/useSessionStore.ts`
  - [ ] 🟥 Guard: only call `queueSync()` when `isAuthenticated()` — anonymous users never queue
  - [ ] 🟥 `useBucketStore`: queue after `addBucket`, `updateBucket`, `deleteBucket`, `reorderBucket`
  - [ ] 🟥 `useTaskStore`: queue after `addTask`, `updateTask`, `completeTask`, `uncompleteTask`, `archiveTask`, `moveToSection`, `moveToBucket`, `reorderTask`
  - [ ] 🟥 `useSessionStore`: queue after `startSession` (insert session + time_entry), `switchTask` (update old TE + insert new TE), `stopSession` (update session + TE)
  - [ ] 🟥 Payload shape: full row as-is from Dexie (Supabase columns match local types)
  - Edge cases: `reorderBucket` updates multiple rows — queue each as separate update. Batch task moves (`moveTasksBatch`) queue each task individually.

- [x] 🟩 **Step 5: Make auth optional — remove route guard for `/app`**
  - Files: `src/App.tsx`, `src/components/ProtectedRoute.tsx`
  - [ ] 🟥 Remove `<ProtectedRoute>` wrapper from `/app` routes — users go straight to the app
  - [ ] 🟥 Keep `ProtectedRoute` component for potential future use (don't delete)
  - [ ] 🟥 Keep `/login` and `/signup` routes available (users navigate there voluntarily)
  - [ ] 🟥 Default route `*` → `/app` (already correct)
  - [ ] 🟥 Remove `/onboarding` redirect from ProtectedRoute (onboarding is post-signup only)
  - Edge cases: If Supabase isn't configured at all, everything works as-is (local-only). If configured but user not signed in, still local-only.

- [x] 🟩 **Step 6: Local data migration on signup**
  - Files: `src/lib/sync.ts` (extend), `src/stores/useAuthStore.ts` (extend)
  - [ ] 🟥 `migrateLocalData(userId: string)` in `sync.ts` — rewrites all Dexie rows from `user_id: "local"` to `userId`
    - Migrate tables: `buckets`, `tasks`, `sessions`, `timeEntries`
    - Use `db.transaction("rw", ...)` for atomicity
  - [ ] 🟥 `pushAllToSupabase(userId: string)` — bulk-inserts all local data to Supabase (runs once after migration)
    - Push order matters: buckets first (tasks reference them), then tasks, then sessions, then time_entries
    - Use `upsert` to handle potential conflicts (e.g., default Inbox bucket created by Supabase trigger on signup)
  - [ ] 🟥 In `useAuthStore.signUp()` and `signIn()` success handler: check if local data exists → if yes, call `migrateLocalData` + `pushAllToSupabase`
  - [ ] 🟥 Handle the duplicate Inbox bucket: Supabase trigger creates one on signup, local already has one. Merge them (keep local ID, delete remote duplicate, or vice versa).
  - Edge cases: User signs in on a second device that already has data in Supabase — Step 7 handles the pull/merge. This step only handles first-time migration from anonymous to authenticated.

- [x] 🟩 **Step 7: Sync lifecycle — pull, flush, subscribe**
  - Files: `src/hooks/useSupabaseSync.ts` (new), `src/lib/sync.ts` (extend)
  - [ ] 🟥 Create `useSupabaseSync()` hook — orchestrates the full sync lifecycle
    - Runs when: user is authenticated AND Supabase is configured
    - On mount: `pullFromSupabase()` → `flushSyncQueue()` → `subscribeToRealtime()`
    - On logout: `unsubscribeFromRealtime()` → clear sync queue
    - On online (after offline): `flushSyncQueue()`
  - [ ] 🟥 Extend `pullFromSupabase()` to also pull `sessions` and `time_entries` (currently only pulls buckets + tasks)
  - [ ] 🟥 After pull, reload stores from Dexie: `loadBuckets()`, `loadTasks()`, `loadTodaySessions()`
  - [ ] 🟥 Extend `subscribeToRealtime()` to also subscribe to `sessions` and `time_entries`
  - [ ] 🟥 After Realtime change, reload affected store from Dexie (not just raw Dexie write — stores must reflect the change)
  - [ ] 🟥 Wire `useSupabaseSync()` into `Layout.tsx` (runs inside the app shell, only when authenticated)
  - Edge cases: Race condition — Realtime event arrives while initial pull is in progress. Solved by: pull uses `bulkPut` (idempotent), Realtime overwrites are fine since they're newer.

- [x] 🟩 **Step 8: "Sign in to sync" UI**
  - Files: `src/components/settings/AccountTab.tsx` (new), `src/components/SettingsDialog.tsx` (extend)
  - [ ] 🟥 Add "Account" tab to Settings dialog (first tab)
  - [ ] 🟥 Anonymous state: "Your data lives on this device. Sign in to sync across devices."
    - "Sign up" and "Sign in" buttons → navigate to `/signup` or `/login`
  - [ ] 🟥 Authenticated state: show email, display name, "Sign out" button
    - Sync status: "Last synced: [timestamp]" or "Syncing..." spinner
    - "Your data syncs across all your devices."
  - [ ] 🟥 Subtle prompt in sidebar footer (desktop) / BottomNav area: cloud icon with "Sync" label, links to Settings Account tab
  - [ ] 🟥 Post-signup: show toast "All synced up! Your tasks are safe in the cloud now."
  - Edge cases: Sign out should NOT delete local data — user might want to keep using locally. Ask "Keep your data on this device?" on sign-out.

- [x] 🟩 **Step 9: Conflict resolution & edge cases**
  - Files: `src/lib/sync.ts` (extend)
  - [ ] 🟥 Pull strategy: server-wins for initial load (already implemented via `bulkPut`)
  - [ ] 🟥 Push strategy: last-write-wins — the sync queue sends `updated_at` with each mutation, Supabase trigger updates it server-side
  - [ ] 🟥 Handle stale queue items: if a queued update has `updated_at` older than server's, skip it (server is newer)
  - [ ] 🟥 Dedup sessions: `session_id + device_id` uniqueness on time entries
  - [ ] 🟥 Dead letter queue: after 3 failed retries, move item to a "failed" status instead of infinite retry. Show subtle indicator in Settings.
  - [ ] 🟥 Handle Supabase 409 conflicts on insert: fall back to upsert
  - Edge cases: User creates a task offline on device A and device B simultaneously. Both get unique UUIDs, so no conflict — they just both appear after sync. Same task edited on both devices: last-write-wins by `updated_at`.

- [x] 🟩 **Step 10: Login & Signup page polish for optional flow**
  - Files: `src/pages/LoginPage.tsx`, `src/pages/SignupPage.tsx`
  - [ ] 🟥 Add "Continue without account" link below the form → navigates to `/app`
  - [ ] 🟥 Microcopy: "Want to sync across devices? Create an account. Otherwise, just jump in — everything works locally."
  - [ ] 🟥 If user navigates to `/login` while already anonymous with data: "You already have [N] tasks. Sign in to sync them."
  - [ ] 🟥 Post-login redirect: `/app` (not `/onboarding` — skip onboarding for now, simplify the flow)
  - Edge cases: User visits `/login` directly (bookmark, shared link) — should still work. Show the form, with "or skip" option.
