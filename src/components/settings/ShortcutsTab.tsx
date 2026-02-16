import { SHORTCUTS } from "@/lib/shortcuts"

/**
 * Shortcuts tab — keyboard shortcuts reference (moved from ShortcutHelp modal).
 */
export function ShortcutsTab() {
  const groups = [
    {
      title: "Task Actions",
      items: [
        SHORTCUTS.openTask,
        SHORTCUTS.startFocus,
        SHORTCUTS.moveToToday,
        SHORTCUTS.moveToSooner,
        SHORTCUTS.moveToLater,
        SHORTCUTS.removeFromToday,
        SHORTCUTS.moveToBucket,
        SHORTCUTS.completeTask,
        SHORTCUTS.archiveTask,
        SHORTCUTS.openInSource,
        SHORTCUTS.copyTitle,
        SHORTCUTS.copyTaskLink,
      ],
    },
    {
      title: "Selection",
      items: [
        SHORTCUTS.arrowUp,
        SHORTCUTS.arrowDown,
        SHORTCUTS.rangeUp,
        SHORTCUTS.rangeDown,
        SHORTCUTS.selectAll,
        SHORTCUTS.clearSelection,
      ],
    },
    {
      title: "Global",
      items: [SHORTCUTS.openSettings, SHORTCUTS.showHelp],
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
            {group.items.filter((shortcut) => shortcut.enabled !== false).map((shortcut) => (
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
