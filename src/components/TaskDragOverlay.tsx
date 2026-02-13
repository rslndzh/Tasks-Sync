import { Badge } from "@/components/ui/badge"
import { Circle } from "lucide-react"
import type { LocalTask } from "@/types/local"
import type { InboxItem } from "@/types/inbox"

interface TaskOverlayProps {
  task: LocalTask
  /** Total count when multi-dragging (includes this task) */
  count: number
}

/** Rendered inside DragOverlay — a lightweight preview of the dragged task(s) */
export function TaskDragOverlayContent({ task, count }: TaskOverlayProps) {
  return (
    <div className="relative w-80">
      {/* Stacked card effect for multi-drag */}
      {count > 1 && (
        <>
          <div className="absolute inset-x-1.5 -top-1.5 h-full rounded-lg bg-card/70 shadow-sm" />
          <div className="absolute inset-x-0.5 -top-0.5 h-full rounded-lg bg-card/85 shadow-sm" />
        </>
      )}
      <div className="relative flex items-center gap-2.5 rounded-lg bg-card px-3 py-2.5 shadow-xl ring-1 ring-primary/20">
        <Circle className="h-[18px] w-[18px] flex-shrink-0 text-muted-foreground/30" strokeWidth={1.5} />
        <p className="truncate text-sm">{task.title}</p>
        {count > 1 && (
          <Badge className="absolute -right-2 -top-2 bg-primary text-primary-foreground">
            {count}
          </Badge>
        )}
      </div>
    </div>
  )
}

interface InboxOverlayProps {
  item: InboxItem
}

/** Rendered inside DragOverlay for inbox items being dragged to import */
export function InboxDragOverlayContent({ item }: InboxOverlayProps) {
  return (
    <div className="w-64 rounded-lg border border-dashed border-primary/30 bg-card px-3 py-2.5 shadow-xl">
      <p className="truncate text-sm">{item.title}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">Drop to import</p>
    </div>
  )
}
