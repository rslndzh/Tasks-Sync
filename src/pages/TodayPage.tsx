import { useCallback } from "react"
import { Button } from "@/components/ui/button"
import { SortableTaskCard } from "@/components/SortableTaskCard"
import { Sun, Play, Square } from "lucide-react"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { useDroppable } from "@dnd-kit/core"
import { useTaskStore } from "@/stores/useTaskStore"
import { useBucketStore } from "@/stores/useBucketStore"
import { useSessionStore } from "@/stores/useSessionStore"
import { encodeSectionDroppableId } from "@/lib/dnd-types"
import { cn } from "@/lib/utils"

/**
 * Global "Today" smart list.
 *
 * Aggregates all tasks where section = 'today' across every bucket
 * as a single flat list with drag-to-reorder support.
 */
export function TodayPage() {
  const tasks = useTaskStore((s) => s.tasks)
  const { selectedTaskId, clearSelection } = useTaskStore()
  const { buckets } = useBucketStore()
  const { isRunning, startSession, stopSession } = useSessionStore()

  const todayTasks = tasks.filter((t) => t.section === "today").sort((a, b) => a.position - b.position)
  const todayIds = todayTasks.map((t) => t.id)
  const defaultBucket = buckets.find((b) => b.is_default)

  // Build a quick bucket name lookup for showing bucket labels on each task
  const bucketNameMap = new Map(buckets.map((b) => [b.id, b.name]))

  // Make the today list area a droppable for inbox items
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: encodeSectionDroppableId("today", defaultBucket?.id ?? "global"),
    data: { type: "section", section: "today", bucketId: defaultBucket?.id },
  })

  // Click on page background (not on a task card) clears selection
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) clearSelection()
  }, [clearSelection])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 md:p-6" onClick={handleBackgroundClick}>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between md:mb-6">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 md:size-10">
            <Sun className="size-4 text-primary md:size-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">Today</h1>
            <p className="hidden text-sm text-muted-foreground md:block">
              Your focus list. Start a session and get things done.
            </p>
          </div>
        </div>
        {isRunning ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void stopSession()}
            className="gap-1"
          >
            <Square className="size-4" />
            Stop
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={!selectedTaskId}
            onClick={() => {
              if (selectedTaskId) void startSession(selectedTaskId)
            }}
            className="gap-1"
          >
            <Play className="size-4" />
            Start Focus
          </Button>
        )}
      </div>

      {/* Sortable task list — droppable area fills remaining space for reliable DnD */}
      <div ref={dropRef} className={cn("min-h-[200px] flex-1 rounded-lg transition-colors", isOver && "bg-primary/5 ring-1 ring-primary/20")}>
        {todayTasks.length > 0 ? (
          <SortableContext items={todayIds} strategy={verticalListSortingStrategy}>
            <div className="divide-y divide-border/50">
              {todayTasks.map((task) => (
                <SortableTaskCard
                  key={task.id}
                  task={task}
                  showBucket
                  bucketName={task.bucket_id ? bucketNameMap.get(task.bucket_id) : undefined}
                  orderedIds={todayIds}
                />
              ))}
            </div>
          </SortableContext>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <Sun className="mb-4 size-12 text-muted-foreground/30" />
            <h2 className="mb-1 text-lg font-semibold text-muted-foreground">
              Nothing for today yet
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Move tasks to &quot;Today&quot; from any bucket to see them here.
              This is your launchpad for focus sessions.
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
