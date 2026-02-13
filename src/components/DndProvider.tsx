import { useState, useCallback } from "react"
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
import { TaskDragOverlayContent, InboxDragOverlayContent } from "@/components/TaskDragOverlay"
import { parseDroppableId } from "@/lib/dnd-types"
import type { DragData } from "@/lib/dnd-types"
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

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined
    if (data) {
      setActiveData(data)

      if (data.type === "task") {
        const { selectedTaskIds, toggleSelectTask, tasks } = useTaskStore.getState()

        // Ensure the dragged task is in the selection
        if (!selectedTaskIds.has(data.task.id)) {
          toggleSelectTask(data.task.id, false)
        }

        // Re-read after toggle to get the final selection set
        const finalIds = useTaskStore.getState().selectedTaskIds
        const idsToSnapshot = finalIds.size > 0 ? [...finalIds] : [data.task.id]

        const origins: DragOriginEntry[] = []
        for (const id of idsToSnapshot) {
          const t = tasks.find((task) => task.id === id)
          if (t) {
            origins.push({ id: t.id, section: t.section as SectionType, bucket_id: t.bucket_id })
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

    // Determine the target container (section + bucket)
    const overDataCurrent = over.data.current as DragData | Record<string, unknown> | undefined
    let targetSection: SectionType | null = null
    let targetBucketId: string | null = null

    if (overDataCurrent && "type" in overDataCurrent) {
      if (overDataCurrent.type === "task") {
        const overTask = (overDataCurrent as DragData & { type: "task" }).task
        targetSection = overTask.section as SectionType
        targetBucketId = overTask.bucket_id
      }
    }

    if (!targetSection) {
      const parsed = parseDroppableId(overId)
      if (parsed?.kind === "section") {
        targetSection = parsed.section
        targetBucketId = parsed.bucketId
      }
    }

    if (!targetSection || !targetBucketId) return

    // Check if the active task's container changed
    const store = useTaskStore.getState()
    const currentTask = store.tasks.find((t) => t.id === activeId)
    if (!currentTask) return

    const sameContainer = currentTask.section === targetSection && currentTask.bucket_id === targetBucketId
    if (sameContainer) return

    // Move ALL selected tasks to the new container in a single state update
    const { selectedTaskIds, moveTasksLocal } = store
    const ids = selectedTaskIds.size > 1 ? [...selectedTaskIds] : [activeId]

    moveTasksLocal(ids.map((id) => ({
      id,
      updates: { section: targetSection, bucket_id: targetBucketId },
    })))
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
  }, [dragOrigins])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveData(null)

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
        if (matched) return matched.target_bucket_id
        if (conn?.defaultBucketId) return conn.defaultBucketId
        if (fallbackBucketId) return fallbackBucketId
        // Last resort: default Inbox bucket
        const inbox = useBucketStore.getState().getDefaultBucket()
        return inbox?.id ?? fallbackBucketId
      }

      // Dropped onto a task — insert at that task's position
      if (overData && "type" in overData && overData.type === "task") {
        const overTask = (overData as DragData & { type: "task" }).task
        const bucketId = resolveRuleBucket(overTask.bucket_id ?? "")
        const section = overTask.section as "today" | "sooner" | "later"
        void importItem(data.connectionId, data.item, bucketId, section, overTask.position)
          .then(() => store.loadTasks())
        setDragOrigins([])
        return
      }

      // Dropped onto a section or bucket droppable — append at end
      if (target) {
        const resolvedBucketId = resolveRuleBucket(target.bucketId)
        if (target.kind === "section") {
          void importItem(data.connectionId, data.item, resolvedBucketId, target.section).then(() => store.loadTasks())
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

    // --- Task dropped onto a section or another task ---
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

      // All tasks in the target container, sorted by current position
      const containerTasks = store.tasks
        .filter((t) => t.bucket_id === targetBucketId && t.section === targetSection)
        .sort((a, b) => a.position - b.position)

      // If dropped on another task, reorder the active task relative to it
      if (overData && "type" in overData && overData.type === "task") {
        const overTask = (overData as DragData & { type: "task" }).task
        const oldIndex = containerTasks.findIndex((t) => t.id === activeId)
        const newIndex = containerTasks.findIndex((t) => t.id === overTask.id)

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(containerTasks, oldIndex, newIndex)
          reordered.forEach((task, i) => {
            void store.reorderTask(task.id, i, targetBucketId ?? undefined, targetSection)
          })
          setDragOrigins([])
          return
        }
      }

      // Fallback: persist current order for all tasks in this container
      containerTasks.forEach((task, i) => {
        const wasDragged = draggedIds.includes(task.id)
        if (task.position !== i || wasDragged) {
          void store.reorderTask(task.id, i, targetBucketId ?? undefined, targetSection)
        }
      })

      // Also re-number the source container(s) that lost tasks
      const sourceContainers = new Set(
        dragOrigins
          .filter((o) => o.section !== targetSection || o.bucket_id !== targetBucketId)
          .map((o) => `${o.section}:${o.bucket_id}`),
      )
      for (const key of sourceContainers) {
        const [section, bucketId] = key.split(":") as [SectionType, string]
        const sourceTasks = store.tasks
          .filter((t) => t.bucket_id === bucketId && t.section === section)
          .sort((a, b) => a.position - b.position)
        sourceTasks.forEach((task, i) => {
          if (task.position !== i) {
            void store.reorderTask(task.id, i)
          }
        })
      }

      setDragOrigins([])
      return
    }

    setDragOrigins([])
  }, [dragOrigins, revertDrag])

  const handleDragCancel = useCallback(() => {
    revertDrag()
    setActiveData(null)
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
