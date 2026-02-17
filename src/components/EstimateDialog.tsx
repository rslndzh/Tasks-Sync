import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ESTIMATE_DIALOG_EVENT } from "@/lib/estimate-dialog"
import { useTaskStore } from "@/stores/useTaskStore"

const PRESET_MINUTES = [15, 25, 45, 60, 90]

/**
 * Shared estimate dialog for keyboard and context-menu actions.
 */
export function EstimateDialog() {
  const [open, setOpen] = useState(false)
  const [targetTaskIds, setTargetTaskIds] = useState<string[]>([])
  const [minutesInput, setMinutesInput] = useState("")
  const tasks = useTaskStore((s) => s.tasks)
  const updateTask = useTaskStore((s) => s.updateTask)

  const targetTasks = useMemo(() => {
    const idSet = new Set(targetTaskIds)
    return tasks.filter((task) => idSet.has(task.id))
  }, [tasks, targetTaskIds])

  const estimates = useMemo(() => {
    return new Set(targetTasks.map((task) => task.estimate_minutes ?? null))
  }, [targetTasks])
  const hasMixedValues = estimates.size > 1

  useEffect(() => {
    function handleOpen(event: Event) {
      const custom = event as CustomEvent<{ taskIds?: string[] }>
      const taskIds = custom.detail?.taskIds ?? []
      if (taskIds.length === 0) return
      setTargetTaskIds(taskIds)

      const idSet = new Set(taskIds)
      const selectedTasks = tasks.filter((task) => idSet.has(task.id))
      const values = new Set(selectedTasks.map((task) => task.estimate_minutes ?? null))
      const shared = values.size === 1 ? [...values][0] : null
      setMinutesInput(shared != null && shared > 0 ? String(shared) : "")
      setOpen(true)
    }

    window.addEventListener(ESTIMATE_DIALOG_EVENT, handleOpen)
    return () => window.removeEventListener(ESTIMATE_DIALOG_EVENT, handleOpen)
  }, [tasks])

  async function applyEstimate(): Promise<void> {
    if (targetTaskIds.length === 0) return

    const trimmed = minutesInput.trim()
    const parsed = trimmed ? Number.parseInt(trimmed, 10) : 0
    if (trimmed && (!Number.isFinite(parsed) || parsed < 0)) {
      toast.error("Estimate must be a non-negative number of minutes.")
      return
    }

    const estimate = parsed > 0 ? parsed : null
    for (const taskId of targetTaskIds) {
      await updateTask(taskId, { estimate_minutes: estimate })
    }
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set estimate</DialogTitle>
          <DialogDescription>
            {targetTaskIds.length === 1
              ? "Set expected effort in minutes for this task."
              : `Set expected effort for ${targetTaskIds.length} tasks.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              step={5}
              value={minutesInput}
              placeholder={hasMixedValues ? "Mixed values" : "Minutes"}
              onChange={(e) => setMinutesInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void applyEstimate()
                }
              }}
            />
            <span className="text-xs text-muted-foreground">min</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESET_MINUTES.map((minutes) => (
              <Button
                key={minutes}
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setMinutesInput(String(minutes))}
              >
                {minutes}m
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMinutesInput("")}
            >
              Clear
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => { void applyEstimate() }}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
