import { useState, useRef, useEffect, useMemo } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Folder,
  Play,
  Square,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TiptapEditor } from "@/components/TiptapEditor"
import { MarkdownRenderer } from "@/components/MarkdownRenderer"
import { PROVIDER_ICON_MAP } from "@/components/icons/ProviderIcons"
import { useTaskStore } from "@/stores/useTaskStore"
import { useBucketStore } from "@/stores/useBucketStore"
import { useSessionStore } from "@/stores/useSessionStore"
import { db } from "@/lib/db"
import { cn } from "@/lib/utils"
import type { LocalTimeEntry } from "@/types/local"
import type { SectionType } from "@/types/database"

const SOURCE_LABELS: Record<string, string> = {
  linear: "Linear",
  todoist: "Todoist",
  attio: "Attio",
}

const SECTION_LABELS: Record<SectionType, string> = {
  today: "Today",
  sooner: "Sooner",
  later: "Later",
}

export function TaskPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()

  const tasks = useTaskStore((s) => s.tasks)
  const isLoaded = useTaskStore((s) => s.isLoaded)
  const updateTask = useTaskStore((s) => s.updateTask)
  const completeTask = useTaskStore((s) => s.completeTask)
  const archiveTask = useTaskStore((s) => s.archiveTask)
  const moveToSection = useTaskStore((s) => s.moveToSection)
  const moveToBucket = useTaskStore((s) => s.moveToBucket)
  const buckets = useBucketStore((s) => s.buckets)
  const { isRunning, startSession, switchTask, stopSession, activeTaskId } = useSessionStore()

  const location = useLocation()
  const fromPath = (location.state as { from?: string } | null)?.from

  const task = tasks.find((t) => t.id === taskId)
  const bucket = buckets.find((b) => b.id === task?.bucket_id)
  const isActiveInSession = isRunning && activeTaskId === taskId

  // Derive back label from the page the user navigated from
  const backLabel = useMemo(() => {
    if (!fromPath) return "Back"
    if (fromPath === "/") return "Today"
    if (fromPath === "/inbox") return "Inbox"
    // /bucket/:bucketId
    const bucketMatch = fromPath.match(/^\/bucket\/(.+)$/)
    if (bucketMatch) {
      const fromBucket = buckets.find((b) => b.id === bucketMatch[1])
      return fromBucket?.name ?? "Back"
    }
    return "Back"
  }, [fromPath, buckets])

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(task?.title ?? "")
  const titleRef = useRef<HTMLInputElement>(null)
  const [sourceDescOpen, setSourceDescOpen] = useState(false)
  const [timeEntries, setTimeEntries] = useState<LocalTimeEntry[]>([])

  useEffect(() => {
    if (isEditingTitle && titleRef.current) {
      titleRef.current.focus()
      titleRef.current.select()
    }
  }, [isEditingTitle])

  useEffect(() => {
    if (task) setTitleValue(task.title)
  }, [task?.title])

  // Escape navigates back when nothing is focused
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const el = document.activeElement
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement)?.isContentEditable) return
        navigate(-1)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [navigate])

  useEffect(() => {
    if (!taskId) return
    void db.timeEntries
      .where("task_id")
      .equals(taskId)
      .toArray()
      .then((entries) => {
        setTimeEntries(entries.sort((a, b) => b.started_at.localeCompare(a.started_at)))
      })
  }, [taskId, isRunning])

  function handleTitleSave() {
    const trimmed = titleValue.trim()
    if (trimmed && trimmed !== task?.title) {
      void updateTask(taskId!, { title: trimmed })
    }
    setIsEditingTitle(false)
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleTitleSave()
    if (e.key === "Escape") {
      setTitleValue(task?.title ?? "")
      setIsEditingTitle(false)
    }
  }

  function handleDescriptionChange(html: string) {
    if (!taskId) return
    const value = html === "<p></p>" || html === "" ? null : html
    void updateTask(taskId, { description: value })
  }

  // Wait for store to hydrate from Dexie before showing 404
  if (!isLoaded) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
      </div>
    )
  }

  // 404 — only shown after store is fully loaded
  if (!task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p className="text-lg text-muted-foreground">This task seems to have wandered off…</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Today
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 md:p-6">
      <div className="mx-auto w-full max-w-3xl">
        {/* ── Back navigation ── */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground md:mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel}
        </button>

        {/* ── Title row: checkbox + title ── */}
        <div className="mb-1 flex items-start gap-3">
          {/* Completion checkbox — Things-style circle */}
          <button
            type="button"
            onClick={() => {
              void completeTask(task.id)
              navigate(-1)
            }}
            className="mt-1 flex-shrink-0 text-muted-foreground/50 transition-colors hover:text-primary"
            aria-label="Complete task"
          >
            <Circle className="h-6 w-6" strokeWidth={1.5} />
          </button>

          {/* Editable title */}
          <div className="min-w-0 flex-1">
            {isEditingTitle ? (
              <Input
                ref={titleRef}
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                className="h-auto border-none p-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
              />
            ) : (
              <h1
                className="cursor-text text-2xl font-semibold leading-tight"
                onClick={() => setIsEditingTitle(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setIsEditingTitle(true)
                }}
              >
                {task.title}
              </h1>
            )}
          </div>
        </div>

        {/* ── Source description (collapsible, above notes for integration tasks) ── */}
        {task.source_description && (
          <div className="mb-4 pl-9">
            <button
              type="button"
              onClick={() => setSourceDescOpen(!sourceDescOpen)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {sourceDescOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {(() => {
                const Icon = task.source !== "manual" ? PROVIDER_ICON_MAP[task.source] : null
                return Icon ? <Icon className="size-3.5" /> : null
              })()}
              Original from {SOURCE_LABELS[task.source] ?? task.source}
            </button>
            {sourceDescOpen && (
              <div className="mt-2 rounded-md border border-border/50 bg-muted/30 px-4 py-3">
                <MarkdownRenderer content={task.source_description} />
              </div>
            )}
          </div>
        )}

        {/* ── Seamless notes editor ── */}
        <div className="mb-6 pl-9">
          <TiptapEditor
            content={task.description}
            onChange={handleDescriptionChange}
          />
        </div>

        {/* ── Separator ── */}
        <div className="mb-5 ml-9 border-t border-border/50" />

        {/* ── Metadata row — clean pills ── */}
        <div className="mb-5 flex flex-wrap items-center gap-2 pl-9">
          {/* Bucket */}
          <Select
            value={task.bucket_id ?? ""}
            onValueChange={(val) => void moveToBucket(task.id, val)}
          >
            <SelectTrigger className="h-7 w-auto gap-1.5 rounded-full border-border/60 px-3 text-xs">
              <Folder className="h-3 w-3 text-muted-foreground" />
              <SelectValue placeholder="No bucket" />
            </SelectTrigger>
            <SelectContent>
              {buckets.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-xs">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Section */}
          <Select
            value={task.section}
            onValueChange={(val) => void moveToSection(task.id, val as SectionType)}
          >
            <SelectTrigger className="h-7 w-auto gap-1.5 rounded-full border-border/60 px-3 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["today", "sooner", "later"] as const).map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {SECTION_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Estimate — how long you think this task will take */}
          <div className="flex h-7 items-center gap-1.5 rounded-full border border-border/60 px-3" title="Focus estimate — how long you think this will take">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <input
              type="number"
              min={0}
              step={5}
              value={task.estimate_minutes ?? ""}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value, 10) : null
                void updateTask(task.id, { estimate_minutes: val })
              }}
              placeholder="Est."
              className="w-12 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
            <span className="text-[10px] text-muted-foreground">min</span>
          </div>

          {/* Source badge with provider icon */}
          {task.source !== "manual" && (
            <Badge variant="outline" className="h-7 gap-1.5 rounded-full border-border/60 px-3 text-[10px] font-normal">
              {(() => {
                const Icon = PROVIDER_ICON_MAP[task.source]
                return Icon ? <Icon className="size-3.5" /> : null
              })()}
              {SOURCE_LABELS[task.source] ?? task.source}
            </Badge>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="mb-6 flex items-center gap-2 pl-9">
          {isActiveInSession ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void stopSession()}
              className="gap-1.5 rounded-full border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <Square className="h-3.5 w-3.5" />
              Stop Focus
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                if (isRunning) {
                  void switchTask(task.id)
                } else {
                  void startSession(task.id)
                }
              }}
              className="gap-1.5 rounded-full"
            >
              <Play className="h-3.5 w-3.5" />
              {isRunning ? "Switch Focus" : "Start Focus"}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void archiveTask(task.id)
              navigate(-1)
            }}
            className="gap-1.5 rounded-full text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Archive
          </Button>
        </div>

        {/* ── Focus History ── */}
        <div className="pl-9">
          <TimeEntriesLog entries={timeEntries} isSessionActive={isActiveInSession} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Time entries sub-component
// ---------------------------------------------------------------------------

function TimeEntriesLog({
  entries,
  isSessionActive,
}: {
  entries: LocalTimeEntry[]
  isSessionActive: boolean
}) {
  const grouped = useMemo(() => {
    const groups = new Map<string, LocalTimeEntry[]>()
    for (const entry of entries) {
      const day = new Date(entry.started_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
      const list = groups.get(day) ?? []
      list.push(entry)
      groups.set(day, list)
    }
    return [...groups.entries()]
  }, [entries])

  if (entries.length === 0 && !isSessionActive) return null

  return (
    <div>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
        Focus History
      </p>
      <div className="space-y-3">
        {grouped.map(([day, dayEntries]) => (
          <div key={day}>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/50">
              {formatRelativeDay(day)}
            </p>
            <div className="space-y-0.5">
              {dayEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 rounded py-0.5 text-xs text-muted-foreground"
                >
                  <div className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    entry.ended_at ? "bg-muted-foreground/30" : "bg-primary animate-pulse",
                  )} />
                  <span>{formatTime(entry.started_at)}</span>
                  <span className="flex-1" />
                  <span className={cn("font-medium", !entry.ended_at && "text-primary")}>
                    {entry.ended_at
                      ? formatDuration(entry.duration_seconds ?? 0)
                      : "In progress…"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatRelativeDay(dayString: string): string {
  const date = new Date(dayString)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = today.getTime() - target.getTime()
  const dayMs = 86400000

  if (diff < dayMs) return "Today"
  if (diff < dayMs * 2) return "Yesterday"
  return dayString
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const remainMins = mins % 60
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`
}
