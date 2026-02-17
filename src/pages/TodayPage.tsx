import { useCallback, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { SortableTaskCard } from "@/components/SortableTaskCard"
import { Sun, Play, ChevronRight } from "lucide-react"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { useDroppable } from "@dnd-kit/core"
import { useTaskStore } from "@/stores/useTaskStore"
import { useBucketStore } from "@/stores/useBucketStore"
import { useSessionStore } from "@/stores/useSessionStore"
import { useTodaySectionsStore } from "@/stores/useTodaySectionsStore"
import { useTrackedTimeMap } from "@/hooks/useTrackedTime"
import { encodeSectionDroppableId, encodeTodayLaneDroppableId } from "@/lib/dnd-types"
import { cn } from "@/lib/utils"
import { formatReadableDuration } from "@/components/Timer"
import { useActiveTimerModel } from "@/hooks/useActiveTimerModel"
import type { LocalTask } from "@/types/local"
import type { TodayLane } from "@/lib/dnd-types"

interface TodayLaneListProps {
  lane: TodayLane
  title: string
  tasks: LocalTask[]
  spentSeconds: number
  estimateSeconds: number
  todayDropBucketId: string
  bucketNameMap: Map<string, string>
  promoteFromNext?: () => void
}

function TodayLaneList({
  lane,
  title,
  tasks,
  spentSeconds,
  estimateSeconds,
  todayDropBucketId,
  bucketNameMap,
  promoteFromNext,
}: TodayLaneListProps) {
  const [collapsed, setCollapsed] = useState(false)
  const laneIds = tasks.map((t) => t.id)
  const { setNodeRef, isOver } = useDroppable({
    id: encodeTodayLaneDroppableId(lane, todayDropBucketId),
    data: { type: "today-lane", lane, section: "today", bucketId: todayDropBucketId },
  })

  return (
    <section
      ref={setNodeRef}
      className={cn("rounded-xl border border-transparent py-1 transition-colors duration-150 ease-out", isOver && "border-primary/30 bg-primary/5")}
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              !collapsed && "rotate-90",
            )}
          />
          <span className="text-xs font-semibold uppercase tracking-wider">
            {title}
          </span>
        </button>

        {tasks.length > 0 && (
          <span className="text-[10px] font-medium text-muted-foreground/50">
            {tasks.length}
          </span>
        )}

        <span className="rounded-full border border-border/60 bg-muted/45 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {formatReadableDuration(spentSeconds)}
          {estimateSeconds > 0 ? ` / ${formatReadableDuration(estimateSeconds)}` : " / —"}
        </span>
      </div>

      {!collapsed && (
        <div className="mt-1">
          <SortableContext items={laneIds} strategy={verticalListSortingStrategy}>
            {tasks.length > 0 ? (
              <div className="divide-y divide-border/30">
                {tasks.map((task) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    showBucket
                    bucketName={task.bucket_id ? bucketNameMap.get(task.bucket_id) : undefined}
                    focusMode
                    orderedIds={laneIds}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-between px-3 py-2">
                <p className="text-xs italic text-muted-foreground/40">
                  Drop tasks here
                </p>
                {lane === "now" && promoteFromNext && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => promoteFromNext()}
                  >
                    Pull from Next
                  </Button>
                )}
              </div>
            )}
          </SortableContext>
        </div>
      )}
    </section>
  )
}

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
  const { isRunning, startSession } = useSessionStore()
  const splitTodaySections = useTodaySectionsStore((s) => s.enabled)
  const getTaskLane = useTodaySectionsStore((s) => s.getTaskLane)
  const setTaskLane = useTodaySectionsStore((s) => s.setTaskLane)
  const trackedMap = useTrackedTimeMap()
  const timer = useActiveTimerModel()

  const todayTasks = tasks.filter((t) => t.section === "today").sort((a, b) => a.position - b.position)
  const todayIds = todayTasks.map((t) => t.id)
  const nowTasks = todayTasks.filter((t) => getTaskLane(t.id) === "now")
  const nextTasks = todayTasks.filter((t) => getTaskLane(t.id) === "next")
  const suggestedFocusTaskId = selectedTaskId ?? nowTasks[0]?.id ?? nextTasks[0]?.id ?? todayTasks[0]?.id ?? null
  const activeTaskId = timer.task?.id ?? null
  const laneStats = useMemo(() => {
    const calc = (laneTasks: LocalTask[]) => {
      const laneIds = new Set(laneTasks.map((task) => task.id))
      const spentBase = laneTasks.reduce((sum, task) => sum + (trackedMap.get(task.id) ?? 0), 0)
      const estimate = laneTasks.reduce((sum, task) => {
        const minutes = task.estimate_minutes ?? 0
        return minutes > 0 ? sum + minutes * 60 : sum
      }, 0)
      const live = activeTaskId && laneIds.has(activeTaskId) ? timer.activeEntryElapsedSeconds : 0
      return {
        spentSeconds: spentBase + live,
        estimateSeconds: estimate,
      }
    }
    return {
      now: calc(nowTasks),
      next: calc(nextTasks),
    }
  }, [trackedMap, nowTasks, nextTasks, activeTaskId, timer.activeEntryElapsedSeconds])
  const defaultBucket = buckets.find((b) => b.is_default)
  const todayDropBucketId = defaultBucket?.id ?? buckets[0]?.id ?? "global"

  // Build a quick bucket name lookup for showing bucket labels on each task
  const bucketNameMap = new Map(buckets.map((b) => [b.id, b.name]))

  // Make the today list area a droppable for inbox items
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: encodeSectionDroppableId("today", todayDropBucketId),
    data: { type: "section", section: "today", bucketId: todayDropBucketId },
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
          <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs text-muted-foreground md:flex">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <span className="font-semibold text-foreground">Focusing</span>
            <span>{formatReadableDuration(timer.sessionDisplaySeconds)}</span>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={!suggestedFocusTaskId}
            onClick={() => {
              if (suggestedFocusTaskId) void startSession(suggestedFocusTaskId)
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
          splitTodaySections ? (
            <div className="space-y-2">
              <TodayLaneList
                lane="now"
                title="Now"
                tasks={nowTasks}
                spentSeconds={laneStats.now.spentSeconds}
                estimateSeconds={laneStats.now.estimateSeconds}
                todayDropBucketId={todayDropBucketId}
                bucketNameMap={bucketNameMap}
                promoteFromNext={nextTasks.length > 0 ? () => { void setTaskLane(nextTasks[0].id, "now") } : undefined}
              />
              <TodayLaneList
                lane="next"
                title="Next"
                tasks={nextTasks}
                spentSeconds={laneStats.next.spentSeconds}
                estimateSeconds={laneStats.next.estimateSeconds}
                todayDropBucketId={todayDropBucketId}
                bucketNameMap={bucketNameMap}
              />
            </div>
          ) : (
            <SortableContext items={todayIds} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-border/50">
                {todayTasks.map((task) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    showBucket
                    bucketName={task.bucket_id ? bucketNameMap.get(task.bucket_id) : undefined}
                    focusMode
                    orderedIds={todayIds}
                  />
                ))}
              </div>
            </SortableContext>
          )
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
