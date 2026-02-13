import { useNavigate, useLocation } from "react-router-dom"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils"
import { TaskCard } from "@/components/TaskCard"
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
 * Handles drag transforms, multi-select click logic, double-click
 * to open task detail, and carries DragData for the global DndProvider.
 */
export function SortableTaskCard({ task, showBucket, bucketName, orderedIds }: SortableTaskCardProps) {
  const { selectedTaskId, selectedTaskIds, toggleSelectTask, selectRange } = useTaskStore()
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

  function handleSelect(e: React.MouseEvent) {
    if (e.shiftKey && selectedTaskId) {
      selectRange(selectedTaskId, task.id, orderedIds)
    } else {
      toggleSelectTask(task.id, e.metaKey || e.ctrlKey)
    }
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.preventDefault()
    navigate(`/task/${task.id}`, { state: { from: location.pathname } })
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={handleSelect}
      onDoubleClick={handleDoubleClick}
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
  )
}
