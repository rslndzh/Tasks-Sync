import { useNavigate, useLocation } from "react-router-dom"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils"
import { TaskCard } from "@/components/TaskCard"
import { TaskContextMenu } from "@/components/TaskContextMenu"
import { useTaskStore } from "@/stores/useTaskStore"
import { useTrackedTimeMap } from "@/hooks/useTrackedTime"
import type { LocalTask } from "@/types/local"
import type { DragData } from "@/lib/dnd-types"

interface SortableTaskCardProps {
  task: LocalTask
  /** Show bucket name tag (used in Today view) */
  showBucket?: boolean
  bucketName?: string
  /** Ordered list of task IDs for shift-click range selection */
  orderedIds: string[]
}

/**
 * Wraps TaskCard with dnd-kit sortable behavior.
 * Handles drag transforms, click-to-open behavior, selection modifiers,
 * and carries DragData for the global DndProvider.
 */
export function SortableTaskCard({ task, showBucket, bucketName, orderedIds }: SortableTaskCardProps) {
  const { selectedTaskId, selectedTaskIds, toggleSelectTask, selectRange, setSelectedTask, setHoveredTask } = useTaskStore()
  const navigate = useNavigate()
  const location = useLocation()
  const trackedMap = useTrackedTimeMap()

  const dragData: DragData = { type: "task", task }

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: dragData,
  })

  const style = {
    transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null),
    transition,
  }

  const isMultiSelected = selectedTaskIds.size > 1 && selectedTaskIds.has(task.id)
  const isFocused = selectedTaskId === task.id

  function handleRowClick(e: React.MouseEvent) {
    // Explicit selection mode
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault()
      toggleSelectTask(task.id, true)
      return
    }

    if (e.shiftKey) {
      e.preventDefault()
      if (selectedTaskId) {
        selectRange(selectedTaskId, task.id, orderedIds)
      } else {
        toggleSelectTask(task.id, false)
      }
      return
    }

    // Default behavior: open task detail on click.
    navigate(`/task/${task.id}`, { state: { from: location.pathname } })
  }

  return (
    <TaskContextMenu task={task}>
      <div
        ref={setNodeRef}
        data-task-id={task.id}
        style={style}
        onClick={handleRowClick}
        onContextMenu={() => {
          if (!selectedTaskIds.has(task.id)) {
            toggleSelectTask(task.id, false)
            return
          }
          setSelectedTask(task.id)
        }}
        onMouseEnter={() => setHoveredTask(task.id)}
        onMouseLeave={() => setHoveredTask(null)}
        className={cn(
          isDragging && "z-10 opacity-40",
        )}
        {...attributes}
        {...listeners}
      >
        <TaskCard
          task={task}
          showBucket={showBucket}
          bucketName={bucketName}
          trackedSeconds={trackedMap.get(task.id) ?? 0}
          isSelected={isFocused}
          isMultiSelected={isMultiSelected}
        />
      </div>
    </TaskContextMenu>
  )
}
