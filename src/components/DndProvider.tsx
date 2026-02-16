import { useState, useCallback, useEffect } from "react"
import type { ReactNode } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from "@dnd-kit/core"
import type { DragStartEvent, DragEndEvent, DragOverEvent } from "@dnd-kit/core"
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable"
import { useTaskStore } from "@/stores/useTaskStore"
import { useBucketStore } from "@/stores/useBucketStore"
import { useConnectionStore } from "@/stores/useConnectionStore"
import { useImportRuleStore } from "@/stores/useImportRuleStore"
import { useTodaySectionsStore } from "@/stores/useTodaySectionsStore"
import { TaskDragOverlayContent, InboxDragOverlayContent } from "@/components/TaskDragOverlay"
import { parseDroppableId } from "@/lib/dnd-types"
import type { DragData, TodayLane } from "@/lib/dnd-types"
import type { LocalTask } from "@/types/local"
import type { InboxItem } from "@/types/inbox"
import type { SectionType } from "@/types/database"

interface DndProviderProps {
  children: ReactNode
}

/**
 * Global drag-and-drop context wrapping the entire app.
 * Handles sensor configuration, overlay rendering, and drop logic
 * for tasks, inbox items, and bucket targets.
 */
/** Snapshot of a task's original container — used to revert on cancel */
interface DragOriginEntry {
  id: string
  section: SectionType
  bucket_id: string | null
  todayLane: TodayLane
}

const INBOX_DRAGGING_CLASS = "flowpin-dragging-inbox"

function setInboxDraggingBodyClass(isDraggingInboxItem: boolean): void {
  if (typeof document === "undefined") return
  document.body.classList.toggle(INBOX_DRAGGING_CLASS, isDraggingInboxItem)
}

export function DndProvider({ children }: DndProviderProps) {
  const [activeData, setActiveData] = useState<DragData | null>(null)
  /** Origins for ALL tasks involved in this drag (active + multi-selected) */
  const [dragOrigins, setDragOrigins] = useState<DragOriginEntry[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    return () => {
      setInboxDraggingBodyClass(false)
    }
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined
    if (data) {
      setActiveData(data)
      setInboxDraggingBodyClass(data.type === "inbox-item")

      if (data.type === "task") {
        const { selectedTaskIds, toggleSelectTask, tasks } = useTaskStore.getState()

        // Ensure the dragged task is in the selection
        if (!selectedTaskIds.has(data.task.id)) {
          toggleSelectTask(data.task.id, false)
        }

        // Re-read after toggle to get the final selection set
        const finalIds = useTaskStore.getState().selectedTaskIds
        const idsToSnapshot = finalIds.size > 0 ? [...finalIds] : [data.task.id]
        const todayStore = useTodaySectionsStore.getState()

        const origins: DragOriginEntry[] = []
        for (const id of idsToSnapshot) {
          const t = tasks.find((task) => task.id === id)
          if (t) {
            origins.push({
              id: t.id,
              section: t.section as SectionType,
              bucket_id: t.bucket_id,
              todayLane: todayStore.getTaskLane(t.id),
            })
          }
        }
        setDragOrigins(origins)
      }
    }
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeDataCurrent = active.data.current as DragData | undefined
    if (!activeDataCurrent || activeDataCurrent.type !== "task") return

    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    // Determine the target container (section + bucket) and optional Today lane.
    const overDataCurrent = over.data.current as DragData | Record<string, unknown> | undefined
    let targetSection: SectionType | null = null
    let targetBucketId: string | null = null
    let targetTodayLane: TodayLane | null = null
    const todayStore = useTodaySectionsStore.getState()

    if (overDataCurrent && "type" in overDataCurrent) {
      if (overDataCurrent.type === "task") {
        const overTask = (overDataCurrent as DragData & { type: "task" }).task
        targetSection = overTask.section as SectionType
        targetBucketId = overTask.bucket_id
        if (todayStore.enabled && overTask.section === "today") {
          targetTodayLane = todayStore.getTaskLane(overTask.id)
        }
      }
    }

    if (!targetSection) {
      const parsed = parseDroppableId(overId)
      if (parsed?.kind === "section") {
        targetSection = parsed.section
        targetBucketId = parsed.bucketId
      } else if (parsed?.kind === "today-lane") {
        targetSection = "today"
        targetBucketId = parsed.bucketId
        targetTodayLane = parsed.lane
      }
    }

    if (!targetSection || !targetBucketId) return

    // Check if the active task's container changed
    const store = useTaskStore.getState()
    const currentTask = store.tasks.find((t) => t.id === activeId)
    if (!currentTask) return

    const currentTodayLane = todayStore.enabled && currentTask.section === "today"
      ? todayStore.getTaskLane(activeId)
      : null
    const sameContainer = currentTask.section === targetSection && currentTask.bucket_id === targetBucketId
    const sameTodayLane = !todayStore.enabled || targetSection !== "today" || !targetTodayLane || currentTodayLane === targetTodayLane
    if (sameContainer && sameTodayLane) return

    // Move ALL selected tasks to the new container in a single state update
    const { selectedTaskIds, moveTasksLocal } = store
    const ids = selectedTaskIds.size > 1 ? [...selectedTaskIds] : [activeId]

    moveTasksLocal(ids.map((id) => ({
      id,
      updates: { section: targetSection, bucket_id: targetBucketId },
    })))

    if (todayStore.enabled && targetSection === "today" && targetTodayLane) {
      todayStore.setTaskLanesLocal(ids.map((id) => ({ taskId: id, lane: targetTodayLane as TodayLane })))
    }
  }, [])

  /** Revert all dragged tasks to their original containers in one state update */
  const revertDrag = useCallback(() => {
    const { moveTasksLocal } = useTaskStore.getState()
    moveTasksLocal(dragOrigins.map((origin) => ({
      id: origin.id,
      updates: {
        section: origin.section,
        bucket_id: origin.bucket_id ?? undefined,
      },
    })))
    useTodaySectionsStore.getState().setTaskLanesLocal(
      dragOrigins.map((origin) => ({ taskId: origin.id, lane: origin.todayLane })),
    )
  }, [dragOrigins])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveData(null)
    setInboxDraggingBodyClass(false)

    const { active, over } = event
    if (!over) {
      revertDrag()
      setDragOrigins([])
      return
    }

    const data = active.data.current as DragData | undefined
    if (!data) {
      setDragOrigins([])
      return
    }

    const overId = String(over.id)
    const target = parseDroppableId(overId)
    const overData = over.data.current as DragData | undefined
    const todayStore = useTodaySectionsStore.getState()

    // --- Inbox item dropped onto a target ---
    if (data.type === "inbox-item") {
      const { importItem, connections } = useConnectionStore.getState()
      const store = useTaskStore.getState()

      const conn = connections.find((c) => c.id === data.connectionId)

      // Resolve bucket via import rules first, then connection default, then Inbox
      const resolveRuleBucket = (fallbackBucketId: string): string => {
        const rules = useImportRuleStore.getState().getActiveRules()
        const item = data.item as InboxItem
        const meta = item.metadata as Record<string, unknown>
        const matched = rules.find((r) => {
          if (r.integration_type !== item.sourceType) return false
          switch (item.sourceType) {
            case "linear": return r.source_filter.teamId === meta.teamId
            case "todoist": return r.source_filter.projectId === meta.projectId
            case "attio": return r.source_filter.listId === "all" || r.source_filter.listId === meta.listId
            default: return false
          }
        })
        if (matched?.target_bucket_id) return matched.target_bucket_id
        if (conn?.defaultBucketId) return conn.defaultBucketId
        if (fallbackBucketId) return fallbackBucketId
        // Last resort: default Inbox bucket
        const inbox = useBucketStore.getState().getDefaultBucket()
        return inbox?.id ?? fallbackBucketId
      }

      const assignTodayLaneAfterImport = (lane: TodayLane) => {
        // Import de-duplicates by source ID, so this locator is stable.
        const imported = useTaskStore.getState().tasks.find(
          (task) => task.source === data.item.sourceType && task.source_id === data.item.sourceId,
        )
        if (imported) {
          void todayStore.setTaskLane(imported.id, lane)
        }
      }

      // Dropped onto a task — insert at that task's position
      if (overData && "type" in overData && overData.type === "task") {
        const overTask = (overData as DragData & { type: "task" }).task
        const bucketId = resolveRuleBucket(overTask.bucket_id ?? "")
        const section = overTask.section as "today" | "sooner" | "later"
        void importItem(data.connectionId, data.item, bucketId, section, overTask.position)
          .then(() => store.loadTasks())
          .then(() => {
            if (todayStore.enabled && section === "today") {
              const lane = todayStore.getTaskLane(overTask.id)
              assignTodayLaneAfterImport(lane)
            }
          })
        setDragOrigins([])
        return
      }

      // Dropped onto a section or bucket droppable — append at end
      if (target) {
        const resolvedBucketId = resolveRuleBucket(target.bucketId)
        if (target.kind === "section") {
          void importItem(data.connectionId, data.item, resolvedBucketId, target.section).then(() => store.loadTasks())
        } else if (target.kind === "today-lane") {
          void importItem(data.connectionId, data.item, resolvedBucketId, "today")
            .then(() => store.loadTasks())
            .then(() => assignTodayLaneAfterImport(target.lane))
        } else if (target.kind === "bucket") {
          void importItem(data.connectionId, data.item, resolvedBucketId, "sooner").then(() => store.loadTasks())
        }
      }
      setDragOrigins([])
      return
    }

    // --- Bucket reorder ---
    if (data.type === "bucket" && overData?.type === "bucket") {
      if (data.bucketId === overData.bucketId) { setDragOrigins([]); return }
      const { buckets, reorderBucket } = useBucketStore.getState()
      const targetBucket = buckets.find((b) => b.id === overData.bucketId)
      if (targetBucket) void reorderBucket(data.bucketId, targetBucket.position)
      setDragOrigins([])
      return
    }

    // --- Task dropped onto a sidebar bucket ---
    if (data.type === "task" && target?.kind === "bucket") {
      revertDrag()
      const { selectedTaskIds, moveToBucket } = useTaskStore.getState()
      const ids = selectedTaskIds.size > 1 ? [...selectedTaskIds] : [data.task.id]
      for (const taskId of ids) {
        const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
        if (task && task.bucket_id !== target.bucketId) {
          void moveToBucket(taskId, target.bucketId)
        }
      }
      setDragOrigins([])
      return
    }

    // --- Task dropped onto a section, Today lane, or another task ---
    // onDragOver already moved ALL selected tasks to the correct container in memory.
    // Now persist positions to Dexie for the affected containers.
    if (data.type === "task") {
      const activeId = String(active.id)
      const store = useTaskStore.getState()
      const { selectedTaskIds } = store
      const draggedIds = selectedTaskIds.size > 1 ? [...selectedTaskIds] : [activeId]

      const currentTask = store.tasks.find((t) => t.id === activeId)
      if (!currentTask) { setDragOrigins([]); return }

      const targetBucketId = currentTask.bucket_id
      const targetSection = currentTask.section as SectionType
      const targetTodayLane = todayStore.enabled && targetSection === "today"
        ? todayStore.getTaskLane(activeId)
        : null

      // All tasks in the target container, sorted by current position
      const containerTasks = store.tasks
        .filter((t) => {
          if (t.bucket_id !== targetBucketId || t.section !== targetSection) return false
          if (todayStore.enabled && targetSection === "today" && targetTodayLane) {
            return todayStore.getTaskLane(t.id) === targetTodayLane
          }
          return true
        })
        .sort((a, b) => a.position - b.position)

      // If dropped on another task, reorder the active task relative to it
      if (overData && "type" in overData && overData.type === "task") {
        const overTask = (overData as DragData & { type: "task" }).task
        const oldIndex = containerTasks.findIndex((t) => t.id === activeId)
        const newIndex = containerTasks.findIndex((t) => t.id === overTask.id)

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(containerTasks, oldIndex, newIndex)
          reordered.forEach((task, i) => {
            void store.reorderTask(
              task.id,
              i,
              targetBucketId ?? undefined,
              targetSection,
              targetSection === "today" ? (targetTodayLane ?? undefined) : undefined,
            )
          })
          if (todayStore.enabled && targetSection === "today" && targetTodayLane) {
            void todayStore.setTaskLanes(
              draggedIds.map((id) => ({ taskId: id, lane: targetTodayLane })),
            )
          }
          setDragOrigins([])
          return
        }
      }

      // Fallback: persist current order for all tasks in this container
      containerTasks.forEach((task, i) => {
        const wasDragged = draggedIds.includes(task.id)
        if (task.position !== i || wasDragged) {
          void store.reorderTask(
            task.id,
            i,
            targetBucketId ?? undefined,
            targetSection,
            targetSection === "today" ? (targetTodayLane ?? undefined) : undefined,
          )
        }
      })

      // Also re-number the source container(s) that lost tasks
      const sourceContainers = new Set(
        dragOrigins
          .filter((o) => (
            o.section !== targetSection
            || o.bucket_id !== targetBucketId
            || (todayStore.enabled && o.section === "today" && o.todayLane !== targetTodayLane)
          ))
          .map((o) => {
            if (todayStore.enabled && o.section === "today") return `${o.section}:${o.bucket_id}:${o.todayLane}`
            return `${o.section}:${o.bucket_id}`
          }),
      )
      for (const key of sourceContainers) {
        const [section, bucketId, lane] = key.split(":") as [SectionType, string, TodayLane | undefined]
        const sourceTasks = store.tasks
          .filter((t) => {
            if (t.bucket_id !== bucketId || t.section !== section) return false
            if (todayStore.enabled && section === "today" && lane) {
              return todayStore.getTaskLane(t.id) === lane
            }
            return true
          })
          .sort((a, b) => a.position - b.position)
        sourceTasks.forEach((task, i) => {
          if (task.position !== i) {
            void store.reorderTask(
              task.id,
              i,
              undefined,
              undefined,
              section === "today" ? (lane ?? undefined) : undefined,
            )
          }
        })
      }

      if (todayStore.enabled && targetSection === "today" && targetTodayLane) {
        void todayStore.setTaskLanes(
          draggedIds.map((id) => ({ taskId: id, lane: targetTodayLane })),
        )
      }

      setDragOrigins([])
      return
    }

    setDragOrigins([])
  }, [dragOrigins, revertDrag])

  const handleDragCancel = useCallback(() => {
    revertDrag()
    setActiveData(null)
    setInboxDraggingBodyClass(false)
    setDragOrigins([])
  }, [revertDrag])

  // Compute overlay content
  const overlayContent = (() => {
    if (!activeData) return null

    if (activeData.type === "task") {
      const { selectedTaskIds } = useTaskStore.getState()
      const count = selectedTaskIds.size > 1 ? selectedTaskIds.size : 1
      return <TaskDragOverlayContent task={activeData.task as LocalTask} count={count} />
    }

    if (activeData.type === "inbox-item") {
      return <InboxDragOverlayContent item={activeData.item as InboxItem} />
    }

    return null
  })()

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {overlayContent}
      </DragOverlay>
    </DndContext>
  )
}
