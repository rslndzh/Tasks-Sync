import { Button } from "@/components/ui/button"
import { CircleStop, Play } from "lucide-react"
import { useSessionStore } from "@/stores/useSessionStore"
import { useActiveTimerModel } from "@/hooks/useActiveTimerModel"
import { useTaskStore } from "@/stores/useTaskStore"
import { useTodaySectionsStore } from "@/stores/useTodaySectionsStore"
import { cn } from "@/lib/utils"
import { formatReadableDuration, formatTime } from "@/components/Timer"

/**
 * Mini timer bar — sits at the bottom of the main content column (before the right rail).
 * Visible while a session is active, and also when there is at least one task in "Now".
 */
export function MiniTimer() {
  const stopSession = useSessionStore((s) => s.stopSession)
  const startSession = useSessionStore((s) => s.startSession)
  const timer = useActiveTimerModel()
  const tasks = useTaskStore((s) => s.tasks)
  const getTaskLane = useTodaySectionsStore((s) => s.getTaskLane)

  const todayTasks = tasks
    .filter((task) => task.status === "active" && task.section === "today")
    .sort((a, b) => a.position - b.position)
  const nowTasks = todayTasks.filter((task) => getTaskLane(task.id) === "now")
  const nextLaneTasks = todayTasks.filter((task) => getTaskLane(task.id) === "next")
  const hasNowTasks = nowTasks.length > 0

  if (!timer.isRunning && !hasNowTasks) return null

  const displayTask = timer.isRunning ? timer.task : (nowTasks[0] ?? null)
  const displayEstimateSeconds =
    displayTask?.estimate_minutes && displayTask.estimate_minutes > 0
      ? displayTask.estimate_minutes * 60
      : null
  const nextUpTask = (() => {
    if (timer.isRunning && timer.task) {
      const runningIdx = nowTasks.findIndex((task) => task.id === timer.task?.id)
      if (runningIdx >= 0 && runningIdx + 1 < nowTasks.length) return nowTasks[runningIdx + 1]
    }
    if (!timer.isRunning && nowTasks.length > 1) return nowTasks[1]
    if (nextLaneTasks.length > 0) return nextLaneTasks[0]
    return null
  })()

  return (
    <div className="mb-14 shrink-0 border-t border-border bg-background md:mb-0">
      <div className="px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative flex size-2.5">
              {timer.isRunning && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              )}
              <span
                className={cn(
                  "relative inline-flex size-2.5 rounded-full",
                  timer.isRunning ? "bg-primary" : "bg-muted-foreground/40",
                )}
              />
            </span>

            <span className="font-mono text-lg font-bold tabular-nums">
              {timer.isRunning ? formatTime(timer.sessionDisplaySeconds) : "Ready"}
            </span>

            {displayTask && (
              <span className="max-w-[280px] truncate text-sm text-muted-foreground">
                {displayTask.title}
              </span>
            )}
          </div>

          {timer.isRunning ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void stopSession()}
              className="gap-1"
            >
              <CircleStop className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={!displayTask}
              onClick={() => {
                if (displayTask) void startSession(displayTask.id)
              }}
              className="gap-1"
            >
              <Play className="size-3.5" />
              Start
            </Button>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2 pl-5 text-xs text-muted-foreground">
          {timer.isRunning && timer.estimateSeconds != null ? (
            <>
              <span>
                {formatReadableDuration(timer.activeTaskTrackedSeconds)} / {formatReadableDuration(timer.estimateSeconds)}
              </span>
              {(timer.remainingEstimateSeconds ?? 0) > 0 && (
                <span>
                  {formatReadableDuration(timer.remainingEstimateSeconds ?? 0)}
                </span>
              )}
              {(timer.overrunEstimateSeconds ?? 0) > 0 && (
                <span>
                  +{formatReadableDuration(timer.overrunEstimateSeconds ?? 0)}
                </span>
              )}
              {(timer.remainingEstimateSeconds ?? 0) === 0 && (timer.overrunEstimateSeconds ?? 0) === 0 && (
                <span>
                  On estimate
                </span>
              )}
            </>
          ) : displayEstimateSeconds != null ? (
            <span>
              Top task estimate: {formatReadableDuration(displayEstimateSeconds)}
            </span>
          ) : (
            <span>{timer.isRunning ? "No estimate. Press E to set one." : "No estimate on top Now task."}</span>
          )}
          {nextUpTask && (
            <span className="truncate">
              Next up: {nextUpTask.title}
            </span>
          )}
        </div>

        {timer.isRunning && timer.estimateSeconds != null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full transition-all",
                (timer.overrunEstimateSeconds ?? 0) > 0 ? "bg-amber-500" : "bg-primary",
              )}
              style={{ width: `${Math.max(4, Math.round((timer.estimateProgress ?? 0) * 100))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
