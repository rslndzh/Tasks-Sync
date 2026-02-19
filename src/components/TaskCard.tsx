import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Circle, ExternalLink, Pencil, Play, Trash2 } from "lucide-react"
import { File } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTaskStore } from "@/stores/useTaskStore"
import { useSessionStore } from "@/stores/useSessionStore"
import { PROVIDER_ICON_MAP } from "@/components/icons/ProviderIcons"
import { hasTaskNotes } from "@/lib/task-notes"
import { getTaskSourceUrl } from "@/lib/task-links"
import { getTaskSourceProject } from "@/lib/task-source"
import type { LocalTask } from "@/types/local"

interface TaskCardProps {
  task: LocalTask
  showBucket?: boolean
  bucketName?: string
  /** Completed tracked seconds (excluding live timer) */
  trackedSeconds?: number
  isSelected?: boolean
  isMultiSelected?: boolean
  dimmed?: boolean
  onSelect?: () => void
}

export function TaskCard({
  task,
  showBucket,
  bucketName,
  trackedSeconds = 0,
  isSelected,
  isMultiSelected,
  dimmed = false,
  onSelect,
}: TaskCardProps) {
  const { completeTask, archiveTask, updateTask } = useTaskStore()
  const isRunning = useSessionStore((s) => s.isRunning)
  const startSession = useSessionStore((s) => s.startSession)
  const switchTask = useSessionStore((s) => s.switchTask)
  const sessionTaskId = useSessionStore((s) => s.activeTaskId)
  const liveTrackedSeconds = useSessionStore((s) => {
    if (!s.isRunning || s.activeTaskId !== task.id || !s.activeTimeEntry?.started_at) return 0
    return Math.max(0, Math.floor((Date.now() - new Date(s.activeTimeEntry.started_at).getTime()) / 1000))
  })
  const isActiveInSession = isRunning && sessionTaskId === task.id
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(task.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  function handleSave() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== task.title) {
      void updateTask(task.id, { title: trimmed })
    }
    setIsEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave()
    else if (e.key === "Escape") {
      setEditValue(task.title)
      setIsEditing(false)
    }
  }

  const totalTracked = trackedSeconds + liveTrackedSeconds
  const hasEstimate = task.estimate_minutes != null && task.estimate_minutes > 0
  const hasTracked = totalTracked > 0
  const showTimeInfo = hasTracked
  const hasNotes = hasTaskNotes(task.description)
  const waitingReason = task.waiting_for_reason?.trim() ? task.waiting_for_reason.trim() : null
  const sourceUrl = getTaskSourceUrl(task)
  const sourceProject = getTaskSourceProject(task)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !isEditing) onSelect?.()
      }}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
        "hover:bg-accent/50",
        (isSelected || isMultiSelected) && "bg-accent/60",
        isActiveInSession && !isSelected && !isMultiSelected && "bg-primary/[0.06]",
        dimmed && !isSelected && !isMultiSelected && "opacity-75",
      )}
    >

      {/* Checkbox */}
      <button
        type="button"
        className={cn(
          "flex-shrink-0 transition-colors",
          waitingReason
            ? "text-muted-foreground/70 hover:text-muted-foreground"
            : "text-muted-foreground/30 hover:text-primary",
        )}
        onClick={(e) => {
          e.stopPropagation()
          void completeTask(task.id)
        }}
        aria-label={waitingReason ? "Unblock waiting task" : "Complete task"}
      >
        <Circle
          className={cn(
            "h-[18px] w-[18px]",
            waitingReason && "fill-muted stroke-muted-foreground/70",
          )}
          strokeWidth={1.5}
        />
      </button>

      {/* Title + source — fills available space */}
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="h-auto border-none p-0 text-sm shadow-none focus-visible:ring-0"
          />
        ) : (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {/* Provider icon for integration tasks */}
              {task.source !== "manual" && (() => {
                const Icon = PROVIDER_ICON_MAP[task.source]
                return Icon ? <Icon className="size-4 flex-shrink-0" /> : null
              })()}
              <span className="truncate text-sm leading-tight">{task.title}</span>
              {task.source !== "manual" && sourceProject && (
                <span className="max-w-[11rem] truncate rounded bg-muted px-1 py-0.5 text-[10px] leading-none text-muted-foreground">
                  {sourceProject}
                </span>
              )}
              {hasNotes && (
                <File
                  className="size-3.5 flex-shrink-0 text-muted-foreground/45"
                  aria-label="Task has notes"
                />
              )}
              {hasEstimate && (
                <span className="rounded bg-muted px-1 py-0.5 text-[10px] leading-none text-muted-foreground">
                  {fmt(task.estimate_minutes! * 60)}
                </span>
              )}
            </div>
            {waitingReason && (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                Waiting for: {waitingReason}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Right side: metadata by default, action buttons on hover */}
      <div className="flex flex-shrink-0 items-center">
        {/* Default: time info + bucket tag — hidden on hover (desktop) or always hidden (mobile) */}
        <div className="hidden h-6 items-center gap-1 md:flex md:group-hover:hidden">
          {showTimeInfo && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {isActiveInSession && (
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              )}
              {hasTracked && (
                <span className={cn(isActiveInSession && "font-medium text-primary")}>
                  {fmt(totalTracked)}
                </span>
              )}
              {hasTracked && hasEstimate && (
                <span className="text-muted-foreground/30">/</span>
              )}
              {hasEstimate && (
                <span className={cn(hasTracked ? "text-muted-foreground/50" : "text-muted-foreground/60")}>
                  {fmt(task.estimate_minutes! * 60)}
                </span>
              )}
            </div>
          )}
          {showBucket && bucketName && (
            <span className="rounded bg-muted px-1 py-0.5 text-[10px] leading-none text-muted-foreground">
              {bucketName}
            </span>
          )}
        </div>

        {/* Action buttons — always visible on mobile, hover-reveal on desktop */}
        <div className="flex h-6 items-center gap-0.5 md:hidden md:group-hover:flex">
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex size-8 md:size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Open in source"
              title="Open in source"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-3.5 md:size-3" />
            </a>
          )}
          {!isActiveInSession && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 md:size-6 border-none text-muted-foreground hover:text-primary"
              onClick={(e) => {
                e.stopPropagation()
                if (isRunning) void switchTask(task.id)
                else void startSession(task.id)
              }}
              aria-label={isRunning ? "Switch to this task" : "Start focus"}
            >
              <Play className="size-3.5 md:size-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 md:size-6 border-none text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation()
              setIsEditing(true)
            }}
            aria-label="Edit task"
          >
            <Pencil className="size-3.5 md:size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 md:size-6 border-none text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              void archiveTask(task.id)
            }}
            aria-label="Archive task"
          >
            <Trash2 className="size-3.5 md:size-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Compact duration: 45s, 12m, 1h 30m, 2h */
function fmt(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
}
