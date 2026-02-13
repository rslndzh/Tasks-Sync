# Drag & Drop Implementation Plan

**Overall Progress:** `100%`

## TLDR
Add full drag-and-drop powered by **dnd-kit** across the entire app: reorder tasks in Today, drag between sections in BucketPage, drag onto sidebar buckets, drag inbox items into buckets/sections, and multi-select drag.

## Critical Decisions
- **Library: dnd-kit** — best React DnD lib for multi-container sortable, keyboard DnD, touch support, and multi-select overlay. ~15 kB, active maintenance, React 19 compatible.
- **Multi-select model: Zustand Set** — `selectedTaskIds: Set<string>` in `useTaskStore`, toggled via Cmd/Ctrl+Click and Shift+Click. Single-click clears selection to one.
- **Drag overlay** — custom `DragOverlay` component showing dragged task(s) preview, with a count badge for multi-drag ("3 tasks").
- **Position persistence** — reorder writes new `position` values to Dexie immediately. No Supabase sync needed for MVP (offline-first, positions are local).
- **Collision strategy** — `pointerWithin` for cross-container drops (better than `closestCenter` for nested layouts with sidebar + columns).

## Packages
```
@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

## Tasks:

- [x] 🟩 **Step 1: Install dnd-kit + store changes**
  - Files: `package.json`, `src/stores/useTaskStore.ts`
  - [ ] 🟥 Install `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
  - [ ] 🟥 Add `selectedTaskIds: Set<string>` to `useTaskStore`
  - [ ] 🟥 Add `toggleSelectTask(id, multi)` — Cmd/Ctrl-click adds/removes, plain click selects only that one
  - [ ] 🟥 Add `selectRange(fromId, toId)` — for Shift+Click range selection within a list
  - [ ] 🟥 Add `clearSelection()` 
  - [ ] 🟥 Add `reorderTask(id, newPosition, newBucketId?, newSection?)` — moves task + recalculates positions for affected siblings, persists to Dexie
  - [ ] 🟥 Add `moveTasksBatch(ids, targetBucketId, targetSection, insertPosition?)` — multi-drag import, persists to Dexie

- [x] 🟩 **Step 2: DndProvider + DragOverlay**
  - Files: `src/components/DndProvider.tsx` (new), `src/components/DragOverlay.tsx` (new)
  - [ ] 🟥 Create `DndProvider` — wraps children in `DndContext` with sensors (`PointerSensor` with 8px activation distance, `KeyboardSensor` with `sortableKeyboardCoordinates`), collision detection (`pointerWithin`), global `onDragStart` / `onDragOver` / `onDragEnd` handlers
  - [ ] 🟥 Create `TaskDragOverlay` — renders inside `DragOverlay` from dnd-kit. Shows a snapshot of the dragged TaskCard. If multi-select, shows stacked cards + "N tasks" badge
  - [ ] 🟥 Wrap the app layout in `DndProvider` (inside Layout.tsx, around the main flex container)
  - Edge cases: The DragOverlay is portal-rendered, so it works across sidebar/main/rail boundaries

- [x] 🟩 **Step 3: Sortable tasks in TodayPage**
  - Files: `src/pages/TodayPage.tsx`, `src/components/SortableTaskCard.tsx` (new)
  - [ ] 🟥 Create `SortableTaskCard` — wraps `TaskCard` with `useSortable`, adds drag handle + transform/transition styles + multi-select click handlers
  - [ ] 🟥 Wrap TodayPage task list in `SortableContext` (strategy: `verticalListSortingStrategy`)
  - [ ] 🟥 Handle `onDragEnd` — call `reorderTask` to persist new positions
  - [ ] 🟥 Multi-select: Cmd/Ctrl+Click to toggle, Shift+Click for range
  - Edge cases: When multi-dragging, all selected tasks move together to the drop position

- [x] 🟩 **Step 4: Cross-section DnD in BucketPage**
  - Files: `src/pages/BucketPage.tsx`, `src/components/SectionColumn.tsx`
  - [ ] 🟥 Each `SectionColumn` gets a `SortableContext` with a unique group ID (e.g. `today-{bucketId}`, `sooner-{bucketId}`, `later-{bucketId}`)
  - [ ] 🟥 `SectionColumn` becomes a droppable container (via `useDroppable` or by making it the sortable context boundary)
  - [ ] 🟥 Replace `TaskCard` usage with `SortableTaskCard` inside columns
  - [ ] 🟥 Handle cross-container `onDragOver` — detect when a task hovers over a different section, update placeholder position
  - [ ] 🟥 Handle `onDragEnd` — if section changed, call `moveToSection` + `reorderTask`; if same section, just `reorderTask`
  - Edge cases: Multi-drag across sections moves all selected tasks into the target section at the drop position

- [x] 🟩 **Step 5: Drop onto sidebar buckets** (done in Step 2 — Layout rewritten with DroppableBucketItem)
  - Files: `src/components/Layout.tsx`
  - [ ] 🟥 Wrap each sidebar bucket link in `useDroppable` with `id: bucket-{bucketId}`
  - [ ] 🟥 Show visual drop indicator when dragging over a bucket (highlight border/bg)
  - [ ] 🟥 On drop: call `moveToBucket` (single) or `moveTasksBatch` (multi) — keeps the task's current section, just changes the bucket
  - [ ] 🟥 Remove the old native HTML5 DnD reorder code (replaced by dnd-kit)
  - Edge cases: Dropping on the currently-viewed bucket should be a no-op (same bucket)

- [x] 🟩 **Step 6: Drag from integration inbox**
  - Files: `src/components/InboxItemCard.tsx`, `src/components/IntegrationInboxPanel.tsx`
  - [ ] 🟥 Make `InboxItemCard` draggable with `useDraggable` (not sortable — no reorder within inbox)
  - [ ] 🟥 The drag data carries the `InboxItem` payload
  - [ ] 🟥 When dropped onto a `SectionColumn` or sidebar bucket, auto-import the item via `useConnectionStore.importItem`
  - [ ] 🟥 Visual: different drag overlay style for inbox items (shows "Import to..." text)
  - Edge cases: If dropped outside a valid target, nothing happens (item stays in inbox)

- [x] 🟩 **Step 7: Polish + sidebar bucket reorder**
  - Files: `src/components/Layout.tsx`, various
  - [ ] 🟥 Migrate sidebar bucket reorder from native HTML5 DnD to dnd-kit `SortableContext`
  - [ ] 🟥 Add drag handle cursor on task cards (grab → grabbing)
  - [ ] 🟥 Smooth drop animations via dnd-kit's built-in CSS transitions
  - [ ] 🟥 Keyboard DnD: Space to pick up, Arrow keys to move, Space to drop, Escape to cancel
  - [ ] 🟥 Touch: verify PointerSensor works on mobile/touch (it does by default)
  - [ ] 🟥 Accessibility: ARIA live region announcements for drag start/over/end
