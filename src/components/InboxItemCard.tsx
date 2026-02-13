import { useState } from "react"
import type { InboxItem } from "@/types/inbox"
import { useBucketStore } from "@/stores/useBucketStore"
import { useDraggable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DragData } from "@/lib/dnd-types"
import { PROVIDER_ICON_MAP } from "@/components/icons/ProviderIcons"

interface InboxItemCardProps {
  item: InboxItem
  connectionId: string
  onImport: (bucketId: string, section: "today" | "sooner" | "later") => void
}

// ─── Priority helpers ───

type PriorityLevel = "urgent" | "high" | "medium" | "low" | "none"

interface PriorityInfo {
  level: PriorityLevel
  color: string
  borderColor: string
}

const PRIORITY_MAP: Record<PriorityLevel, PriorityInfo> = {
  urgent: { level: "urgent", color: "bg-red-500", borderColor: "border-l-red-500" },
  high: { level: "high", color: "bg-orange-500", borderColor: "border-l-orange-500" },
  medium: { level: "medium", color: "bg-amber-400", borderColor: "border-l-amber-400" },
  low: { level: "low", color: "bg-blue-400", borderColor: "border-l-blue-400" },
  none: { level: "none", color: "", borderColor: "border-l-border/70" },
}

/** Extract a normalized priority from the provider-specific metadata */
function extractPriority(item: InboxItem): PriorityInfo {
  const meta = item.metadata as Record<string, unknown>

  if (item.sourceType === "todoist") {
    // Todoist: 4 = Urgent, 3 = High, 2 = Medium, 1 = None
    const p = meta.priority as number | undefined
    if (p === 4) return PRIORITY_MAP.urgent
    if (p === 3) return PRIORITY_MAP.high
    if (p === 2) return PRIORITY_MAP.medium
    return PRIORITY_MAP.none
  }

  if (item.sourceType === "linear") {
    // Linear: stateType can indicate priority-like urgency
    const stateType = meta.stateType as string | undefined
    if (stateType === "started") return PRIORITY_MAP.high
    if (stateType === "unstarted") return PRIORITY_MAP.none
    return PRIORITY_MAP.none
  }

  return PRIORITY_MAP.none
}

// ─── Due date helpers ───

interface DueDateInfo {
  label: string
  urgency: "overdue" | "today" | "soon" | "normal"
}

function extractDueDate(item: InboxItem): DueDateInfo | null {
  const meta = item.metadata as Record<string, unknown>

  let dateStr: string | null = null

  if (item.sourceType === "todoist") {
    const due = meta.due as { date?: string } | null
    dateStr = due?.date ?? null
  } else if (item.sourceType === "attio") {
    dateStr = (meta.deadlineAt as string) ?? null
  }

  if (!dateStr) return null

  const dueDate = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)

  const dueDayStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())

  let urgency: DueDateInfo["urgency"] = "normal"
  if (dueDayStart < today) urgency = "overdue"
  else if (dueDayStart.getTime() === today.getTime()) urgency = "today"
  else if (dueDayStart < nextWeek) urgency = "soon"

  // Format relative label
  let label: string
  if (urgency === "overdue") {
    const daysAgo = Math.ceil((today.getTime() - dueDayStart.getTime()) / 86400000)
    label = daysAgo === 1 ? "Yesterday" : `${daysAgo}d overdue`
  } else if (urgency === "today") {
    label = "Today"
  } else {
    label = dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  return { label, urgency }
}

// ─── Group label helper ───

/** Extracts the grouping label for display as a subtle tag — team key for Linear, project for Todoist */
function extractGroupLabel(item: InboxItem): string | null {
  const meta = item.metadata as Record<string, unknown>
  if (item.sourceType === "linear") return (meta.teamKey as string) ?? null
  if (item.sourceType === "todoist") return (meta.projectName as string) ?? null
  return null
}

// ─── Card component ───

/**
 * Inbox item card — compact, scannable, with visual priority indicators,
 * due date badges, and inline import actions.
 */
export function InboxItemCard({ item, connectionId, onImport }: InboxItemCardProps) {
  const buckets = useBucketStore((s) => s.buckets)
  const defaultBucket = buckets.find((b) => b.is_default) ?? buckets[0]

  const [selectedBucket, setSelectedBucket] = useState(defaultBucket?.id ?? "")
  const [selectedSection, setSelectedSection] = useState<"today" | "sooner" | "later">("sooner")
  const [expanded, setExpanded] = useState(false)

  const dragData: DragData = { type: "inbox-item", item, connectionId }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `inbox:${item.id}`,
    data: dragData,
  })

  const style = { transform: CSS.Transform.toString(transform) }

  const handleImport = () => {
    if (!selectedBucket) return
    onImport(selectedBucket, selectedSection)
  }

  const priority = extractPriority(item)
  const dueDate = extractDueDate(item)
  const groupLabel = extractGroupLabel(item)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-md border border-border/70 bg-card text-xs",
        "border-l-[3px] transition-all duration-150 cursor-grab active:cursor-grabbing",
        "hover:border-border hover:shadow-sm hover:bg-accent/30",
        priority.borderColor,
        isDragging && "opacity-40",
      )}
      {...attributes}
      {...listeners}
    >
      {/* Main content — compact single row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {/* Provider icon — branded logo before title */}
        {(() => {
          const Icon = PROVIDER_ICON_MAP[item.sourceType]
          return Icon ? <Icon className="size-4 shrink-0" /> : null
        })()}

        {/* Title + subtitle */}
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="block truncate font-medium leading-snug">{item.title}</span>
        </button>

        {/* Right side: metadata by default, action buttons on hover */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Default: metadata badges — hidden on hover (desktop), always hidden (mobile shows actions) */}
          <div className="hidden h-6 items-center gap-1 md:flex md:group-hover:hidden">
            {dueDate && (
              <span
                className={cn(
                  "rounded px-1 py-0.5 text-[9px] font-medium leading-none",
                  dueDate.urgency === "overdue" && "bg-red-500/15 text-red-600 dark:text-red-400",
                  dueDate.urgency === "today" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                  dueDate.urgency === "soon" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                  dueDate.urgency === "normal" && "text-muted-foreground",
                )}
              >
                {dueDate.label}
              </span>
            )}
            {groupLabel && (
              <span className="max-w-[60px] truncate rounded bg-muted px-1 py-0.5 text-[9px] leading-none text-muted-foreground">
                {groupLabel}
              </span>
            )}
          </div>

          {/* Action buttons — always visible on mobile, hover-reveal on desktop */}
          <div className="flex h-6 items-center md:hidden md:group-hover:flex">
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-8 md:size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Open in provider"
                title="Open in provider"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="size-3.5 md:size-3" />
              </a>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 md:size-6 text-muted-foreground hover:text-foreground"
              onClick={handleImport}
              aria-label="Quick import"
              title="Import to default bucket"
            >
              <Download className="size-3.5 md:size-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Expanded import controls */}
      {expanded && (
        <div className="flex items-center gap-1 border-t border-border/50 px-2 py-1.5">
          <Select value={selectedBucket} onValueChange={setSelectedBucket}>
            <SelectTrigger className="h-6 flex-1 text-[10px]">
              <SelectValue placeholder="Bucket" />
            </SelectTrigger>
            <SelectContent>
              {buckets.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-[10px]">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedSection} onValueChange={(v) => setSelectedSection(v as "today" | "sooner" | "later")}>
            <SelectTrigger className="h-6 w-20 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today" className="text-[10px]">Today</SelectItem>
              <SelectItem value="sooner" className="text-[10px]">Sooner</SelectItem>
              <SelectItem value="later" className="text-[10px]">Later</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="default" size="sm" className="h-6 px-2 text-[10px]" onClick={handleImport}>
            Import
          </Button>
        </div>
      )}
    </div>
  )
}
