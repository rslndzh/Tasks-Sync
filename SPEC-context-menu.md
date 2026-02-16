# Flowpin Task Context Menu Spec (Linear-inspired)

## 1. Purpose
Design a fast, reliable task context menu system that feels close to Linear's speed and clarity while fitting Flowpin's model (Today/Sections/Buckets/Focus/Integrations).

This spec covers:
- Desktop context menu (primary)
- Mobile long-press action sheet + bottom action bar (secondary)
- Shortcut hint strategy inside menu
- Action set, ordering, and dynamic visibility rules
- Implementation phases and QA criteria

---

## 2. Product Goals
1. Reduce pointer travel and clicks for common task operations.
2. Make command discovery easy through inline shortcut hints.
3. Keep destructive actions safe and explicit.
4. Support both single-task and multi-task workflows.
5. Keep behavior consistent across Today and Bucket views.

## 3. Non-goals (v1)
1. Full command palette replacement.
2. Rebuilding all task interactions around menu-first usage.
3. Provider-side hard delete (Todoist/Linear/Attio) from Flowpin.
4. Complex nested workflow builders in menu.

---

## 4. Principles
1. **Fast by default**: most-used actions near top.
2. **Context-aware**: show only relevant actions for that task state.
3. **Truthful shortcuts**: only show shortcuts that currently work.
4. **Safe destructive actions**: destructive group at bottom + undo when possible.
5. **Visual familiarity**: Linear-like structure (icon + label + right-aligned shortcut/submenu chevron).

---

## 5. Surfaces

### 5.1 Desktop (primary)
Entry points:
1. Right-click task row.
2. Optional `...` task trigger button on hover (same menu content).
3. Keyboard open (`Shift+F10` and context-menu key) for selected task.

### 5.2 Mobile (secondary)
Entry points:
1. Long-press task row opens bottom action sheet.
2. Multi-select mode shows sticky bottom action bar.

Note: do not force desktop-style tiny popover menus on mobile.

---

## 6. Core Action Model

## 6.1 Single-task Desktop Menu (default order)

### Group A: Open / Focus
1. `Open task`
   - shortcut: `Enter`
2. `Start focus` / `Switch focus to this task`
   - dynamic label based on session state

### Group B: Triage / Section
3. `Move to Today` (`1`) - hide when already in Today
4. `Move to Sooner` (`2`) - hide when already in Sooner
5. `Move to Later` (`3`) - hide when already in Later
6. `Remove from Today` - show only when in Today
   - behavior: move to Sooner (or configured default if we introduce one later)

### Group C: Today Lane (only when Today split enabled)
7. `Move to Now`
8. `Move to Next`

### Group D: Bucket
9. `Move to bucket...` (submenu)
   - list user buckets sorted by sidebar order
   - include current bucket disabled/checked

### Group E: State + External
10. `Mark done` (`D`)
11. `Archive`
12. `Open in source` (integration tasks only)

### Group F: Utility
13. `Copy title`
14. `Copy task link`

### Group G: Destructive
15. `Remove from Flowpin` (destructive)
   - manual tasks: local/supabase removal behavior per data policy
   - integration tasks: remove only in Flowpin (no provider delete)
   - add confirm + undo toast in v1

## 6.2 Multi-select Desktop Menu
When multiple tasks are selected and user opens context menu on one of them, apply actions to full selection where valid.

Allowed in batch:
1. Move to Today/Sooner/Later
2. Remove from Today
3. Move to Now/Next (when all tasks are in Today and split enabled)
4. Move to bucket...
5. Mark done
6. Archive

Not allowed in batch (show disabled or hidden):
1. Open task
2. Open in source
3. Copy task link (single-entity semantics)

---

## 7. Shortcut Hint Spec

## 7.1 Right-aligned hints
Pattern:
- Left: icon + label
- Right: shortcut hint (`1`, `2`, `3`, `D`, `Enter`) OR submenu chevron

## 7.2 Hint truth table
Only display hint if wired today:
1. `Open task` -> `Enter`
2. `Move to Today` -> `1`
3. `Move to Sooner` -> `2`
4. `Move to Later` -> `3`
5. `Mark done` -> `D`

Do not display fake shortcuts in v1.

## 7.3 Expanded keyboard-first shortcut matrix (recommended)
The app should support most menu actions through keyboard, with clear scope rules.

### Task-scoped shortcuts (when a task is selected or hovered and no input is focused)
1. `Enter` -> Open task
2. `F` -> Start focus / switch focus to selected task
3. `1` -> Move to Today
4. `2` -> Move to Sooner
5. `3` -> Move to Later
6. `R` -> Remove from Today (Today -> Sooner)
7. `B` -> Open Move to bucket submenu/menu
8. `W` -> Move to Now (Today split enabled only)
9. `S` -> Move to Next (Today split enabled only)
10. `D` -> Mark done
11. `A` -> Archive
12. `O` -> Open in source (integration tasks only)
13. `T` -> Copy title
14. `Y` -> Copy task link
15. `Shift+Backspace` -> Remove from Flowpin (confirm + undo)

### Selection/navigation shortcuts
1. `ArrowUp` / `K` -> Select previous visible task
2. `ArrowDown` / `J` -> Select next visible task
3. `Shift+ArrowUp` / `Shift+K` -> Extend range up
4. `Shift+ArrowDown` / `Shift+J` -> Extend range down
5. `Cmd/Ctrl+A` -> Select all visible tasks in current list/view
6. `Esc` -> Close menu/dialog, else clear selection

### App/global shortcuts (not task-selection specific)
1. `Cmd/Ctrl+,` -> Open settings (already implemented)
2. `N` -> Reserved for quick-add (currently disabled; do not advertise in UI until re-enabled)
3. `?` -> Open shortcuts help (already implemented)
4. `G` then `T` -> Go to Today
5. `G` then `I` -> Go to Inbox
6. `G` then `B` -> Go to bucket list context (or open bucket switcher)
7. `G` then `R` -> Open Triage Inbox panel/sheet
8. `G` then `S` -> Open Settings
9. `/` -> Open command/search surface (phase 3+, if added)
10. `Space` -> Start/stop focus timer when task context is active (phase 2+)

## 7.4 Collision and scope rules (required)
1. Shortcuts are ignored when typing in `input`, `textarea`, `select`, or contenteditable.
2. Task-scoped shortcuts only run when there is a visible selected or hovered task.
3. Global `G`-prefixed combos use a short timeout (for example 900ms) and should not interfere with normal typing in editors.
4. Destructive shortcuts (`Shift+Backspace`) require confirm and support undo.
5. If a shortcut is unavailable in current context, do nothing and avoid noisy toasts.

## 7.5 Shortcut hint rendering rules
1. Show hint text only when action is currently executable in the same context.
2. Show disabled rows without hints when action is visible but unavailable.
3. Keep hint strings identical to shortcuts tab labels to avoid drift.
4. Shortcut hints must come from centralized shortcut registry, not hardcoded per menu row.

---

## 8. Selection + Invocation Rules

## 8.1 Right click behavior
1. Right-click on unselected task:
   - select only that task
   - open menu for that task
2. Right-click on selected task while multi-select active:
   - keep multi-selection
   - open batch-capable menu
3. Right-click on background:
   - no task menu

## 8.2 Keyboard-open behavior
1. If `selectedTaskId` exists and visible -> open menu for selected task.
2. Else if `hoveredTaskId` exists and visible -> open menu for hovered task.
3. Else no-op.

## 8.3 Menu close behavior
1. `Esc` closes menu only.
2. Existing `Esc` clear-selection behavior should run only when menu is closed.

---

## 9. UI/Visual Spec

## 9.1 Desktop Menu visual direction
1. Width: ~240-280px.
2. Dense row height: 30-34px.
3. Icon column fixed width.
4. Shortcut text muted, monospace-friendly.
5. Section dividers between groups.
6. Destructive rows use destructive foreground.
7. Submenus open to right, aligned with hovered row.

## 9.2 Mobile Action Sheet visual direction
1. Bottom sheet with medium blur/translucency ("liquid glass" feel), but keep contrast high.
2. Large touch targets (44px+).
3. Group actions with separators.
4. Sticky bottom action bar in multi-select mode.

---

## 10. Action Semantics (Important)

## 10.1 Remove from Today
- Behavior: move `section` from `today` -> `sooner`.
- If Today split enabled, clear lane metadata as needed by existing logic.

## 10.2 Delete vs Archive vs Remove
To avoid confusion with provider data:
1. `Mark done`: completion state.
2. `Archive`: existing archive flow.
3. `Remove from Flowpin`: explicit local app removal semantics.

Do not label as `Delete` if it does not delete remotely.

## 10.3 Integration tasks
`Open in source` shown when `task.source !== manual` and task has URL available/mappable.

---

## 11. Accessibility Requirements
1. Use Radix menu semantics (`menu`, `menuitem`, `menuitemcheckbox`, `submenu`).
2. Full keyboard navigation:
   - Arrow up/down within menu
   - Enter/Space activate
   - Esc close
   - Arrow right/left for submenu
3. Screen reader labels should include action + target count for batch operations.
4. Focus should return to invoking task row after close.

---

## 12. Technical Architecture

## 12.1 New UI components (proposed)
1. `TaskContextMenu` (desktop wrapper)
2. `TaskActionSheet` (mobile long-press)
3. `TaskBulkActionBar` (mobile + desktop optional)
4. `useTaskActions()` (shared action resolver + handlers)

## 12.2 Shared action descriptor model
Define an action registry object:

- `id`
- `label`
- `icon`
- `shortcutHint`
- `isVisible(context)`
- `isEnabled(context)`
- `run(context)`
- `group`
- optional `children` (submenu)

Context input:
- selected tasks
- primary task
- current view (`today`/`bucket`)
- today split enabled
- session running state
- integration/manual source info

## 12.3 State additions
Likely no persistence required.
Ephemeral UI state only:
- active context target task id
- menu open/close state
- long-press state (mobile)

---

## 13. Implementation Plan

## Phase 1 (Desktop v1, single-task)
1. Build `TaskContextMenu` on task row right-click.
2. Implement groups A/B/E with true shortcut hints.
3. Wire `Remove from Today` behavior.
4. Add `Open in source` where possible.
5. Expand central shortcut registry for task-scoped actions (`F`, `R`, `B`, `A`, `O`, `T`, `Y`).

## Phase 2 (Desktop v1.1, batch + bucket submenu)
1. Multi-select-aware menu.
2. `Move to bucket...` submenu.
3. Batch-capable actions.
4. Add non-task global `G` navigation combos.
5. Add `Cmd/Ctrl+A` visible-list select all.

## Phase 3 (Mobile v1)
1. Long-press bottom sheet.
2. Sticky bottom bulk action bar.
3. Action parity for core triage operations.

## Phase 4 (Polish)
1. Add timer/global extras (`Space` timer control, `/` command surface) if implemented.
2. Undo toasts + optional confirmation for destructive actions.
3. Micro-interaction polish.
4. Telemetry review and shortcut adoption tuning.

---

## 14. QA Matrix

## 14.1 Desktop interaction
1. Right-click unselected task -> selects it + opens menu.
2. Right-click selected task in multi-select -> keeps range.
3. `Esc` closes menu, second `Esc` clears selection.
4. Submenu navigation works by keyboard.

## 14.2 Action correctness
1. `Remove from Today` always moves to Sooner.
2. Move actions update UI and persist sync correctly.
3. Batch actions apply to all selected tasks only.
4. `Open in source` opens correct provider URL.

## 14.3 Edge states
1. Today split ON/OFF changes lane action visibility.
2. Manual vs integration tasks show correct actions.
3. Works in Today and Bucket pages with visible-order selection model.

## 14.4 Mobile
1. Long-press opens sheet without accidental drag.
2. Actions are reachable one-handed.
3. Bottom bar appears and clears correctly in multi-select mode.

## 14.5 Keyboard-first QA
1. Every displayed shortcut hint triggers the same action.
2. Shortcuts do not fire while typing in any editable field.
3. `G`-prefixed navigation works with timeout and does not conflict with task actions.
4. `Cmd/Ctrl+A` selects only visible tasks in current list context.
5. Destructive shortcuts require confirmation and allow undo.

## 14.6 Deep Playwright validation (required before merge)
Run a scripted Playwright pass on desktop breakpoints and, where relevant, mobile viewport.

Mandatory desktop scenarios:
1. Right-click unopened task -> task becomes selected and menu opens.
2. Right-click within existing multi-select -> selection preserved and batch actions visible.
3. Hover-only anchor + `Shift+ArrowDown` -> range selection expands from hovered task.
4. `ArrowUp/ArrowDown` + `Shift` range behavior in both Today and Bucket views.
5. `Remove from Today` action moves task to Sooner and sync state remains healthy.
6. `Move to bucket...` submenu opens and applies move correctly.
7. Shortcut hints visible in menu match actual key behavior.
8. `Esc` first closes menu, second clears selection.
9. Integration task shows `Open in source`; manual task hides it.
10. Destructive action requires confirm and allows undo.

Mandatory mobile scenarios:
1. Long-press opens bottom action sheet without triggering drag.
2. Core actions in sheet execute and close correctly.
3. Multi-select bottom bar actions apply to all selected tasks.

Automation artifacts required:
1. Playwright logs for each scenario group.
2. At least one screenshot per major surface (desktop menu, submenu, mobile sheet).
3. Final checklist summary in PR/merge note.

---

## 15. Risks + Mitigations
1. **Conflict with drag-and-drop**
   - Mitigation: bind context menu to right-click/long-press thresholds that do not steal drag start.
2. **Action inconsistency between surfaces**
   - Mitigation: shared action descriptor registry.
3. **User confusion around delete semantics**
   - Mitigation: explicit label `Remove from Flowpin`, not generic `Delete`.
4. **Shortcut hint drift**
   - Mitigation: generate hints from actual shortcut registry where possible.

---

## 16. Open Decisions
1. Should `Remove from Today` always go to `Sooner`, or support user preference?
2. Should `Archive` be exposed by default or behind `More` in v1?
3. Should `Remove from Flowpin` require confirmation every time, or rely on undo?
4. For mobile, do we launch with full sheet parity or a compact 5-action set first?

---

## 17. Recommended MVP Cut
If we want fastest high-impact rollout, ship this first:
1. Desktop right-click menu on task rows.
2. Actions: Open task, Move to Today/Sooner/Later, Remove from Today, Mark done, Archive.
3. Accurate shortcut hints for mapped actions.
4. No mobile sheet in first deploy.

Then follow with mobile + advanced submenus in next iteration.

---

## 18. Shortcuts Instruction Update Plan
Keyboard-first UX requires one source of truth and consistent user education.

## 18.1 Source-of-truth changes
1. Expand `src/lib/shortcuts.ts` to include scope metadata:
   - `task`
   - `selection`
   - `global`
   - `menu`
2. Add optional fields:
   - `availableWhen`
   - `hiddenWhenUnavailable`
   - `platformLabel` (Mac/Windows variants)
3. Generate menu hint strings from this registry instead of hardcoding.

## 18.2 Shortcuts settings tab redesign
1. Group by intent, not key:
   - Task actions
   - Selection/navigation
   - Global navigation
   - UI/system
2. Show context chips like `Task selected`, `Anytime`, `Desktop only`.
3. Add quick search/filter by action name or key.
4. Add inline "try now" examples for high-value shortcuts.
5. Hide `N` quick-add from visible reference while add-task is disabled.

## 18.3 Behavioral docs in-app
1. Explicitly document hover fallback (`hover + Shift+Arrow` range select).
2. Explain `G`-prefixed navigation with timeout.
3. Explain destructive shortcut safeguards.

---

## 19. Where to Show Shortcut Tips
Shortcut discoverability should be layered across key surfaces.

## 19.1 High-frequency surfaces
1. Task context menu right column hints.
2. Tooltips on action icons/buttons (for example Start focus button shows `F`).
3. Multi-select bottom/inline action bars with right-aligned key hints.

## 19.2 Workflow surfaces
1. Empty states:
   - Today empty: show triage/navigation tips (`ArrowUp/ArrowDown`, `1/2/3`, `D`)
   - Triage list: show `1/2/3` move hints
2. Onboarding keyboard step:
   - Arrow navigation
   - `1/2/3`
   - `D`
3. Success toasts:
   - after using mouse action, mention shortcut once (for example "Moved to Today - Tip: press 1").

## 19.3 Reference surfaces
1. Settings -> Shortcuts tab as canonical reference.
2. `?` overlay with compact cheat sheet.
3. Optional command surface header/footer showing key equivalents.

## 19.4 Tip fatigue rules
1. Do not spam repeated shortcut tips after user demonstrates usage.
2. Hide repetitive hints after N successful uses.
3. Keep destructive shortcut tips opt-in or low-frequency.
