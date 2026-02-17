import { useMemo } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Archive, ArrowUpToLine, Check, Clock3, Copy, ExternalLink, FolderInput, Play, Sun, Zap } from "lucide-react"
import { toast } from "sonner"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { SHORTCUTS } from "@/lib/shortcuts"
import { getTaskAppUrl, getTaskSourceUrl } from "@/lib/task-links"
import { openEstimateDialog } from "@/lib/estimate-dialog"
import { useTaskStore } from "@/stores/useTaskStore"
import { useBucketStore } from "@/stores/useBucketStore"
import { useSessionStore } from "@/stores/useSessionStore"
import type { LocalTask } from "@/types/local"
import type { SectionType } from "@/types/database"

interface TaskContextMenuProps {
  task: LocalTask
  children: React.ReactNode
}

/**
 * Desktop task context menu (Linear-inspired).
 * Uses the same action handlers as keyboard shortcuts to keep behavior consistent.
 */
export function TaskContextMenu({ task, children }: TaskContextMenuProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const tasks = useTaskStore((s) => s.tasks)
  const selectedTaskIds = useTaskStore((s) => s.selectedTaskIds)
  const moveToSection = useTaskStore((s) => s.moveToSection)
  const moveToBucket = useTaskStore((s) => s.moveToBucket)
  const completeTask = useTaskStore((s) => s.completeTask)
  const archiveTask = useTaskStore((s) => s.archiveTask)
  const buckets = useBucketStore((s) => s.buckets)
  const { isRunning, activeTaskId, startSession, switchTask } = useSessionStore()

  const targetIds = useMemo(() => {
    if (selectedTaskIds.size > 1 && selectedTaskIds.has(task.id)) {
      return [...selectedTaskIds]
    }
    return [task.id]
  }, [selectedTaskIds, task.id])

  const targetTasks = useMemo(() => {
    const ids = new Set(targetIds)
    return tasks.filter((t) => ids.has(t.id))
  }, [targetIds, tasks])
  const isBatch = targetTasks.length > 1

  const canMoveTo = (section: SectionType): boolean => {
    return targetTasks.some((t) => t.section !== section)
  }
  const hasTodayTarget = targetTasks.some((t) => t.section === "today")

  const sourceUrl = getTaskSourceUrl(task)

  async function copyText(value: string, okMessage: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(okMessage)
    } catch {
      toast.error("Clipboard is unavailable in this browser.")
    }
  }

  async function runOnTargets(effect: (id: string) => Promise<void>, filter?: (t: LocalTask) => boolean): Promise<void> {
    const selected = filter ? targetTasks.filter(filter) : targetTasks
    for (const t of selected) {
      await effect(t.id)
    }
  }

  const focusLabel = !isRunning
    ? "Start focus"
    : (activeTaskId === task.id ? "Focused now" : "Switch focus here")

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>

      <ContextMenuContent className="w-64">
        {!isBatch && (
          <>
            <ContextMenuItem onSelect={() => navigate(`/task/${task.id}`, { state: { from: location.pathname } })}>
              <ArrowUpToLine />
              Open task
              <ContextMenuShortcut>{SHORTCUTS.openTask.label}</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuItem
              disabled={isRunning && activeTaskId === task.id}
              onSelect={() => {
                if (isRunning) {
                  if (activeTaskId !== task.id) void switchTask(task.id)
                } else {
                  void startSession(task.id)
                }
              }}
            >
              <Play />
              {focusLabel}
              <ContextMenuShortcut>{SHORTCUTS.startFocus.label}</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />
          </>
        )}

        {canMoveTo("today") && (
          <ContextMenuItem onSelect={() => { void runOnTargets((id) => moveToSection(id, "today")) }}>
            <Sun />
            Move to Today
            <ContextMenuShortcut>{SHORTCUTS.moveToToday.label}</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {canMoveTo("sooner") && (
          <ContextMenuItem onSelect={() => { void runOnTargets((id) => moveToSection(id, "sooner")) }}>
            <Zap />
            Move to Sooner
            <ContextMenuShortcut>{SHORTCUTS.moveToSooner.label}</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {canMoveTo("later") && (
          <ContextMenuItem onSelect={() => { void runOnTargets((id) => moveToSection(id, "later")) }}>
            <Archive />
            Move to Later
            <ContextMenuShortcut>{SHORTCUTS.moveToLater.label}</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {hasTodayTarget && (
          <ContextMenuItem onSelect={() => { void runOnTargets((id) => moveToSection(id, "sooner"), (t) => t.section === "today") }}>
            <ArrowUpToLine />
            Remove from Today
            <ContextMenuShortcut>{SHORTCUTS.removeFromToday.label}</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onSelect={() => {
            openEstimateDialog(targetIds)
          }}
        >
          <Clock3 />
          Set estimate...
          <ContextMenuShortcut>{SHORTCUTS.setEstimate.label}</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <FolderInput />
            Move to bucket...
            <ContextMenuShortcut>{SHORTCUTS.moveToBucket.label}</ContextMenuShortcut>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-56">
            {buckets.map((bucket) => {
              const alreadyInBucket = targetTasks.every((t) => t.bucket_id === bucket.id)
              return (
                <ContextMenuItem
                  key={bucket.id}
                  disabled={alreadyInBucket}
                  onSelect={() => { void runOnTargets((id) => moveToBucket(id, bucket.id)) }}
                >
                  {bucket.name}
                </ContextMenuItem>
              )
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        <ContextMenuItem onSelect={() => { void runOnTargets((id) => completeTask(id)) }}>
          <Check />
          Mark done
          <ContextMenuShortcut>{SHORTCUTS.completeTask.label}</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem onSelect={() => { void runOnTargets((id) => archiveTask(id)) }}>
          <Archive />
          Archive
          <ContextMenuShortcut>{SHORTCUTS.archiveTask.label}</ContextMenuShortcut>
        </ContextMenuItem>

        {!isBatch && sourceUrl && (
          <ContextMenuItem onSelect={() => window.open(sourceUrl, "_blank", "noopener,noreferrer")}>
            <ExternalLink />
            Open in source
            <ContextMenuShortcut>{SHORTCUTS.openInSource.label}</ContextMenuShortcut>
          </ContextMenuItem>
        )}

        {!isBatch && (
          <>
            <ContextMenuSeparator />

            <ContextMenuItem onSelect={() => { void copyText(task.title, "Title copied.") }}>
              <Copy />
              Copy title
              <ContextMenuShortcut>{SHORTCUTS.copyTitle.label}</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuItem onSelect={() => { void copyText(getTaskAppUrl(task.id), "Task link copied.") }}>
              <Copy />
              Copy task link
              <ContextMenuShortcut>{SHORTCUTS.copyTaskLink.label}</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
