import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleStop,
  Clock3,
  Folder,
  Play,
  Sparkles,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TiptapEditor } from "@/components/TiptapEditor"
import { MarkdownRenderer } from "@/components/MarkdownRenderer"
import { PROVIDER_ICON_MAP } from "@/components/icons/ProviderIcons"
import { formatReadableDuration } from "@/components/Timer"
import { useActiveTimerModel } from "@/hooks/useActiveTimerModel"
import { useEstimateSuggestion } from "@/hooks/useEstimateSuggestion"
import { db } from "@/lib/db"
import { openEstimateDialog } from "@/lib/estimate-dialog"
import { isInputFocused } from "@/lib/shortcuts"
import { cn } from "@/lib/utils"
import { useBucketStore } from "@/stores/useBucketStore"
import { useSessionStore } from "@/stores/useSessionStore"
import { useTaskStore } from "@/stores/useTaskStore"
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
  const location = useLocation()

  const tasks = useTaskStore((s) => s.tasks)
  const isLoaded = useTaskStore((s) => s.isLoaded)
  const updateTask = useTaskStore((s) => s.updateTask)
  const completeTask = useTaskStore((s) => s.completeTask)
  const archiveTask = useTaskStore((s) => s.archiveTask)
  const moveToSection = useTaskStore((s) => s.moveToSection)
  const moveToBucket = useTaskStore((s) => s.moveToBucket)
  const buckets = useBucketStore((s) => s.buckets)

  const { isRunning, activeTaskId, startSession, switchTask, stopSession } = useSessionStore()
  const activeTimeEntryId = useSessionStore((s) => s.activeTimeEntry?.id ?? null)
  const timer = useActiveTimerModel()
  const suggestion = useEstimateSuggestion(taskId ?? "")

  const fromPath = (location.state as { from?: string } | null)?.from
  const task = tasks.find((t) => t.id === taskId)
  const isActiveInSession = isRunning && activeTaskId === taskId

  const backLabel = useMemo(() => {
    if (!fromPath) return "Back"
    if (fromPath === "/") return "Today"
    if (fromPath === "/inbox") return "Inbox"
    const bucketMatch = fromPath.match(/^\/bucket\/(.+)$/)
    if (bucketMatch) {
      const fromBucket = buckets.find((b) => b.id === bucketMatch[1])
      return fromBucket?.name ?? "Back"
    }
    return "Back"
  }, [fromPath, buckets])

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(task?.title ?? "")
  const [sourceDescOpen, setSourceDescOpen] = useState(false)
  const [timeEntries, setTimeEntries] = useState<LocalTimeEntry[]>([])
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditingTitle && titleRef.current) {
      titleRef.current.focus()
      titleRef.current.select()
    }
  }, [isEditingTitle])

  useEffect(() => {
    if (task) setTitleValue(task.title)
  }, [task?.title])

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
    const currentTaskId = task?.id
    if (!currentTaskId) return
    const shortcutTaskId: string = currentTaskId
    function handleKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if (isInputFocused()) return
      if (e.key.length === 1 && e.key.toLowerCase() === "e") {
        e.preventDefault()
        openEstimateDialog([shortcutTaskId])
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [task?.id])

  useEffect(() => {
    if (!taskId) return
    let cancelled = false
    void db.timeEntries
      .where("task_id")
      .equals(taskId)
      .toArray()
      .then((entries) => {
        if (cancelled) return
        setTimeEntries(entries.sort((a, b) => b.started_at.localeCompare(a.started_at)))
      })
    return () => {
      cancelled = true
    }
  }, [taskId, isRunning, activeTaskId, activeTimeEntryId])

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

  const totalTrackedSeconds = useMemo(
    () => timeEntries.reduce((sum, entry) => sum + (entry.duration_seconds ?? 0), 0),
    [timeEntries],
  )

  if (!isLoaded) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="animate-pulse text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

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

  const hasEstimate = task.estimate_minutes != null && task.estimate_minutes > 0
  const showSuggestion = !hasEstimate && suggestion.suggestedMinutes != null && suggestion.sampleCount >= 2
  const estimateSeconds = hasEstimate ? task.estimate_minutes! * 60 : null
  const spentSeconds = isActiveInSession ? timer.activeTaskTrackedSeconds : totalTrackedSeconds
  const progressRatio = estimateSeconds != null ? Math.min(1, spentSeconds / estimateSeconds) : null
  const paceState = isActiveInSession
    ? timer.paceState
    : (estimateSeconds == null ? "none" : (spentSeconds > estimateSeconds ? "over" : "on_pace"))
  const paceDeltaSeconds = estimateSeconds == null
    ? null
    : (isActiveInSession
      ? timer.paceDeltaSeconds
      : Math.abs(spentSeconds - estimateSeconds))

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 md:p-6">
      <div className="mx-auto w-full max-w-6xl">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground md:mb-5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel}
        </button>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
          <section className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm backdrop-blur-sm sm:p-5 lg:p-6">
            <div className="mb-1 flex items-start gap-3">
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
                    className="cursor-text text-2xl font-semibold leading-tight md:text-3xl"
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

            {task.source_description && (
              <div className="mb-5 pl-9">
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
                  <div className="mt-2 rounded-lg border border-border/60 bg-muted/35 px-4 py-3">
                    <MarkdownRenderer content={task.source_description} />
                  </div>
                )}
              </div>
            )}

            <div className="pl-9">
              <TiptapEditor content={task.description} onChange={handleDescriptionChange} />
            </div>

            <div className="mt-5 border-t border-border/65 pt-5">
              <div className="flex flex-wrap items-center gap-2 pl-9">
                <Select value={task.bucket_id ?? ""} onValueChange={(val) => void moveToBucket(task.id, val)}>
                  <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full border-border/70 bg-background/70 px-3 text-xs">
                    <Folder className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="No bucket" />
                  </SelectTrigger>
                  <SelectContent>
                    {buckets.map((bucket) => (
                      <SelectItem key={bucket.id} value={bucket.id} className="text-xs">
                        {bucket.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={task.section} onValueChange={(val) => void moveToSection(task.id, val as SectionType)}>
                  <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full border-border/70 bg-background/70 px-3 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["today", "sooner", "later"] as const).map((section) => (
                      <SelectItem key={section} value={section} className="text-xs">
                        {SECTION_LABELS[section]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <button
                  type="button"
                  onClick={() => openEstimateDialog([task.id])}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
                    hasEstimate
                      ? "border-primary/45 bg-primary/[0.09] text-primary hover:bg-primary/[0.13]"
                      : "border-border/70 bg-background/70 text-muted-foreground hover:text-foreground",
                  )}
                  title="Set estimate"
                >
                  <Clock3 className="h-3 w-3" />
                  {hasEstimate ? `${task.estimate_minutes} min` : "Estimate"}
                </button>

                {task.source !== "manual" && (
                  <Badge variant="outline" className="h-8 gap-1.5 rounded-full border-border/70 px-3 text-[10px] font-medium">
                    {(() => {
                      const Icon = PROVIDER_ICON_MAP[task.source]
                      return Icon ? <Icon className="size-3.5" /> : null
                    })()}
                    {SOURCE_LABELS[task.source] ?? task.source}
                  </Badge>
                )}
              </div>

              {showSuggestion && (
                <div className="mt-3 flex flex-wrap items-center gap-2 pl-9">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 rounded-full text-xs"
                    onClick={() => {
                      if (!suggestion.suggestedMinutes) return
                      void updateTask(task.id, { estimate_minutes: suggestion.suggestedMinutes })
                    }}
                  >
                    <Sparkles className="size-3.5" />
                    Use {suggestion.suggestedMinutes}m
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Suggested from last {suggestion.sampleCount} {suggestion.source === "task" ? "sessions on this task" : "sessions in this bucket"}.
                  </span>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2 pl-9">
                {isActiveInSession ? (
                  <Badge
                    variant="outline"
                    className="h-8 gap-1.5 rounded-full border-primary/40 bg-primary/[0.08] px-3 text-xs font-medium text-primary"
                  >
                    <span className="inline-flex size-1.5 rounded-full bg-primary" />
                    Focusing now
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 rounded-full"
                    onClick={() => {
                      if (isRunning) {
                        void switchTask(task.id)
                      } else {
                        void startSession(task.id)
                      }
                    }}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {isRunning ? "Switch Focus Here" : "Start Focus"}
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void archiveTask(task.id)
                    navigate(-1)
                  }}
                  className="h-8 gap-1.5 rounded-full text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Archive
                </Button>
              </div>
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <FocusPanel
              isRunning={isRunning}
              isActiveInSession={isActiveInSession}
              sessionSeconds={timer.sessionDisplaySeconds}
              spentSeconds={spentSeconds}
              estimateSeconds={estimateSeconds}
              progressRatio={progressRatio}
              paceState={paceState}
              paceDeltaSeconds={paceDeltaSeconds}
              onStartOrSwitch={() => {
                if (isRunning) {
                  void switchTask(task.id)
                } else {
                  void startSession(task.id)
                }
              }}
              onStop={() => { void stopSession() }}
            />
            <TimeEntriesLog entries={timeEntries} isSessionActive={isActiveInSession} />
          </aside>
        </div>
      </div>
    </div>
  )
}

function FocusPanel({
  isRunning,
  isActiveInSession,
  sessionSeconds,
  spentSeconds,
  estimateSeconds,
  progressRatio,
  paceState,
  paceDeltaSeconds,
  onStartOrSwitch,
  onStop,
}: {
  isRunning: boolean
  isActiveInSession: boolean
  sessionSeconds: number
  spentSeconds: number
  estimateSeconds: number | null
  progressRatio: number | null
  paceState: "none" | "on_pace" | "over"
  paceDeltaSeconds: number | null
  onStartOrSwitch: () => void
  onStop: () => void
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card/75 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Focus</p>
        <Badge
          variant="outline"
          className={cn(
            "h-6 rounded-full px-2 text-[10px]",
            isActiveInSession && "border-primary/40 bg-primary/[0.08] text-primary",
          )}
        >
          {isActiveInSession ? "Focusing" : (isRunning ? "Other task" : "Idle")}
        </Badge>
      </div>

      <div className="mt-3 rounded-xl border border-border/60 bg-background/50 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Session</p>
        <p className="mt-1 text-xl font-semibold leading-none text-foreground">
          {isActiveInSession ? formatReadableDuration(sessionSeconds) : "Not active"}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Spent / Estimate</span>
        <span className="font-medium text-foreground">
          {formatReadableDuration(spentSeconds)}
          {estimateSeconds != null ? ` / ${formatReadableDuration(estimateSeconds)}` : " / —"}
        </span>
      </div>

      {estimateSeconds != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-all duration-150 ease-out",
              paceState === "over" ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${Math.max(4, Math.round((progressRatio ?? 0) * 100))}%` }}
          />
        </div>
      )}

      <p
        className={cn(
          "mt-2 text-xs",
          paceState === "over" ? "text-amber-500" : "text-muted-foreground",
        )}
      >
        {paceState === "none" && "No estimate"}
        {paceState === "on_pace" && "On pace"}
        {paceState === "over" && `+${formatReadableDuration(paceDeltaSeconds ?? 0)} over`}
      </p>

      <div className="mt-4">
        {isActiveInSession ? (
          <Button
            variant="outline"
            className="h-8 w-full gap-1.5 rounded-full border-destructive/35 text-destructive hover:bg-destructive/10"
            onClick={onStop}
          >
            <CircleStop className="size-3.5" />
            Stop
          </Button>
        ) : (
          <Button className="h-8 w-full gap-1.5 rounded-full" onClick={onStartOrSwitch}>
            <Play className="size-3.5" />
            {isRunning ? "Switch Focus Here" : "Start Focus"}
          </Button>
        )}
      </div>
    </section>
  )
}

function TimeEntriesLog({
  entries,
  isSessionActive,
}: {
  entries: LocalTimeEntry[]
  isSessionActive: boolean
}) {
  const grouped = useMemo(() => {
    const groups = new Map<string, { label: string; date: Date; entries: LocalTimeEntry[] }>()
    for (const entry of entries) {
      const started = new Date(entry.started_at)
      const date = new Date(started.getFullYear(), started.getMonth(), started.getDate())
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      const existing = groups.get(key)
      if (existing) {
        existing.entries.push(entry)
      } else {
        groups.set(key, {
          label: date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          date,
          entries: [entry],
        })
      }
    }

    return [...groups.values()]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((group) => ({
        ...group,
        entries: group.entries.sort((a, b) => b.started_at.localeCompare(a.started_at)),
      }))
  }, [entries])

  return (
    <section className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm backdrop-blur-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Focus history</p>

      {grouped.length === 0 && !isSessionActive ? (
        <p className="mt-3 text-sm text-muted-foreground">No focus sessions yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {grouped.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/70">
                {formatRelativeDay(group.date, group.label)}
              </p>
              <div className="space-y-1.5">
                {group.entries.map((entry) => {
                  const active = !entry.ended_at
                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
                        active
                          ? "border-primary/40 bg-primary/[0.08] text-foreground"
                          : "border-border/45 bg-background/50 text-muted-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex size-1.5 rounded-full",
                          active ? "animate-pulse bg-primary" : "bg-muted-foreground/40",
                        )}
                      />
                      <span>{formatTime(entry.started_at)}</span>
                      <span className="ml-auto font-medium">
                        {active ? "In progress…" : formatReadableDuration(entry.duration_seconds ?? 0)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function formatRelativeDay(dayDate: Date, fallbackLabel: string): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = today.getTime() - dayDate.getTime()
  const dayMs = 24 * 60 * 60 * 1000

  if (diff < dayMs) return "Today"
  if (diff < dayMs * 2) return "Yesterday"
  return fallbackLabel
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}
