# Task Detail Page — Implementation Plan

**Overall Progress:** `100%`

## TLDR

Add a dedicated task page (`/app/task/:taskId`) that opens on double-click or Enter, showing the original integration description (read-only), a Tiptap WYSIWYG editor for user notes, bucket/section pickers, session controls, and a time entries log.

## Critical Decisions

- **Two description fields** — add `source_description: string | null` to `LocalTask` for the read-only integration description; `description` becomes the user's own notes edited via Tiptap. Requires Dexie v5 migration.
- **Editor: Tiptap** — battle-tested, Tailwind-friendly, supports markdown serialization and slash commands (`/heading`, `/list`, `/code`). Install `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/extension-link`.
- **Auto-save on debounce** — 500ms after typing stops, persist to Dexie. No explicit save button.
- **Open triggers** — double-click on task card + Enter key when task is selected.
- **Calendar rail stays visible** — task page renders inside the existing Layout `<Outlet>`, so the right rail remains.
- **Activity log: time entries** — query `timeEntries` table by `task_id`, render as a simple chronological list with duration and date. No complex activity feed for now.

---

## Tasks

### Step 1: Schema migration — add `source_description` to LocalTask

- Files: `src/types/local.ts`, `src/types/database.ts`, `src/lib/db.ts`
- [ ] 🟥 Add `source_description: string | null` to `LocalTask` interface
- [ ] 🟥 Add `source_description` to Supabase `TaskRow` type
- [ ] 🟥 Bump Dexie to v5 with upgrade function: for tasks where `source !== "manual"` and `description` is not null, copy `description` → `source_description`
- [ ] 🟥 Update Linear integration mapper (`src/integrations/linear.ts`) to write `source_description` instead of `description` on import
- [ ] 🟥 Update Todoist integration mapper (`src/integrations/todoist.ts`) same
- [ ] 🟥 Update `useTaskStore.addTask` to default `source_description: null`
- Edge cases: existing tasks with integration descriptions must be migrated via the Dexie upgrade

---

### Step 2: Install Tiptap and create the editor component

- Files: `package.json`, `src/components/TiptapEditor.tsx`
- [ ] 🟥 Install: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/extension-link`
- [ ] 🟥 Create `TiptapEditor` component:
  - Props: `content: string | null`, `onChange: (markdown: string) => void`, `placeholder?: string`
  - Uses `StarterKit` (bold, italic, headings, lists, code, blockquote, hr)
  - `Link` extension for clickable links
  - `Placeholder` extension with warm microcopy ("Jot down your thoughts…")
  - Bubble menu toolbar on text selection (bold, italic, link, code)
  - Slash command menu (`/`) for heading, bullet list, numbered list, code block, quote
  - Tailwind-styled, matches app's design system (bg-card, border, rounded)
  - Auto-save: calls `onChange` debounced at 500ms after content changes
  - Keyboard: Cmd+B bold, Cmd+I italic, etc. (built into Tiptap)

---

### Step 3: Create TaskPage component

- Files: `src/pages/TaskPage.tsx`
- [ ] 🟥 Route param: `useParams<{ taskId: string }>()`
- [ ] 🟥 Find task from `useTaskStore` by `taskId`
- [ ] 🟥 Back navigation: button at top showing "← Bucket Name" or "← Today", uses `useNavigate(-1)` or explicit route
- [ ] 🟥 Layout (top to bottom, max-w-2xl centered):
  1. **Back bar** — "← Bucket Name" link + source badge if integration ("Linear · LIN-42")
  2. **Title** — editable inline `<input>`, auto-saves on blur/Enter via `updateTask`
  3. **Meta bar** — Bucket picker (`<Select>`), Section picker (`<Select>`), Estimate field (editable number input)
  4. **Original description** — collapsible section, rendered as read-only markdown (only shown when `source_description` is not null). Label: "From Linear" / "From Todoist"
  5. **My Notes** — `TiptapEditor` bound to `task.description`, auto-saves via `updateTask`
  6. **Actions** — Start Focus / Complete / Archive buttons (reuse logic from TaskCard)
  7. **Time entries log** — list of time entries for this task, showing date + duration
- [ ] 🟥 Show 404-style message if task not found ("This task seems to have wandered off…")

---

### Step 4: Add route and navigation wiring

- Files: `src/App.tsx`, `src/components/SortableTaskCard.tsx`, `src/hooks/useKeyboardShortcuts.ts`
- [ ] 🟥 Add route: `<Route path="task/:taskId" element={<TaskPage />} />` inside the `/app` layout
- [ ] 🟥 Add `onDoubleClick` handler to `SortableTaskCard` → `navigate(\`/app/task/${task.id}\`)`
- [ ] 🟥 Add `Enter` key handler in `useKeyboardShortcuts.ts`: when a task is selected and Enter is pressed, navigate to `/app/task/${selectedTaskId}`
- [ ] 🟥 Ensure double-click doesn't conflict with single-click selection or drag activation (dnd-kit's 8px threshold already separates click vs drag; double-click just needs to not also trigger select)

---

### Step 5: Time entries query and activity log

- Files: `src/stores/useSessionStore.ts` (or new hook), `src/pages/TaskPage.tsx`
- [ ] 🟥 Add `getTimeEntriesByTask(taskId: string)` query — reads from Dexie `timeEntries` table filtered by `task_id`, sorted by `started_at` descending
- [ ] 🟥 Render in TaskPage as a compact list:
  - Each entry: date (relative — "Today", "Yesterday", "Feb 10"), start time, duration
  - Group by day if multiple entries
  - Empty state: "No focus time logged yet — ready to start?"
- Edge cases: entries with `ended_at === null` (active entry) should show "In progress…" with a live counter

---

### Step 6: Markdown rendering for source description

- Files: `src/components/MarkdownRenderer.tsx`
- [ ] 🟥 Install a lightweight markdown-to-React renderer (e.g., `react-markdown` + `remark-gfm`)
- [ ] 🟥 Create `MarkdownRenderer` component — renders markdown string as styled HTML
  - Tailwind prose styling (`prose prose-sm dark:prose-invert`)
  - Supports: headings, lists, links, code blocks, bold/italic, tables (GFM)
- [ ] 🟥 Use in TaskPage's "Original description" collapsible section

---

### Step 7: Polish and edge cases

- Files: various
- [ ] 🟥 Keyboard: `Escape` on TaskPage navigates back (same as browser back)
- [ ] 🟥 If task is deleted/archived while viewing, show friendly message and auto-redirect after 2s
- [ ] 🟥 Offline: all reads are from Dexie, so TaskPage works fully offline. Writes go through existing Dexie → Zustand flow.
- [ ] 🟥 Run linter on all new/modified files, fix any issues
