import { useActiveTimerModel } from "@/hooks/useActiveTimerModel"
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
 * Human-readable duration: 45s, 5m 20s, 2h 15m.
 */
export function formatReadableDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60

  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`
  return `${s}s`
}

/**
 * Timer display component — shows elapsed time, current task, and bucket.
 */
export function TimerDisplay() {
  const timer = useActiveTimerModel()
  const task = timer.task
  const bucket = useBucketStore((s) => s.getBucket(task?.bucket_id ?? ""))

  return (
    <div className="flex flex-col items-center">
      <span className="text-4xl font-mono font-bold tabular-nums tracking-wider">
        {formatTime(timer.sessionDisplaySeconds)}
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
