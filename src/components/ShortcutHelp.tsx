import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SHORTCUTS } from "@/lib/shortcuts"

/**
 * Keyboard shortcuts cheatsheet modal.
 * Opens via `?` key or custom event.
 */
export function ShortcutHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleShow() {
      setOpen(true)
    }
    window.addEventListener("flowpin:show-shortcuts", handleShow)
    return () => window.removeEventListener("flowpin:show-shortcuts", handleShow)
  }, [])

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
        SHORTCUTS.setEstimate,
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.items.filter((shortcut) => shortcut.enabled !== false).map((shortcut) => (
                  <div
                    key={shortcut.key}
                    className="flex items-center justify-between rounded px-2 py-1.5 text-sm"
                  >
                    <span>{shortcut.description}</span>
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono">
                      {shortcut.label}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
