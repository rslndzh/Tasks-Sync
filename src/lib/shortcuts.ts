/**
 * Centralized keyboard shortcut registry.
 *
 * Convention: single-key shortcuts (no modifiers) for fast triage.
 * All shortcuts are disabled when an input/textarea is focused.
 */

export interface Shortcut {
  key: string
  label: string
  description: string
  scope: "task" | "selection" | "global" | "ui"
  /** Whether the shortcut is currently available in product UI */
  enabled?: boolean
  /** Whether to prevent default browser behavior */
  preventDefault?: boolean
}

export const SHORTCUTS: Record<string, Shortcut> = {
  // Task actions
  openTask: { key: "Enter", label: "Enter", description: "Open selected task", scope: "task" },
  startFocus: { key: "f", label: "F", description: "Start/switch focus to selected task", scope: "task" },
  moveToToday: { key: "1", label: "1", description: "Move task to Today", scope: "task" },
  moveToSooner: { key: "2", label: "2", description: "Move task to Sooner", scope: "task" },
  moveToLater: { key: "3", label: "3", description: "Move task to Later", scope: "task" },
  removeFromToday: { key: "r", label: "R", description: "Remove selected task(s) from Today", scope: "task" },
  setEstimate: { key: "e", label: "E", description: "Set estimate in minutes", scope: "task" },
  moveToBucket: { key: "b", label: "B", description: "Open move-to-bucket menu", scope: "task" },
  completeTask: { key: "d", label: "D", description: "Mark selected task(s) done", scope: "task" },
  archiveTask: { key: "a", label: "A", description: "Archive selected task(s)", scope: "task" },
  openInSource: { key: "o", label: "O", description: "Open selected integration task in source app", scope: "task" },
  copyTitle: { key: "t", label: "T", description: "Copy selected task title", scope: "task" },
  copyTaskLink: { key: "y", label: "Y", description: "Copy selected task link", scope: "task" },

  // Selection/navigation
  arrowUp: { key: "ArrowUp", label: "↑", description: "Select previous visible task", scope: "selection" },
  arrowDown: { key: "ArrowDown", label: "↓", description: "Select next visible task", scope: "selection" },
  rangeUp: { key: "Shift+ArrowUp", label: "Shift+↑", description: "Extend selection up", scope: "selection" },
  rangeDown: { key: "Shift+ArrowDown", label: "Shift+↓", description: "Extend selection down", scope: "selection" },
  selectAll: { key: "Mod+a", label: "Cmd/Ctrl+A", description: "Select all visible tasks", scope: "selection" },
  clearSelection: { key: "Escape", label: "Esc", description: "Close menu/dialog or clear selection", scope: "selection" },

  // Global/UI
  openSettings: { key: "Mod+,", label: "Cmd/Ctrl+,", description: "Open Settings", scope: "global" },
  reservedQuickAdd: {
    key: "n",
    label: "N",
    description: "Reserved for quick-add (disabled for now)",
    scope: "global",
    enabled: false,
  },
  showHelp: { key: "?", label: "?", description: "Show keyboard shortcuts", scope: "ui" },
}

/**
 * Check if keyboard events should be ignored
 * (e.g., user is typing in an input).
 */
export function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    (el as HTMLElement).isContentEditable
  )
}
