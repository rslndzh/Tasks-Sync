import { useMemo, useState } from "react"
import { useConnectionStore } from "@/stores/useConnectionStore"
import { InboxItemCard } from "@/components/InboxItemCard"
import { RefreshCw, Download, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBucketStore } from "@/stores/useBucketStore"
import { useTaskStore } from "@/stores/useTaskStore"
import { cn } from "@/lib/utils"
import type { InboxItem } from "@/types/inbox"

interface IntegrationInboxPanelProps {
  connectionId: string
}

// ─── Grouping helpers ───

interface ItemGroup {
  key: string
  label: string
  items: InboxItem[]
}

/** Group inbox items by project/team based on provider type */
function groupItems(items: InboxItem[]): ItemGroup[] {
  const groups = new Map<string, InboxItem[]>()

  for (const item of items) {
    const meta = item.metadata as Record<string, unknown>
    let key: string

    if (item.sourceType === "linear") {
      // Group by project; fall back to "no-project" for unassigned
      key = (meta.projectId as string) ?? "__no_project__"
    } else if (item.sourceType === "todoist") {
      key = (meta.projectId as string) ?? "inbox"
    } else {
      key = "all"
    }

    const existing = groups.get(key) ?? []
    existing.push(item)
    groups.set(key, existing)
  }

  return Array.from(groups.entries())
    .map(([key, groupItems]) => ({
      key,
      label: extractGroupLabel(groupItems[0]!) ?? (key === "__no_project__" ? "No Project" : key),
      items: groupItems,
    }))
    .sort((a, b) => {
      // No-project / Inbox goes to the top
      if (a.key === "__no_project__" || a.key === "inbox") return -1
      if (b.key === "__no_project__" || b.key === "inbox") return 1
      return a.label.localeCompare(b.label)
    })
}

function extractGroupLabel(item: InboxItem): string | null {
  const meta = item.metadata as Record<string, unknown>
  if (item.sourceType === "linear") return (meta.projectName as string) ?? null
  if (item.sourceType === "todoist") return (meta.projectName as string) ?? null
  return null
}

// ─── Collapsible group component ───

function ItemGroup({
  group,
  connectionId,
  onImport,
  defaultCollapsed,
}: {
  group: ItemGroup
  connectionId: string
  onImport: (item: InboxItem, bucketId: string, section: "today" | "sooner" | "later") => void
  defaultCollapsed: boolean
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-1.5 py-1 text-left"
      >
        {collapsed ? (
          <ChevronRight className="size-3 text-muted-foreground/60" />
        ) : (
          <ChevronDown className="size-3 text-muted-foreground/60" />
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          {group.label}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/50">
          {group.items.length}
        </span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-0.5 pb-1">
          {group.items.map((item) => (
            <InboxItemCard
              key={item.id}
              item={item}
              connectionId={connectionId}
              onImport={(bucketId, section) => onImport(item, bucketId, section)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main panel component ───

/**
 * Inbox panel for a single integration connection.
 * Shows synced items grouped by team/project with visual triage controls.
 */
export function IntegrationInboxPanel({ connectionId }: IntegrationInboxPanelProps) {
  const connections = useConnectionStore((s) => s.connections)
  const inboxItems = useConnectionStore((s) => s.inboxItems)
  const syncConnection = useConnectionStore((s) => s.syncConnection)
  const importItem = useConnectionStore((s) => s.importItem)
  const getSyncState = useConnectionStore((s) => s.getSyncState)
  const loadTasks = useTaskStore((s) => s.loadTasks)
  const buckets = useBucketStore((s) => s.buckets)

  const conn = connections.find((c) => c.id === connectionId)
  if (!conn) return null

  const items = inboxItems.get(connectionId) ?? []
  const syncState = getSyncState(connectionId)
  const defaultBucket = buckets.find((b) => b.is_default) ?? buckets[0]

  const groups = useMemo(() => groupItems(items), [items])
  const hasMultipleGroups = groups.length > 1

  const handleSync = () => {
    void syncConnection(connectionId)
  }

  const handleImportAll = async () => {
    if (!defaultBucket) return
    for (const item of items) {
      await importItem(connectionId, item, defaultBucket.id, "sooner")
    }
    void loadTasks()
  }

  const handleImportItem = (item: InboxItem, bucketId: string, section: "today" | "sooner" | "later") => {
    void importItem(connectionId, item, bucketId, section).then(() => loadTasks())
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold">{conn.label}</p>
          {syncState.lastSyncedAt && (
            <p className="text-[9px] tabular-nums text-muted-foreground/60">
              {new Date(syncState.lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          )}
        </div>
        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={handleSync}
            disabled={syncState.isSyncing}
            aria-label="Sync now"
            title="Sync now"
          >
            <RefreshCw className={cn("size-3", syncState.isSyncing && "animate-spin")} />
          </Button>
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => void handleImportAll()}
              aria-label="Import all"
              title="Import all to default bucket"
            >
              <Download className="size-3" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Error state ── */}
      {syncState.error && (
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
          {syncState.error}
        </p>
      )}

      {/* ── Triage count badge ── */}
      {items.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
            {items.length}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {items.length === 1 ? "task" : "tasks"} to triage
          </span>
        </div>
      )}

      {/* ── Loading state ── */}
      {syncState.isSyncing && items.length === 0 && (
        <div className="flex items-center justify-center py-6">
          <RefreshCw className="size-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Empty state ── */}
      {!syncState.isSyncing && items.length === 0 && (
        <p className="py-4 text-center text-[10px] text-muted-foreground">
          All caught up. Nice.
        </p>
      )}

      {/* ── Items — grouped or flat ── */}
      {items.length > 0 && (
        <div className="flex flex-col gap-1">
          {hasMultipleGroups ? (
            groups.map((group) => (
              <ItemGroup
                key={group.key}
                group={group}
                connectionId={connectionId}
                onImport={handleImportItem}
                defaultCollapsed={false}
              />
            ))
          ) : (
            /* Single group — no header needed, render flat */
            items.map((item) => (
              <InboxItemCard
                key={item.id}
                item={item}
                connectionId={connectionId}
                onImport={(bucketId, section) => handleImportItem(item, bucketId, section)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
