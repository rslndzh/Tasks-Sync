# Mobile-Ready UI — Implementation Plan

**Overall Progress:** `100%`

## TLDR
Add a bottom tab bar, sheet-based panels, and touch-friendly patterns so the web app is fully usable on phones (< 768px) — no Capacitor/Electron yet, just responsive web.

## Critical Decisions
- **Bottom nav over hamburger menu** — tab bars are faster for frequent switching (Today/Buckets/Integrations); hamburger hides navigation behind a tap
- **shadcn Sheet for mobile panels** — buckets list + integration inbox open as bottom sheets on mobile; reuses existing panel components inside the sheet
- **No swipe gestures in MVP** — adds complexity + conflicts with browser back-swipe; hover actions become visible-always on touch via `@media (hover: none)` or just always showing on small screens
- **Keep existing desktop layout untouched** — mobile is additive (`md:hidden` / `hidden md:flex`); zero risk of breaking desktop

## Tasks:

- [x] 🟩 **Step 1: Install shadcn Sheet component**
  - Files: `src/components/ui/sheet.tsx`
  - [x] 🟩 Run `npx shadcn@latest add sheet`
  - Edge cases: None — pure UI primitive install

- [x] 🟩 **Step 2: Create BottomNav component**
  - Files: `src/components/BottomNav.tsx`
  - [x] 🟩 Fixed bottom bar, visible only below `md` (`md:hidden`)
  - [x] 🟩 5 tabs: **Today** (Sun), **Inbox** (Inbox icon, links to default bucket), **Buckets** (FolderClosed, opens sheet), **Integrations** (Layers, opens sheet), **Settings** (gear, triggers settings dialog)
  - [x] 🟩 Active tab highlighted with primary color
  - [x] 🟩 Badge counts on Inbox (task count) and Integrations (total triage count)
  - [x] 🟩 Safe area bottom padding: `pb-[env(safe-area-inset-bottom)]` for future Capacitor
  - Edge cases: Timer sits above the nav — handled via mb-14 on MiniTimer

- [x] 🟩 **Step 3: Mobile Buckets Sheet**
  - Files: `src/components/MobileBucketsSheet.tsx`
  - [x] 🟩 Opens from BottomNav "Buckets" tab
  - [x] 🟩 Lists all buckets with task counts (reuses same data as sidebar)
  - [x] 🟩 Tapping a bucket navigates to `/app/bucket/:id` and closes sheet
  - [x] 🟩 "New Bucket" button at the bottom opens CreateBucketDialog via custom event
  - Edge cases: Sheet closes on navigation via location change listener

- [x] 🟩 **Step 4: Mobile Integrations Sheet**
  - Files: `src/components/MobileIntegrationsSheet.tsx`
  - [x] 🟩 Opens from BottomNav "Integrations" tab
  - [x] 🟩 Lists active connections as horizontal tabs
  - [x] 🟩 Each connection renders its `IntegrationInboxPanel` inside the sheet
  - [x] 🟩 Import actions work via tap-to-expand (mobile flow)
  - Edge cases: DnD won't work in sheets — that's fine, tap-to-import is the mobile flow

- [x] 🟩 **Step 5: Wire BottomNav into Layout**
  - Files: `src/components/Layout.tsx`
  - [x] 🟩 Added `<BottomNav />` inside the layout after DndProvider div
  - [x] 🟩 MiniTimer renders above BottomNav (mb-14 md:mb-0)
  - [x] 🟩 Main content has bottom padding on mobile (pb-14 md:pb-0)
  - Edge cases: Timer + bottom nav stacking — both visible, timer above nav

- [x] 🟩 **Step 6: Touch-friendly action buttons on task cards**
  - Files: `src/components/TaskCard.tsx`, `src/components/InboxItemCard.tsx`
  - [x] 🟩 On mobile, action buttons always visible (no hover state); metadata hidden (shown on md+ hover swap)
  - [x] 🟩 Tap targets increased to size-8 (32px) on mobile, size-6 on desktop
  - Edge cases: Desktop hover behavior unchanged — metadata shows by default, buttons on hover

- [x] 🟩 **Step 7: Mobile page adjustments**
  - Files: `src/pages/TodayPage.tsx`, `src/pages/BucketPage.tsx`, `src/pages/TaskPage.tsx`
  - [x] 🟩 Reduced padding on small screens (px-3 py-4 md:p-6)
  - [x] 🟩 Smaller header icons + titles on mobile (size-8/text-xl vs size-10/text-2xl)
  - [x] 🟩 Today subtitle hidden on mobile to save vertical space
  - [x] 🟩 TaskPage back button always visible (works on mobile since no sidebar)
  - Edge cases: TaskPage works when navigated to directly via URL on mobile
