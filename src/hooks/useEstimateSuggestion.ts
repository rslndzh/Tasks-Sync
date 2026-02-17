import { useEffect, useMemo, useState } from "react"
import { db } from "@/lib/db"
import { useTaskStore } from "@/stores/useTaskStore"

type SuggestionSource = "task" | "bucket" | null

interface EstimateSuggestionState {
  suggestedMinutes: number | null
  sampleCount: number
  source: SuggestionSource
}

const SAMPLE_WINDOW = 8
const MIN_SAMPLES = 2

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function toSuggestedMinutes(seconds: number): number {
  const minutes = seconds / 60
  const rounded = Math.round(minutes / 5) * 5
  return Math.max(5, rounded)
}

async function getRecentDurationsByTaskIds(taskIds: string[]): Promise<number[]> {
  if (taskIds.length === 0) return []

  const entries = taskIds.length === 1
    ? await db.timeEntries.where("task_id").equals(taskIds[0]).toArray()
    : await db.timeEntries.where("task_id").anyOf(taskIds).toArray()

  return entries
    .filter((entry) => entry.ended_at && entry.duration_seconds != null && entry.duration_seconds > 0)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, SAMPLE_WINDOW)
    .map((entry) => entry.duration_seconds ?? 0)
}

/**
 * Deterministic estimate suggestion for Task Page.
 *
 * Priority:
 * 1) Median of last N completed durations for this task.
 * 2) Median of last N completed durations for tasks in the same bucket.
 */
export function useEstimateSuggestion(taskId: string): EstimateSuggestionState {
  const tasks = useTaskStore((s) => s.tasks)
  const task = useMemo(() => tasks.find((t) => t.id === taskId) ?? null, [tasks, taskId])
  const [state, setState] = useState<EstimateSuggestionState>({
    suggestedMinutes: null,
    sampleCount: 0,
    source: null,
  })

  useEffect(() => {
    let cancelled = false

    async function computeSuggestion(): Promise<void> {
      if (!task) {
        if (!cancelled) {
          setState({ suggestedMinutes: null, sampleCount: 0, source: null })
        }
        return
      }

      const taskDurations = await getRecentDurationsByTaskIds([task.id])
      if (taskDurations.length >= MIN_SAMPLES) {
        if (!cancelled) {
          setState({
            suggestedMinutes: toSuggestedMinutes(median(taskDurations)),
            sampleCount: taskDurations.length,
            source: "task",
          })
        }
        return
      }

      if (!task.bucket_id) {
        if (!cancelled) {
          setState({ suggestedMinutes: null, sampleCount: 0, source: null })
        }
        return
      }

      const bucketTasks = await db.tasks.where("bucket_id").equals(task.bucket_id).toArray()
      const bucketTaskIds = bucketTasks.map((bucketTask) => bucketTask.id)
      const bucketDurations = await getRecentDurationsByTaskIds(bucketTaskIds)

      if (bucketDurations.length >= MIN_SAMPLES) {
        if (!cancelled) {
          setState({
            suggestedMinutes: toSuggestedMinutes(median(bucketDurations)),
            sampleCount: bucketDurations.length,
            source: "bucket",
          })
        }
        return
      }

      if (!cancelled) {
        setState({ suggestedMinutes: null, sampleCount: 0, source: null })
      }
    }

    void computeSuggestion()

    return () => {
      cancelled = true
    }
  }, [task])

  return state
}
