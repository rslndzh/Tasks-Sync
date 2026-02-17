import { useMemo } from "react"
import { useSessionStore } from "@/stores/useSessionStore"
import { useTaskStore } from "@/stores/useTaskStore"
import { useTrackedTimeMap } from "@/hooks/useTrackedTime"
import type { LocalTask } from "@/types/local"

interface ActiveTimerModel {
  isRunning: boolean
  task: LocalTask | null
  sessionDisplaySeconds: number
  activeEntryElapsedSeconds: number
  activeTaskTrackedSeconds: number
  estimateSeconds: number | null
  remainingEstimateSeconds: number | null
  overrunEstimateSeconds: number | null
  estimateProgress: number | null
}

/**
 * Centralized timer view-model for UI components.
 *
 * Keeps timer calculations consistent across surfaces (mini timer, Today header).
 * Separates session elapsed time from active-task tracked time.
 */
export function useActiveTimerModel(): ActiveTimerModel {
  const isRunning = useSessionStore((s) => s.isRunning)
  const elapsedSeconds = useSessionStore((s) => s.elapsedSeconds)
  const timerMode = useSessionStore((s) => s.timerMode)
  const fixedDurationMinutes = useSessionStore((s) => s.fixedDurationMinutes)
  const activeTaskId = useSessionStore((s) => s.activeTaskId)
  const activeEntryStartedAt = useSessionStore((s) => s.activeTimeEntry?.started_at ?? null)
  const task = useTaskStore((s) => (activeTaskId ? s.tasks.find((t) => t.id === activeTaskId) ?? null : null))
  const trackedMap = useTrackedTimeMap()

  const sessionDisplaySeconds = useMemo(() => {
    if (timerMode === "fixed" && fixedDurationMinutes) {
      return Math.max(0, fixedDurationMinutes * 60 - elapsedSeconds)
    }
    return elapsedSeconds
  }, [timerMode, fixedDurationMinutes, elapsedSeconds])

  const activeEntryElapsedSeconds = useMemo(() => {
    if (!isRunning || !activeEntryStartedAt) return 0
    const started = new Date(activeEntryStartedAt).getTime()
    return Math.max(0, Math.floor((Date.now() - started) / 1000))
  }, [isRunning, activeEntryStartedAt, elapsedSeconds])

  const trackedBeforeCurrentEntrySeconds = activeTaskId ? (trackedMap.get(activeTaskId) ?? 0) : 0
  const activeTaskTrackedSeconds = trackedBeforeCurrentEntrySeconds + activeEntryElapsedSeconds
  const estimateSeconds = task?.estimate_minutes && task.estimate_minutes > 0 ? task.estimate_minutes * 60 : null
  const remainingEstimateSeconds = estimateSeconds != null
    ? Math.max(0, estimateSeconds - activeTaskTrackedSeconds)
    : null
  const overrunEstimateSeconds = estimateSeconds != null
    ? Math.max(0, activeTaskTrackedSeconds - estimateSeconds)
    : null
  const estimateProgress = estimateSeconds != null
    ? Math.min(1, activeTaskTrackedSeconds / estimateSeconds)
    : null

  return {
    isRunning,
    task,
    sessionDisplaySeconds,
    activeEntryElapsedSeconds,
    activeTaskTrackedSeconds,
    estimateSeconds,
    remainingEstimateSeconds,
    overrunEstimateSeconds,
    estimateProgress,
  }
}
