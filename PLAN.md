# Flowpin Web MVP — Implementation Plan

**Overall Progress:** `25%` (Phase 1 + Phase 2 complete)

## TLDR
Build Flowpin's web version from scratch — a playful, keyboard-first task triage and time tracker. Organize work into user-created Buckets (lists/projects), each with Today/Sooner/Later sections. A global "Today" smart list aggregates all "today" tasks across buckets and serves as the session/timer launchpad. Linear integration via API key, focus sessions with split tracking, and a visual calendar rail. Web-first, offline-capable, Supabase-backed. Desktop (Electron) and mobile (Capacitor + Live Activities) come after MVP.

## Critical Decisions
- **Web-first, platforms later** — Ship a working web app before touching Electron or Capacitor. Same React codebase will wrap later.
- **Supabase for everything server-side** — Auth, Postgres, Realtime, RLS. No custom backend.
- **Dexie for local-first** — All reads come from IndexedDB. Supabase is the sync target, not the primary read source.
- **UUIDs generated client-side** — Enables offline task/session creation without server roundtrip.
- **API keys local-only** — Linear tokens stored in IndexedDB (encrypted), never sent to Supabase.
- **Buckets are user-created lists** — Each user gets a default "Inbox" bucket. Can create more (Work, Side Project, etc.). Each bucket has Today/Sooner/Later sections inside.
- **Global "Today" smart list** — Aggregates all tasks where `section = 'today'` across all buckets. Pinned at top of sidebar. Session/timer launchpad.
- **`section_type` enum for triage** — `'today' | 'sooner' | 'later'` is a Postgres enum on the task row, not a separate table.
- **No drag-and-drop in Phase 1** — Keyboard section-move first. DnD added in polish phase.
- **Design is critically important** — Beautiful, joyful UI is a core product differentiator, not an afterthought. Invest in design tokens and component quality from Phase 1.
- **shadcn/ui for base components** — Copy-paste accessible React components (Radix UI + Tailwind). Foundation for all structural UI. Not an npm dependency — you own the code.
- **Motion (Framer Motion) for animation engine** — Declarative layout animations, mount/unmount transitions, gesture support. The "how" behind all animations.
- **Magic UI + React Bits for delight moments** — [Magic UI](https://magicui.design/) (shadcn/ui companion, 150+ animated components) and [React Bits](https://www.reactbits.dev/) for max 3-5 high-impact animation moments in Phase 8. Copy-paste, not npm.
- **PickCSS for design system bootstrap** — Use [PickCSS](https://pickcss.com/) to generate Tailwind theme tokens (colors, typography, spacing, radius) before writing any UI code. Exports shadcn/ui-compatible config.

---

## Phase 1: Project Foundation
> Scaffold, infra, DB schema, app shell

- [x] 🟩 **1.1 Scaffold Vite + React 19 + TypeScript + Tailwind 4**
  - Files: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`
  - [x] 🟩 Scaffolded Vite + React 19 + TS project (manual, no interactive CLI)
  - [x] 🟩 Installed Tailwind CSS 4 via `@tailwindcss/vite` plugin + `tw-animate-css`
  - [x] 🟩 Installed core deps: `zustand`, `dexie`, `@supabase/supabase-js`, `react-router-dom`, `motion`, `lucide-react`
  - [x] 🟩 Set up `@/` path alias in tsconfig.json, tsconfig.app.json, and vite.config.ts
  - [x] 🟩 Initialized shadcn/ui: `npx shadcn@latest init` — new-york style, neutral base, OKLCH colors, `cn()` in `src/lib/utils.ts`
  - [x] 🟩 Added shadcn/ui components: `button`, `card`, `input`, `dialog`, `sonner`, `dropdown-menu`, `tooltip`, `badge`, `separator`, `skeleton`
  - Note: Used `sonner` instead of deprecated `toast`. Build passes with 0 TS errors.

- [x] 🟩 **1.2 Supabase Project + Database Schema**
  - Files: `supabase/migrations/001_initial_schema.sql`, `src/lib/supabase.ts`, `src/types/database.ts`
  - [x] 🟩 Initialized Supabase local dev: `supabase init`
  - [x] 🟩 Created migration with all enums: `section_type`, `task_source`, `task_status`, `integration_type`
  - [x] 🟩 Created tables: `profiles`, `buckets`, `tasks`, `integrations`, `import_rules`, `sessions`, `time_entries`
  - [x] 🟩 Enabled RLS on all tables + created full CRUD policies (`user_id = auth.uid()`)
  - [x] 🟩 Created trigger: auto-create `profiles` row on `auth.users` insert
  - [x] 🟩 Created trigger: auto-update `updated_at` on row changes
  - [x] 🟩 Hand-wrote TypeScript types matching schema (`src/types/database.ts`) — regenerate from CLI once connected to live project
  - [x] 🟩 Created typed Supabase client in `src/lib/supabase.ts` with env var config
  - [x] 🟩 Added performance indexes for common queries (bucket lookups, active sessions, time entries by date)
  - Edge cases: RLS must be tested — no user should ever see another user's data

- [x] 🟩 **1.3 Dexie Local Database**
  - Files: `src/lib/db.ts`, `src/types/local.ts`
  - [x] 🟩 Defined Dexie schema v2: `buckets`, `tasks`, `sessions`, `timeEntries` (mirrors of Supabase for offline reads)
  - [x] 🟩 Defined local-only tables: `integrationKeys`, `syncQueue`, `appState`
  - [x] 🟩 Created typed interfaces for all local-only entities in `src/types/local.ts`
  - [x] 🟩 Added `getOrCreateDeviceId()` function (random UUID, persisted in `appState`)

- [x] 🟩 **1.4 App Shell & Routing**
  - Files: `src/App.tsx`, `src/pages/`, `src/components/Layout.tsx`, `src/hooks/usePlatform.ts`
  - [x] 🟩 Set up react-router: `/login`, `/signup`, `/onboarding`, `/app` (Today), `/app/bucket/:id`, `/app/integrations`
  - [x] 🟩 Created `Layout.tsx`: sidebar (Today smart list + bucket list + integrations) + main content area + calendar rail slot (right side)
  - [x] 🟩 Created `usePlatform()` hook (returns `'web'` for now, extensible later)
  - [ ] 🟥 **Generate design tokens via [PickCSS](https://pickcss.com/)** — warm palette, playful radius, generous spacing. Export Tailwind config + CSS variables. Apply as shadcn/ui theme override. *(User action: visit PickCSS, make choices, export config)*
  - [x] 🟩 `cn()` utility provided by shadcn/ui init (in `src/lib/utils.ts`)
  - [x] 🟩 Created `TodayPage.tsx` (global smart list) + `BucketPage.tsx` (single bucket with 3 sections) + placeholder pages for other routes

---

## Phase 2: Auth & Onboarding
> Sign up, log in, onboard, profile

- [x] 🟩 **2.1 Supabase Auth Integration**
  - Files: `src/stores/useAuthStore.ts`, `src/lib/supabase.ts`
  - [x] 🟩 Created `useAuthStore` — session state, user profile, loading state
  - [x] 🟩 Set up `onAuthStateChange` listener on app mount
  - [x] 🟩 Auto-fetch profile after auth, create if missing
  - [x] 🟩 Graceful null client when Supabase not configured (local-only dev mode)

- [x] 🟩 **2.2 Login & Signup Pages**
  - Files: `src/pages/LoginPage.tsx`, `src/pages/SignupPage.tsx`
  - [x] 🟩 Email + password signup/login forms
  - [x] 🟩 Magic link option ("Email me a login link")
  - [x] 🟩 Friendly error handling via `src/lib/auth-errors.ts`
  - [x] 🟩 Dev mode: "Jump in anyway" when Supabase not configured
  - Microcopy: "Hey! Ready to flow?" on login page

- [x] 🟩 **2.3 Protected Routes**
  - Files: `src/components/ProtectedRoute.tsx`
  - [x] 🟩 HOC/wrapper that redirects to `/login` if no session
  - [x] 🟩 Loading skeleton while auth state resolves (no flash of login page)
  - [x] 🟩 Redirect to `/onboarding` if `onboarding_completed === false`

- [x] 🟩 **2.4 Onboarding Flow (shell)**
  - Files: `src/pages/OnboardingPage.tsx`
  - [x] 🟩 Step 1: Welcome screen — explains Buckets-as-lists + Today/Sooner/Later sections + global Today view
  - [x] 🟩 Step 2: Linear integration placeholder with "Skip" option + Attio "Coming Soon"
  - [x] 🟩 Step 3: Quick keyboard cheatsheet with styled kbd elements
  - [x] 🟩 Mark `onboarding_completed = true` in profiles on finish
  - [x] 🟩 Allow skipping entire onboarding

---

## Phase 3: Core Task System
> Buckets, sections, manual tasks, CRUD, keyboard shortcuts

- [ ] 🟥 **3.1 Bucket & Task Stores**
  - Files: `src/stores/useBucketStore.ts`, `src/stores/useTaskStore.ts`
  - [ ] 🟥 Create `useBucketStore` — CRUD for buckets (name, icon, color, position), Dexie persistence
  - [ ] 🟥 Create `useTaskStore` with Zustand + Dexie persistence
  - [ ] 🟥 Actions: `addTask`, `updateTask`, `completeTask`, `archiveTask`, `moveToSection`, `moveToBucket`, `reorder`
  - [ ] 🟥 Selectors: `selectTasksByBucket(bucketId)`, `selectTodayTasks()` (all tasks with section='today'), `selectUnbucketedTasks`
  - [ ] 🟥 Optimistic mutations: write to Dexie first, then sync to Supabase
  - Edge cases: UUID generated client-side for offline task/bucket creation

- [ ] 🟥 **3.2 Supabase Sync for Buckets & Tasks**
  - Files: `src/lib/sync.ts`, `src/stores/useTaskStore.ts`, `src/stores/useBucketStore.ts`
  - [ ] 🟥 On app load: fetch buckets + tasks from Supabase, merge with Dexie (server wins on conflict for initial load)
  - [ ] 🟥 On mutation: write Dexie → update store → push to Supabase (or queue if offline)
  - [ ] 🟥 Supabase Realtime subscription on `tasks` and `buckets` tables (for multi-tab/device sync)
  - [ ] 🟥 Handle sync errors gracefully (retry with backoff, surface to user if persistent)
  - Edge cases: Offline mutations queue in `sync_queue`, flush when back online

- [ ] 🟥 **3.3 Today Smart List UI**
  - Files: `src/pages/TodayPage.tsx`, `src/components/TaskCard.tsx`
  - [ ] 🟥 Wire TodayPage to `selectTodayTasks()` — shows all tasks with section='today' across all buckets
  - [ ] 🟥 Group tasks by bucket (bucket name as section header, collapsible)
  - [ ] 🟥 `TaskCard` — title, source icon (manual/Linear), estimate badge, bucket tag, complete button
  - [ ] 🟥 "Start Focus" button enabled when a task is selected
  - Microcopy: Empty state: "Nothing for today yet. Move tasks to Today from any bucket."

- [ ] 🟥 **3.4 Bucket View UI**
  - Files: `src/pages/BucketPage.tsx`, `src/components/SectionColumn.tsx`, `src/components/TaskCard.tsx`
  - [ ] 🟥 Wire BucketPage to `selectTasksByBucket(bucketId)` — three columns: Today / Sooner / Later sections
  - [ ] 🟥 `SectionColumn` — header with count, task list, empty state microcopy
  - [ ] 🟥 Responsive: columns stack on mobile-width, side-by-side on desktop
  - [ ] 🟥 Wire sidebar bucket list to `useBucketStore` (replace dev placeholder)

- [ ] 🟥 **3.5 Manual Task CRUD**
  - Files: `src/components/AddTaskInput.tsx`, `src/components/TaskCard.tsx`
  - [ ] 🟥 Quick-add input in bucket view (defaults to "Sooner" section) and Today view
  - [ ] 🟥 Default new task to current bucket + "Sooner" section (or user's default import section)
  - [ ] 🟥 Inline title editing (click to edit, Enter to save, Escape to cancel)
  - [ ] 🟥 Complete task: checkbox/button → sets `status: 'completed'`, `completed_at`
  - [ ] 🟥 Archive/delete: soft delete via `status: 'archived'`
  - [ ] 🟥 Estimate field: inline editable minutes, optional

- [ ] 🟥 **3.6 Bucket Management**
  - Files: `src/components/CreateBucketDialog.tsx`, `src/components/Layout.tsx`
  - [ ] 🟥 "New Bucket" button opens dialog: name, optional icon/color
  - [ ] 🟥 Edit bucket: inline name edit in bucket view header
  - [ ] 🟥 Delete bucket: only if empty (or offer to move tasks to Inbox first)
  - [ ] 🟥 Default "Inbox" bucket cannot be deleted or renamed

- [ ] 🟥 **3.7 Section Move & Keyboard Shortcuts**
  - Files: `src/hooks/useKeyboardShortcuts.ts`, `src/lib/shortcuts.ts`
  - [ ] 🟥 Centralized shortcut registry in `src/lib/shortcuts.ts`
  - [ ] 🟥 Arrow keys to navigate between tasks within/across sections
  - [ ] 🟥 `1` / `2` / `3` to move selected task to Today / Sooner / Later section
  - [ ] 🟥 `n` to create new task
  - [ ] 🟥 `e` to edit selected task title
  - [ ] 🟥 `Enter` or `d` to mark complete
  - [ ] 🟥 `?` to show keyboard cheatsheet modal
  - [ ] 🟥 Focus ring visible when navigating by keyboard, hidden for mouse
  - Edge cases: Shortcuts disabled when text input is focused

---

## Phase 4: Linear Integration
> API key auth, fetch tasks, integration buckets

- [ ] 🟥 **4.1 Linear API Client**
  - Files: `src/integrations/linear.ts`, `src/types/linear.ts`
  - [ ] 🟥 Typed Linear API client using fetch (no SDK dependency)
  - [ ] 🟥 Functions: `validateApiKey`, `fetchTeams`, `fetchAssignedIssues(teamId?)`
  - [ ] 🟥 Map Linear issue → Flowpin task shape (`source: 'linear'`, `source_id: issue.id`)
  - [ ] 🟥 Rate limit handling: respect `X-RateLimit-*` headers, backoff when throttled
  - [ ] 🟥 Error typing: distinguish invalid key, rate limit, network error, server error

- [ ] 🟥 **4.2 API Key Onboarding Step**
  - Files: `src/components/onboarding/LinearSetup.tsx`
  - [ ] 🟥 API key/personal token input field with paste support
  - [ ] 🟥 "Validate" button — calls `validateApiKey`, shows teams on success
  - [ ] 🟥 Success: "We're in. Let's see what you've got going on."
  - [ ] 🟥 Failure: "Hmm, that key didn't work. Double-check and try again?"
  - [ ] 🟥 Store key in Dexie `integration_keys` (encrypted with user-derived key)
  - [ ] 🟥 Create `integrations` row in Supabase (metadata only, no key)
  - [ ] 🟥 Link to Linear docs: "Here's how to create a personal API key"
  - [ ] 🟥 Attio placeholder: "Coming soon" card, not interactive

- [ ] 🟥 **4.3 Integration Buckets UI**
  - Files: `src/pages/IntegrationsPage.tsx`, `src/components/IntegrationInbox.tsx`, `src/stores/useIntegrationStore.ts`
  - [ ] 🟥 Create `useIntegrationStore` — connections, imported tasks, sync state
  - [ ] 🟥 Integrations page: shows Linear inbox with unbucketed tasks (`bucket_id = NULL`)
  - [ ] 🟥 Each task card: title, Linear team/project, status, import button
  - [ ] 🟥 Single import: click → pick target bucket + section (defaults to user's `default_import_section`) → task gets `bucket_id` + `section` set
  - [ ] 🟥 Batch import: select multiple → assign all to a bucket
  - [ ] 🟥 "Sync now" button to re-fetch from Linear
  - [ ] 🟥 Last synced timestamp display
  - Microcopy: "[X] new tasks from Linear. Triage them?"
  - Edge cases: Dedup via `UNIQUE(user_id, source, source_id)` — if task already imported, skip

- [ ] 🟥 **4.4 Auto-Sync on App Open**
  - Files: `src/hooks/useLinearSync.ts`
  - [ ] 🟥 On app open (if Linear connected): fetch assigned issues → upsert into tasks with `bucket_id = NULL`
  - [ ] 🟥 Periodic background sync (every 5 minutes while app is open)
  - [ ] 🟥 Show sync status indicator in nav
  - Edge cases: If API key is invalid/expired, show friendly error + prompt to re-enter

---

## Phase 5: Import Rules Engine
> Auto-routing from Linear to buckets

- [ ] 🟥 **5.1 Import Rules Store & Data**
  - Files: `src/stores/useImportRuleStore.ts`, `src/types/import-rule.ts`
  - [ ] 🟥 Create `useImportRuleStore` — CRUD for rules, sync with Supabase
  - [ ] 🟥 Rule shape: `{ integrationId, sourceFilter: { teamId, teamName }, targetBucketId, targetSection, isActive }`

- [ ] 🟥 **5.2 Rules UI**
  - Files: `src/components/ImportRuleEditor.tsx`, `src/pages/IntegrationsPage.tsx`
  - [ ] 🟥 "Add Rule" form on integrations page: pick Linear team → pick target bucket + section
  - [ ] 🟥 Display active rules as cards: "Linear [Team] → [Bucket] / Sooner"
  - [ ] 🟥 Toggle active/inactive, delete rule
  - Microcopy: "Got it — Linear [Team] tasks go straight to Sooner."

- [ ] 🟥 **5.3 Rules Engine Execution**
  - Files: `src/lib/import-engine.ts`
  - [ ] 🟥 On Linear sync: after fetching tasks, check each against active rules
  - [ ] 🟥 If rule matches AND task not already imported → create with `bucket_id = rule.targetBucketId`, `section = rule.targetSection`
  - [ ] 🟥 If no rule matches → create with `bucket_id = NULL` (stays in integration inbox)
  - [ ] 🟥 Rules only affect NEW imports — never rebucket existing tasks
  - Edge cases: Rule changes don't retroactively move tasks. Only future imports affected.

---

## Phase 6: Sessions & Timer
> Focus sessions, time entries, task switching, persistence

- [ ] 🟥 **6.1 Session Store & Data**
  - Files: `src/stores/useSessionStore.ts`, `src/types/session.ts`
  - [ ] 🟥 Create `useSessionStore` — active session, time entries, timer state
  - [ ] 🟥 Actions: `startSession(taskId, mode)`, `switchTask(taskId)`, `stopSession`, `pauseSession`
  - [ ] 🟥 Timer modes: open-ended (runs until stopped), fixed N-minutes (countdown)
  - [ ] 🟥 Only ONE active session per user at any time
  - [ ] 🟥 Persist timer state to Dexie `app_state` on every tick (1s interval)

- [ ] 🟥 **6.2 Timer UI**
  - Files: `src/components/Timer.tsx`, `src/components/TimerControls.tsx`, `src/components/MiniTimer.tsx`
  - [ ] 🟥 Timer display: elapsed time (or countdown), current task name, bucket color
  - [ ] 🟥 Controls: Start / Stop / Switch Task buttons
  - [ ] 🟥 Fixed-time option: input minutes before starting, countdown display
  - [ ] 🟥 `MiniTimer` — compact bar docked at bottom when timer is running (always visible)
  - [ ] 🟥 Start session from task card: "Start Focus" button or keyboard shortcut `s`
  - Microcopy: "Let's go. Timer's running." / "Done. [X] minutes well spent."

- [ ] 🟥 **6.3 Task Switching & Session Splitting**
  - Files: `src/stores/useSessionStore.ts`
  - [ ] 🟥 When user starts focus on different task while session active:
    - End current TimeEntry (`ended_at = now`, compute `duration_seconds`)
    - Create new TimeEntry under same Session with new `task_id`
    - Update `app_state` with new active task/entry
  - [ ] 🟥 Session's `task_id` stays as original task (the one that started it)
  - [ ] 🟥 UI reflects: "Switching gears — we'll track both."
  - Edge cases: Rapid switching (debounce? or allow? — allow, minimum 1s entry)

- [ ] 🟥 **6.4 Timer Persistence & Restore**
  - Files: `src/hooks/useTimerRestore.ts`, `src/stores/useSessionStore.ts`
  - [ ] 🟥 On app launch: check Dexie `app_state` for `activeSessionId`
  - [ ] 🟥 If active session found: restore timer, compute elapsed from `timerStartedAt`
  - [ ] 🟥 Show restore message: "Picked up right where you left off. Timer's still going."
  - [ ] 🟥 If session was running and app was closed for >24h: prompt "Still working on this?"
  - Edge cases: Browser tab close mid-session → `beforeunload` saves state. Refresh → full restore.

- [ ] 🟥 **6.5 Session Keyboard Shortcuts**
  - Files: `src/lib/shortcuts.ts`
  - [ ] 🟥 `s` — Start focus on selected task
  - [ ] 🟥 `Escape` — Stop current session
  - [ ] 🟥 `Space` — Pause/resume timer (when timer is running)
  - [ ] 🟥 When timer running + user presses `1`/`2`/`3` on a task → switch focus to that task

---

## Phase 7: Calendar Rail
> Right-side visual timeline of today's sessions

- [ ] 🟥 **7.1 Calendar Rail Component**
  - Files: `src/components/CalendarRail.tsx`, `src/components/TimeBlock.tsx`
  - [ ] 🟥 Fixed right-side rail in main layout (240px wide)
  - [ ] 🟥 24-hour timeline (or working hours 6AM–midnight), scrolled to current time
  - [ ] 🟥 Each session/time-entry rendered as a colored block:
    - Color derived from task (consistent hash-based color per task)
    - Height proportional to duration
    - Tooltip on hover: task name, start–end, duration
  - [ ] 🟥 Active session block grows in real-time (animated bottom edge)
  - [ ] 🟥 Visual-only — no click/drag interaction on the rail
  - [ ] 🟥 Responsive: rail collapses to icon on narrow viewports, expandable
  - Microcopy empty: "Start a focus session to see your day light up."
  - Microcopy end of day: "Look at that — a colorful day. Nice work."

- [ ] 🟥 **7.2 Daily Session Log**
  - Files: `src/components/SessionLog.tsx`
  - [ ] 🟥 Below calendar rail (or in a tab): list of today's sessions with task name + duration
  - [ ] 🟥 Total time tracked today displayed prominently
  - [ ] 🟥 Group by session, show time entry splits within each

---

## Phase 8: Offline, Polish & Delight
> Offline handling, micro-animations, error UX, final QA

- [ ] 🟥 **8.1 Offline Detection & Sync Queue**
  - Files: `src/hooks/useOnlineStatus.ts`, `src/lib/sync-queue.ts`
  - [ ] 🟥 Detect online/offline via `navigator.onLine` + `online`/`offline` events
  - [ ] 🟥 When offline: all mutations go to Dexie `sync_queue`
  - [ ] 🟥 When back online: flush queue to Supabase in order, handle conflicts
  - [ ] 🟥 Offline indicator in UI: "You're offline. No worries — everything saves locally."
  - [ ] 🟥 Back online toast: "Back online! Syncing your changes now."

- [ ] 🟥 **8.2 Error Handling & Friendly Messages**
  - Files: `src/components/ErrorBoundary.tsx`, `src/components/Toast.tsx`
  - [ ] 🟥 Global error boundary with recovery option
  - [ ] 🟥 Toast notification system for success/error/info messages
  - [ ] 🟥 All error messages use Flowpin tone — never raw API errors
  - [ ] 🟥 Linear key errors: "Oops, this magic word isn't working..."
  - [ ] 🟥 Generic fallback: "Something went sideways. Try again?"

- [ ] 🟥 **8.3 Micro-Animations & Visual Polish**
  - Files: various components, `src/components/animations/`
  - **Animation engine**: [Motion](https://motion.dev/) (already installed in Phase 1) powers all transitions
  - **Delight components**: Pick from [Magic UI](https://magicui.design/) (shadcn/ui companion) and [React Bits](https://www.reactbits.dev/) — copy-paste into `src/components/animations/`. Max 3-5 total.
  - **Animated icons**: [Animate UI](https://animate-ui.com/) for animated Lucide icon variants
  - [ ] 🟥 **Onboarding text animation** — Magic UI `TypingAnimation` or `MorphingText` for "Hey! Ready to flow?" welcome screen
  - [ ] 🟥 **Task completion effect** — Animate UI animated check icon + optional Magic UI `Confetti` for "Today bucket: cleared"
  - [ ] 🟥 **Timer number display** — Magic UI `NumberTicker` for the timer's elapsed/countdown digits
  - [ ] 🟥 Task card: Motion `<AnimatePresence>` + `layout` animations when moving between buckets
  - [ ] 🟥 Task list: Motion `layout` prop for smooth reordering within buckets
  - [ ] 🟥 Timer: subtle pulse animation while running (Tailwind `animate-pulse` or Motion)
  - [ ] 🟥 Calendar rail block: Motion animated height for active session growing in real-time
  - [ ] 🟥 Toast notifications: Motion slide-in/out transitions
  - [ ] 🟥 Keep all animations under 300ms, respect `prefers-reduced-motion`
  - [ ] 🟥 Mobile: disable heavy particle/confetti effects on mobile (graceful degradation)
  - Rule: Magic UI / React Bits / Animate UI components are copy-pasted into project, not npm-installed. You own and maintain the code.

- [ ] 🟥 **8.4 Keyboard Cheatsheet Modal**
  - Files: `src/components/KeyboardCheatsheet.tsx`
  - [ ] 🟥 Triggered by `?` key
  - [ ] 🟥 Lists all shortcuts grouped by category (Navigation, Tasks, Timer)
  - [ ] 🟥 Beautiful, scannable layout — not a wall of text

- [ ] 🟥 **8.5 Responsive Design Pass**
  - Files: various components
  - [ ] 🟥 Mobile width: sections stack vertically, calendar rail collapses, sidebar becomes bottom nav
  - [ ] 🟥 Tablet: 2-column sections + rail
  - [ ] 🟥 Desktop: 3-column sections + rail + full sidebar
  - [ ] 🟥 Mini timer bar adapts to all widths

- [ ] 🟥 **8.6 Final QA Checklist**
  - [ ] 🟥 All keyboard shortcuts work, no conflicts with browser defaults
  - [ ] 🟥 Offline: create task → go offline → refresh → task still there → go online → syncs
  - [ ] 🟥 Timer: start → close tab → reopen → timer restored with correct elapsed
  - [ ] 🟥 Linear: invalid key → clear error → re-enter → works
  - [ ] 🟥 Import rules: set rule → sync → new tasks auto-bucketed → no duplicates
  - [ ] 🟥 RLS: user A cannot see user B's data (test with two accounts)
  - [ ] 🟥 All microcopy matches tone guide — no corporate language, no raw errors

---

## Out of Scope (Post-MVP)
These are explicitly deferred. Do NOT build during MVP phases.
- Electron desktop wrapper + mini window + global shortcuts
- Capacitor mobile wrapper + iOS Live Activities
- Attio integration (scaffold "Coming Soon" UI only — included in Phase 4.2)
- Drag-and-drop between sections/buckets (keyboard-move is MVP, DnD is polish)
- Weekly view / historical analytics
- Multi-device timer takeover prompt
- PWA install prompt + service worker caching
- Dark mode

---

## Design & UI Tooling Stack

Design is critically important to Flowpin. This is the layered stack, each tool has a clear role:

| Layer | Tool | Role | Install Method |
|-------|------|------|----------------|
| **Design tokens** | [PickCSS](https://pickcss.com/) | Generate Tailwind theme — warm palette, playful radius, type scale, spacing. Export shadcn/ui-compatible config. | Export config files, apply once in Phase 1 |
| **Base components** | [shadcn/ui](https://ui.shadcn.com/) | Buttons, cards, dialogs, forms, toasts, dropdowns, layout blocks. Accessible by default (Radix UI). | `npx shadcn@latest add [component]` — copies into `src/components/ui/` |
| **Animation engine** | [Motion](https://motion.dev/) | Powers all transitions: layout animations, mount/unmount, gestures. | `npm install motion` — the only animation npm dependency |
| **Animated components** | [Magic UI](https://magicui.design/) | shadcn/ui companion. TypingAnimation, NumberTicker, Confetti, AnimatedList, MorphingText. | Copy-paste into `src/components/animations/` |
| **Creative effects** | [React Bits](https://www.reactbits.dev/) | Backup for anything Magic UI doesn't cover. TextCursor, SplitText, etc. | Copy-paste into `src/components/animations/` |
| **Animated icons** | [Animate UI](https://animate-ui.com/) | Animated Lucide icon variants for task complete, timer start, etc. | Copy-paste individual icons |
| **Icons** | [Lucide React](https://lucide.dev/) | Consistent icon set throughout. Default for shadcn/ui. | `npm install lucide-react` |

### Rules:
- **PickCSS first** — Generate tokens before writing any UI. This sets the visual DNA.
- **shadcn/ui for structure** — Every form, modal, dropdown, card uses shadcn/ui. Don't hand-roll what it already provides.
- **Motion for movement** — The only npm animation dependency. Use `<motion.div>`, `AnimatePresence`, `layout` prop.
- **Magic UI / React Bits / Animate UI for delight** — Copy-paste only, max 3-5 total components across the app. Use in Phase 8 for high-impact moments.
- **Never mix animation approaches** — Motion is the engine. Magic UI / React Bits use Motion under the hood. Don't also add GSAP, React Spring, or Anime.js.

---

## Estimated Timeline

| Phase | Focus | Est. Days |
|-------|-------|-----------|
| 1 | Foundation (scaffold, DB, shell) | 2 |
| 2 | Auth & Onboarding | 1.5 |
| 3 | Core Task System | 2.5 |
| 4 | Linear Integration | 2 |
| 5 | Import Rules | 1 |
| 6 | Sessions & Timer | 2.5 |
| 7 | Calendar Rail | 1 |
| 8 | Offline, Polish & Delight | 1.5 |
| **Total** | | **~14 days** |
