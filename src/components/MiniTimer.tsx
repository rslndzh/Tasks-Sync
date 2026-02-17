import { Button } from "@/components/ui/button"
import { Square } from "lucide-react"
import { useSessionStore } from "@/stores/useSessionStore"
import { useActiveTimerModel } from "@/hooks/useActiveTimerModel"
import { cn } from "@/lib/utils"
import { formatTime } from "@/components/Timer"

/**
 * Mini timer bar — sits at the bottom of the main content column (before the right rail).
 * Only visible when a session is active.
 */
export function MiniTimer() {
  const stopSession = useSessionStore((s) => s.stopSession)
  const timer = useActiveTimerModel()

  if (!timer.isRunning) return null

  return (
    <div className="mb-14 shrink-0 border-t border-border bg-background md:mb-0">
      <div className="px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
            </span>

            <span className="font-mono text-lg font-bold tabular-nums">
              {formatTime(timer.sessionDisplaySeconds)}
            </span>

            {timer.task && (
              <span className="max-w-[280px] truncate text-sm text-muted-foreground">
                {timer.task.title}
              </span>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void stopSession()}
            className="gap-1"
          >
            <Square className="size-3" />
            Stop
          </Button>
        </div>

        <div className="mt-1 flex items-center gap-2 pl-5 text-xs text-muted-foreground">
          {timer.estimateSeconds != null ? (
            <>
              <span className="font-mono tabular-nums">
                {formatTime(timer.activeTaskTrackedSeconds)} / {formatTime(timer.estimateSeconds)}
              </span>
              <span>
                {timer.remainingEstimateSeconds && timer.remainingEstimateSeconds > 0
                  ? `${formatTime(timer.remainingEstimateSeconds)} left`
                  : (timer.overrunEstimateSeconds ?? 0) > 0
                    ? `+${formatTime(timer.overrunEstimateSeconds ?? 0)} over`
                    : "On estimate"}
              </span>
            </>
          ) : (
            <span>No estimate. Press E to set one.</span>
          )}
        </div>

        {timer.estimateSeconds != null && (
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
