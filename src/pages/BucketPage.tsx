import { useState, useRef, useEffect, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Inbox, FolderOpen, MoreHorizontal, Pencil, Palette, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SectionColumn } from "@/components/SectionColumn"
import { useBucketStore } from "@/stores/useBucketStore"
import { useTaskStore } from "@/stores/useTaskStore"

const BUCKET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
] as const

/**
 * Single-bucket view with vertically stacked Today / Sooner / Later sections.
 * Route: /bucket/:bucketId
 */
export function BucketPage() {
  const { bucketId } = useParams<{ bucketId: string }>()
  const navigate = useNavigate()
  const bucket = useBucketStore((s) => s.getBucket(bucketId ?? ""))
  const isBucketsLoaded = useBucketStore((s) => s.isLoaded)
  const { updateBucket, deleteBucket } = useBucketStore()
  const tasks = useTaskStore((s) => s.tasks)
  const clearSelection = useTaskStore((s) => s.clearSelection)

  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [isEditing])

  // Wait for buckets to load from Dexie before deciding "not found"
  if (!isBucketsLoaded) {
    return null
  }

  if (!bucketId || !bucket) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Bucket not found.</p>
      </div>
    )
  }

  const bucketTasks = tasks.filter((t) => t.bucket_id === bucketId).sort((a, b) => a.position - b.position)
  const todayTasks = bucketTasks.filter((t) => t.section === "today")
  const soonerTasks = bucketTasks.filter((t) => t.section === "sooner")
  const laterTasks = bucketTasks.filter((t) => t.section === "later")
  const totalTasks = bucketTasks.length

  function handleStartEdit() {
    setEditName(bucket!.name)
    setIsEditing(true)
  }

  function handleSaveName() {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== bucket!.name) {
      void updateBucket(bucket!.id, { name: trimmed })
    }
    setIsEditing(false)
  }

  async function handleDelete() {
    if (totalTasks > 0) {
      const confirm = window.confirm(
        `"${bucket!.name}" has ${totalTasks} task(s). They'll be moved to Inbox. Continue?`,
      )
      if (!confirm) return
    }
    await deleteBucket(bucket!.id)
    navigate("/")
  }

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) clearSelection()
  }, [clearSelection])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 md:p-6" onClick={handleBackgroundClick}>
      <div className="mx-auto w-full max-w-3xl">
        {/* Bucket header */}
        <div className="mb-4 flex items-center gap-2 md:mb-6 md:gap-3">
          <div
            className="flex size-8 items-center justify-center rounded-full md:size-10"
            style={{
              backgroundColor: bucket.color ? `${bucket.color}20` : "var(--primary-10, hsl(var(--primary) / 0.1))",
            }}
          >
            {bucket.is_default ? (
              <Inbox className="size-4 text-primary md:size-5" />
            ) : (
              <FolderOpen
                className="size-4 md:size-5"
                style={bucket.color ? { color: bucket.color } : undefined}
              />
            )}
          </div>
          <div className="flex-1">
            {isEditing ? (
              <Input
                ref={nameInputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName()
                  if (e.key === "Escape") setIsEditing(false)
                }}
                className="h-auto border-none p-0 text-2xl font-bold tracking-tight shadow-none focus-visible:ring-0"
              />
            ) : (
              <div className="flex items-baseline gap-2">
                <h1 className="text-xl font-bold tracking-tight md:text-2xl">{bucket.name}</h1>
                {totalTasks > 0 && (
                  <span className="text-sm text-muted-foreground/50">{totalTasks}</span>
                )}
              </div>
            )}
            {bucket.is_default && (
              <p className="text-sm text-muted-foreground">
                Your default bucket. New tasks land here.
              </p>
            )}
          </div>

          {/* Bucket actions dropdown */}
          {!bucket.is_default && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleStartEdit}>
                  <Pencil className="mr-2 size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Palette className="mr-2 size-4" />
                    Color
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <div className="grid grid-cols-5 gap-1 p-2">
                      <button
                        type="button"
                        className="flex size-6 items-center justify-center rounded border border-border text-[10px] text-muted-foreground hover:bg-accent"
                        onClick={() => void updateBucket(bucket!.id, { color: null })}
                        title="Remove color"
                      >
                        ✕
                      </button>
                      {BUCKET_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className="size-6 rounded border-2 transition-transform hover:scale-110"
                          style={{
                            backgroundColor: color,
                            borderColor: bucket!.color === color ? "white" : color,
                            boxShadow: bucket!.color === color ? `0 0 0 2px ${color}` : undefined,
                          }}
                          onClick={() => void updateBucket(bucket!.id, { color })}
                          title={color}
                        />
                      ))}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem
                  onClick={() => void handleDelete()}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Vertically stacked sections */}
        <div className="space-y-2">
          <SectionColumn
            title="Today"
            section="today"
            bucketId={bucketId}
            tasks={todayTasks}
            emptyText="Nothing for today. Drag tasks here or enjoy the calm."
          />
          <SectionColumn
            title="Sooner"
            section="sooner"
            bucketId={bucketId}
            tasks={soonerTasks}
            emptyText="Sooner is clear. Zen or denial — you decide."
          />
          <SectionColumn
            title="Later"
            section="later"
            bucketId={bucketId}
            tasks={laterTasks}
            emptyText="Nothing for later. You're brave."
            defaultCollapsed
          />
        </div>
      </div>
    </div>
  )
}
