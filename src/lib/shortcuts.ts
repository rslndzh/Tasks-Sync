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
  /** Whether to prevent default browser behavior */
  preventDefault?: boolean
}

export const SHORTCUTS: Record<string, Shortcut> = {
  // Section moves
  moveToToday: { key: "1", label: "1", description: "Move task to Today" },
  moveToSooner: { key: "2", label: "2", description: "Move task to Sooner" },
  moveToLater: { key: "3", label: "3", description: "Move task to Later" },

  // Navigation
  arrowUp: { key: "ArrowUp", label: "↑", description: "Select previous task" },
  arrowDown: { key: "ArrowDown", label: "↓", description: "Select next task" },

  // Actions
  newTask: { key: "n", label: "N", description: "Create new task", preventDefault: true },
  editTask: { key: "e", label: "E", description: "Edit selected task" },
  completeTask: { key: "d", label: "D", description: "Complete selected task" },
  completeTaskEnter: { key: "Enter", label: "Enter", description: "Complete selected task" },

  // UI
  showHelp: { key: "?", label: "?", description: "Show keyboard shortcuts" },
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
