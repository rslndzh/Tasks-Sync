import { useSessionStore } from "@/stores/useSessionStore"
import { useTaskStore } from "@/stores/useTaskStore"
import { useBucketStore } from "@/stores/useBucketStore"

/**
 * Format seconds into mm:ss or hh:mm:ss display.
 */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/**
 * Timer display component — shows elapsed time, current task, and bucket.
 */
export function TimerDisplay() {
  const { elapsedSeconds, timerMode, fixedDurationMinutes } = useSessionStore()
  const activeTaskId = useSessionStore((s) => s.activeTaskId)
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === activeTaskId))
  const bucket = useBucketStore((s) => s.getBucket(task?.bucket_id ?? ""))

  const displayTime =
    timerMode === "fixed" && fixedDurationMinutes
      ? Math.max(0, fixedDurationMinutes * 60 - elapsedSeconds)
      : elapsedSeconds

  return (
    <div className="flex flex-col items-center">
      <span className="text-4xl font-mono font-bold tabular-nums tracking-wider">
        {formatTime(displayTime)}
      </span>
      {task && (
        <p className="mt-1 text-sm text-muted-foreground truncate max-w-[200px]">
          {task.title}
        </p>
      )}
      {bucket && (
        <p className="text-xs text-muted-foreground">{bucket.name}</p>
      )}
    </div>
  )
}
