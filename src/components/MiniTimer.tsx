import { Button } from "@/components/ui/button"
import { Square } from "lucide-react"
import { useSessionStore } from "@/stores/useSessionStore"
import { useTaskStore } from "@/stores/useTaskStore"
import { formatTime } from "@/components/Timer"

/**
 * Mini timer bar — sits at the bottom of the main content column (before the right rail).
 * Only visible when a session is active.
 */
export function MiniTimer() {
  const { isRunning, elapsedSeconds, timerMode, fixedDurationMinutes, stopSession } =
    useSessionStore()
  const activeTaskId = useSessionStore((s) => s.activeTaskId)
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === activeTaskId))

  if (!isRunning) return null

  const displayTime =
    timerMode === "fixed" && fixedDurationMinutes
      ? Math.max(0, fixedDurationMinutes * 60 - elapsedSeconds)
      : elapsedSeconds

  return (
    <div className="shrink-0 border-t border-border bg-background mb-14 md:mb-0">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          {/* Pulsing dot */}
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
          </span>

          <span className="font-mono text-lg font-bold tabular-nums">
            {formatTime(displayTime)}
          </span>

          {task && (
            <span className="max-w-[300px] truncate text-sm text-muted-foreground">
              {task.title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void stopSession()}
            className="gap-1"
          >
            <Square className="size-3" />
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
