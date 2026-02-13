import { SHORTCUTS } from "@/lib/shortcuts"

/**
 * Shortcuts tab — keyboard shortcuts reference (moved from ShortcutHelp modal).
 */
export function ShortcutsTab() {
  const groups = [
    {
      title: "Navigation",
      items: [SHORTCUTS.arrowUp, SHORTCUTS.arrowDown],
    },
    {
      title: "Triage",
      items: [SHORTCUTS.moveToToday, SHORTCUTS.moveToSooner, SHORTCUTS.moveToLater],
    },
    {
      title: "Actions",
      items: [SHORTCUTS.newTask, SHORTCUTS.editTask, SHORTCUTS.completeTask],
    },
    {
      title: "UI",
      items: [SHORTCUTS.showHelp],
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">Keyboard Shortcuts</h3>
        <p className="text-xs text-muted-foreground">
          Every action, one keystroke away. That&apos;s the Flowpin way.
        </p>
      </div>

      {groups.map((group) => (
        <div key={group.title}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.title}
          </h4>
          <div className="space-y-1">
            {group.items.map((shortcut) => (
              <div
                key={shortcut.key}
                className="flex items-center justify-between rounded px-2 py-1.5 text-sm"
              >
                <span>{shortcut.description}</span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {shortcut.label}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
