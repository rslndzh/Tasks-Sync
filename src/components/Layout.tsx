import { Link, Outlet, useLocation } from "react-router-dom"
import { Separator } from "@/components/ui/separator"
import { AlertCircle, CheckCircle2, Cloud, FolderClosed, FolderOpen, Inbox, Loader2, RefreshCw, Settings, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBucketStore } from "@/stores/useBucketStore"
import { useTaskStore } from "@/stores/useTaskStore"
import { useAuthStore } from "@/stores/useAuthStore"
import { useSyncStore } from "@/stores/useSyncStore"
import { syncNow } from "@/lib/sync"
import { CreateBucketDialog } from "@/components/CreateBucketDialog"
import { ShortcutHelp } from "@/components/ShortcutHelp"
import { SettingsDialog } from "@/components/SettingsDialog"
import { MiniTimer } from "@/components/MiniTimer"
import { RightRail } from "@/components/RightRail"
import { BottomNav } from "@/components/BottomNav"
import { OfflineBanner } from "@/components/OfflineBanner"
import { DndProvider } from "@/components/DndProvider"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { useTimerRestore } from "@/hooks/useTimerRestore"
import { useAutoSync } from "@/hooks/useAutoSync"
import { useSupabaseSync } from "@/hooks/useSupabaseSync"
import { useDroppable } from "@dnd-kit/core"
import { useSortable } from "@dnd-kit/sortable"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { DragData } from "@/lib/dnd-types"

/** Sidebar bucket item — sortable for reorder + droppable for task drops */
function SortableBucketItem({
  bucket,
  isActive,
  taskCount,
}: {
  bucket: { id: string; name: string; color: string | null; is_default: boolean }
  isActive: boolean
  taskCount: number
}) {
  const dragData: DragData = { type: "bucket", bucketId: bucket.id }

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: `bucket:${bucket.id}`,
    data: dragData,
  })

  const style = {
    transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null),
    transition,
  }

  const FolderIcon = isActive ? FolderOpen : FolderClosed

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md transition-all cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40 z-10",
        isOver && !isDragging && "ring-2 ring-primary/40 bg-accent/50",
      )}
      {...attributes}
      {...listeners}
    >
      <Link
        to={`/bucket/${bucket.id}`}
        className={cn(
          "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <FolderIcon
            className="size-4 shrink-0"
            style={bucket.color ? { color: bucket.color } : undefined}
          />
          <span className="truncate">{bucket.name}</span>
        </span>
        {taskCount > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">{taskCount}</span>
        )}
      </Link>
    </div>
  )
}

/** Inbox bucket — droppable only (not sortable — always pinned under Today) */
function DroppableInboxItem({
  bucket,
  isActive,
  taskCount,
}: {
  bucket: { id: string; name: string; color: string | null; is_default: boolean }
  isActive: boolean
  taskCount: number
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `bucket:${bucket.id}`,
    data: { type: "bucket", bucketId: bucket.id },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md transition-all",
        isOver && "ring-2 ring-primary/40 bg-accent/50",
      )}
    >
      <Link
        to={`/bucket/${bucket.id}`}
        className={cn(
          "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <span className="flex items-center gap-2">
          <Inbox className="size-4" />
          Inbox
        </span>
        {taskCount > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">{taskCount}</span>
        )}
      </Link>
    </div>
  )
}

/**
 * Main app layout: nav sidebar + content area + calendar rail slot.
 * Wrapped in DndProvider for global drag-and-drop context.
 */
export function Layout() {
  const location = useLocation()
  const { buckets } = useBucketStore()
  const tasks = useTaskStore((s) => s.tasks)
  const user = useAuthStore((s) => s.user)
  const syncStatus = useSyncStore((s) => s.status)
  const syncError = useSyncStore((s) => s.error)
  const todayCount = tasks.filter((t) => t.section === "today").length

  // Initialize global keyboard shortcuts, timer restore, integration sync, Supabase sync
  useKeyboardShortcuts()
  useTimerRestore()
  useAutoSync()
  useSupabaseSync()

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      <OfflineBanner />
      <DndProvider>
      <div className="flex min-h-0 flex-1">
      {/* Sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-border md:flex md:flex-col">
        {/* Branding */}
        <div className="p-4 pb-2">
          <h1 className="text-xl font-bold tracking-tight">Flowpin</h1>
          <p className="text-xs text-muted-foreground">Focus. Triage. Flow.</p>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col px-2">
          {/* Today — pinned smart list */}
          <Link
            to="/"
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
              location.pathname === "/"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-2">
              <Sun className="size-4" />
              Today
            </span>
            {todayCount > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground">{todayCount}</span>
            )}
          </Link>

          {/* Inbox — pinned right below Today, droppable but not sortable */}
          {(() => {
            const inbox = buckets.find((b) => b.is_default)
            if (!inbox) return null
            const inboxActive = location.pathname === `/bucket/${inbox.id}`
            const inboxCount = tasks.filter((t) => t.bucket_id === inbox.id).length
            return (
              <DroppableInboxItem
                bucket={inbox}
                isActive={inboxActive}
                taskCount={inboxCount}
              />
            )
          })()}

          <Separator className="my-2" />

          {/* Bucket list — non-default buckets, sortable for reorder + droppable for task drops */}
          <span className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Buckets
          </span>
          <SortableContext
            items={buckets.filter((b) => !b.is_default).map((b) => `bucket:${b.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-0.5">
              {buckets.filter((b) => !b.is_default).map((bucket) => {
                const isActive = location.pathname === `/bucket/${bucket.id}`
                const taskCount = tasks.filter((t) => t.bucket_id === bucket.id).length
                return (
                  <SortableBucketItem
                    key={bucket.id}
                    bucket={bucket}
                    isActive={isActive}
                    taskCount={taskCount}
                  />
                )
              })}
            </div>
          </SortableContext>

          {/* New bucket button + dialog */}
          <CreateBucketDialog />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Bottom links */}
          <Separator className="my-2" />
          {!user ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("flowpin:show-settings", { detail: { tab: "account" } }))}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Cloud className="size-3.5" />
              Sync across devices
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (syncStatus === "error") {
                  window.dispatchEvent(new CustomEvent("flowpin:show-settings", { detail: { tab: "account" } }))
                } else {
                  void syncNow()
                }
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors hover:bg-accent hover:text-foreground",
                syncStatus === "error" ? "text-destructive" : "text-muted-foreground",
              )}
              title={syncError ?? (syncStatus === "syncing" ? "Syncing..." : "Sync now")}
            >
              {syncStatus === "syncing" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : syncStatus === "error" ? (
                <AlertCircle className="size-3.5" />
              ) : syncStatus === "synced" ? (
                <CheckCircle2 className="size-3.5 text-green-500" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {syncStatus === "syncing"
                ? "Syncing..."
                : syncStatus === "error"
                  ? "Sync issue"
                  : syncStatus === "synced"
                    ? "Synced"
                    : "Sync now"}
            </button>
          )}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("flowpin:show-settings"))}
            className="mb-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Settings className="size-4" />
            Settings
          </button>
        </nav>
      </aside>

      {/* Main content area + mini timer */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden pb-14 md:pb-0">
          <Outlet />
        </main>
        <MiniTimer />
      </div>

      {/* Right rail — icon bar + switchable panel */}
      <RightRail />

      {/* Global overlays */}
      <ShortcutHelp />
      <SettingsDialog />
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav />
      </DndProvider>
    </div>
  )
}
