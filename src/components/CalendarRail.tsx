import { useEffect, useMemo } from "react"
import { useSessionStore } from "@/stores/useSessionStore"
import { useTaskStore } from "@/stores/useTaskStore"
import { useBucketStore } from "@/stores/useBucketStore"
import { formatTime } from "@/components/Timer"
import { PROVIDER_ICON_MAP } from "@/components/icons/ProviderIcons"
import { useTrackedTimeMap } from "@/hooks/useTrackedTime"
import { useActiveTimerModel } from "@/hooks/useActiveTimerModel"
import type { TaskSource } from "@/types/database"

const HOUR_HEIGHT = 48 // pixels per hour
const START_HOUR = 6 // 6 AM
const END_HOUR = 24 // midnight
const TOTAL_HOURS = END_HOUR - START_HOUR

/**
 * Fallback: generate a consistent color from a string (task ID).
 */
function hashColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 55%)`
}

/**
 * Calendar Rail — right-side visual timeline of today's sessions.
 * Renders colored time blocks proportional to duration.
 */
export function CalendarRail() {
  const { todaySessions, todayTimeEntries, isRunning, loadTodaySessions } =
    useSessionStore()
  const tasks = useTaskStore((s) => s.tasks)
  const buckets = useBucketStore((s) => s.buckets)
  const trackedMap = useTrackedTimeMap()
  const timer = useActiveTimerModel()

  useEffect(() => {
    void loadTodaySessions()
  }, [loadTodaySessions])

  const now = new Date()
  const startOfDay = new Date(now)
  startOfDay.setHours(START_HOUR, 0, 0, 0)

  // Calculate total tracked time today
  const totalSeconds = todayTimeEntries.reduce((sum, entry) => {
    if (entry.duration_seconds) return sum + entry.duration_seconds
    // Active entry — compute from start
    const start = new Date(entry.started_at).getTime()
    return sum + Math.round((Date.now() - start) / 1000)
  }, 0)

  const hasActivity = todayTimeEntries.length > 0 || isRunning
  const todayTasks = useMemo(() => {
    return tasks
      .filter((task) => task.section === "today" && task.status !== "completed")
      .sort((a, b) => a.position - b.position)
  }, [tasks])

  const playlistBlocks = useMemo(() => {
    if (todayTasks.length === 0) return []

    const activeTaskId = timer.task?.id ?? null
    const playlistStartMinutes = Math.max(
      0,
      Math.round((now.getTime() - startOfDay.getTime()) / 60000),
    )
    const maxMinutes = TOTAL_HOURS * 60
    let cursorMinutes = Math.min(playlistStartMinutes, maxMinutes)

    return todayTasks.reduce<
      Array<{
        taskId: string
        title: string
        startMinutes: number
        durationMinutes: number
        color: string
        remainingSeconds: number
      }>
    >((acc, task) => {
      const estimateMinutes = task.estimate_minutes ?? 0
      if (estimateMinutes <= 0) return acc

      let trackedSeconds = trackedMap.get(task.id) ?? 0
      if (activeTaskId === task.id) {
        trackedSeconds += timer.activeEntryElapsedSeconds
      }
      const remainingSeconds = Math.max(0, estimateMinutes * 60 - trackedSeconds)
      if (remainingSeconds <= 0) return acc

      const bucket = task.bucket_id ? buckets.find((b) => b.id === task.bucket_id) : undefined
      const color = bucket?.color ?? hashColor(task.id)
      const durationMinutes = Math.max(1, Math.ceil(remainingSeconds / 60))

      const startMinutes = cursorMinutes
      const endMinutes = Math.min(maxMinutes, startMinutes + durationMinutes)
      if (startMinutes >= maxMinutes) return acc

      acc.push({
        taskId: task.id,
        title: task.title,
        startMinutes,
        durationMinutes: Math.max(1, endMinutes - startMinutes),
        color,
        remainingSeconds,
      })
      cursorMinutes = endMinutes
      return acc
    }, [])
  }, [todayTasks, trackedMap, timer.activeEntryElapsedSeconds, timer.task?.id, buckets, now, startOfDay])

  const playlistSeconds = useMemo(() => {
    return playlistBlocks.reduce((sum, block) => sum + block.remainingSeconds, 0)
  }, [playlistBlocks])

  return (
    <div className="flex h-full flex-col">
      {/* Header — total time or gentle nudge */}
      <div className="mb-3 border-b border-border pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Today
        </p>
        {hasActivity ? (
          <>
            <p className="text-lg font-bold tabular-nums">{formatTime(totalSeconds)}</p>
            <p className="text-[10px] text-muted-foreground">
              {todaySessions.length} session{todaySessions.length !== 1 ? "s" : ""}
            </p>
          </>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">
            No sessions yet — start one to light up your day.
          </p>
        )}
        {playlistBlocks.length > 0 && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Playlist: {playlistBlocks.length} task{playlistBlocks.length !== 1 ? "s" : ""} · {formatTime(playlistSeconds)}
          </p>
        )}
      </div>

      {/* Timeline */}
      <div className="relative flex-1 overflow-y-auto">
        {/* Hour markers */}
        <div
          className="relative"
          style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
        >
          {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
            const hour = START_HOUR + i
            return (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t border-border/40"
                style={{ top: `${i * HOUR_HEIGHT}px` }}
              >
                <span className="absolute -top-2 left-0 text-[9px] text-muted-foreground/60">
                  {hour === 0 || hour === 24
                    ? "12a"
                    : hour < 12
                      ? `${hour}a`
                      : hour === 12
                        ? "12p"
                        : `${hour - 12}p`}
                </span>
              </div>
            )
          })}

          {/* Current time indicator */}
          {(() => {
            const minutesSinceStart =
              (now.getHours() - START_HOUR) * 60 + now.getMinutes()
            if (minutesSinceStart < 0 || minutesSinceStart > TOTAL_HOURS * 60) return null
            const top = (minutesSinceStart / 60) * HOUR_HEIGHT
            return (
              <div
                className="absolute left-4 right-0 z-10 border-t-2 border-primary"
                style={{ top: `${top}px` }}
              >
                <span className="absolute -left-1 -top-1 size-2 rounded-full bg-primary" />
              </div>
            )
          })()}

          {/* Time entry blocks */}
          {todayTimeEntries.map((entry) => {
            const entryStart = new Date(entry.started_at)
            const entryEnd = entry.ended_at
              ? new Date(entry.ended_at)
              : now

            const startMinutes =
              (entryStart.getHours() - START_HOUR) * 60 + entryStart.getMinutes()
            const endMinutes =
              (entryEnd.getHours() - START_HOUR) * 60 + entryEnd.getMinutes()

            if (startMinutes < 0 || startMinutes > TOTAL_HOURS * 60) return null

            const top = (startMinutes / 60) * HOUR_HEIGHT
            const height = Math.max(
              4,
              ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT,
            )

            const task = tasks.find((t) => t.id === entry.task_id)
            // Use bucket color if available, fall back to hash-based color
            const bucket = task?.bucket_id ? buckets.find((b) => b.id === task.bucket_id) : undefined
            const color = bucket?.color ?? hashColor(entry.task_id)
            const isActive = !entry.ended_at

            // Resolve provider icon for integration tasks
            const providerSource = task?.source as TaskSource | undefined
            const ProviderIcon = providerSource && providerSource !== "manual"
              ? PROVIDER_ICON_MAP[providerSource]
              : null

            return (
              <div
                key={entry.id}
                className="absolute left-5 right-1 rounded-sm transition-all"
                style={{
                  top: `${top}px`,
                  height: `${height}px`,
                  backgroundColor: color,
                  opacity: 0.85,
                }}
                title={`${task?.title ?? "Task"} — ${formatTime(entry.duration_seconds ?? Math.round((Date.now() - entryStart.getTime()) / 1000))}`}
              >
                {height > 16 && (
                  <div className="flex items-center gap-0.5 px-1 py-0.5">
                    {ProviderIcon && <ProviderIcon className="size-3 shrink-0 brightness-0 invert" />}
                    <p className="truncate text-[9px] font-medium text-white">
                      {task?.title ?? "Task"}
                    </p>
                  </div>
                )}
                {/* Growing edge animation for active entry */}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 animate-pulse rounded-b-sm bg-white/30" />
                )}
              </div>
            )
          })}

          {/* Playlist blocks (planned focus) */}
          {playlistBlocks.map((block) => {
            const top = (block.startMinutes / 60) * HOUR_HEIGHT
            const height = Math.max(4, (block.durationMinutes / 60) * HOUR_HEIGHT)

            return (
              <div
                key={`playlist-${block.taskId}-${block.startMinutes}`}
                className="absolute left-6 right-2 rounded-sm border border-dashed"
                style={{
                  top: `${top}px`,
                  height: `${height}px`,
                  borderColor: block.color,
                  backgroundColor: block.color,
                  opacity: 0.18,
                }}
                title={`${block.title} — ${formatTime(block.remainingSeconds)}`}
              >
                {height > 14 && (
                  <p className="truncate px-1 py-0.5 text-[9px] font-medium text-foreground/70">
                    {block.title}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* End of day message */}
      {todayTimeEntries.length > 3 && (
        <p className="mt-2 border-t border-border pt-2 text-center text-[10px] text-muted-foreground">
          Look at that — a colorful day. Nice work.
        </p>
      )}
    </div>
  )
}
