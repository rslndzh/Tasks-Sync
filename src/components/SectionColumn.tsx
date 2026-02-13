import { useState } from "react"
import { ChevronRight, Star, Zap, Clock } from "lucide-react"
import { SortableTaskCard } from "@/components/SortableTaskCard"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { useDroppable } from "@dnd-kit/core"
import { cn } from "@/lib/utils"
import { encodeSectionDroppableId } from "@/lib/dnd-types"
import type { LocalTask } from "@/types/local"
import type { SectionType } from "@/types/database"

interface SectionColumnProps {
  title: string
  section: SectionType
  bucketId: string
  tasks: LocalTask[]
  emptyText: string
  /** Start collapsed when empty */
  defaultCollapsed?: boolean
}

const SECTION_ICONS: Record<SectionType, typeof Star> = {
  today: Star,
  sooner: Zap,
  later: Clock,
}

/**
 * Vertical section within a bucket page.
 * Collapsible header, droppable target, clean minimal design.
 */
export function SectionColumn({
  title,
  section,
  bucketId,
  tasks,
  emptyText,
  defaultCollapsed = false,
}: SectionColumnProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed && tasks.length === 0)

  const droppableId = encodeSectionDroppableId(section, bucketId)
  const taskIds = tasks.map((t) => t.id)

  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { type: "section", section, bucketId },
  })

  const Icon = SECTION_ICONS[section]

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg py-1 transition-colors",
        isOver && "bg-primary/5",
      )}
    >
      {/* Section header — collapsible */}
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
          <Icon className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            {title}
          </span>
        </button>

        {tasks.length > 0 && (
          <span className="text-[10px] font-medium text-muted-foreground/50">
            {tasks.length}
          </span>
        )}

        <div className="flex-1" />
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="mt-1">
          {/* Task list */}
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {tasks.length > 0 ? (
              <div className="divide-y divide-border/30">
                {tasks.map((task) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    orderedIds={taskIds}
                  />
                ))}
              </div>
            ) : (
              <p className="px-3 py-2 text-xs italic text-muted-foreground/40">
                {emptyText}
              </p>
            )}
          </SortableContext>
        </div>
      )}
    </div>
  )
}
