import { create } from "zustand"
import { db } from "@/lib/db"
import { getCurrentUserId } from "@/lib/auth"
import type { IntegrationConnection } from "@/types/local"
import type { IntegrationType } from "@/types/database"
import type { InboxItem } from "@/types/inbox"
import { mapInboxItemToLocalTask } from "@/types/inbox"
import { validateApiKey as validateLinearKey, fetchTeams, fetchAssignedIssues, DEFAULT_LINEAR_STATE_FILTER } from "@/integrations/linear"
import type { LinearStateType } from "@/integrations/linear"
import { mapLinearIssueToInboxItem } from "@/integrations/linear-mapper"
import { validateApiToken as validateTodoistToken, fetchActiveTasks as fetchTodoistTasks, fetchProjects as fetchTodoistProjects, mapTodoistTaskToInboxItem } from "@/integrations/todoist"
import { validateApiKey as validateAttioKey, fetchTasks as fetchAttioTasks, mapAttioTaskToInboxItem } from "@/integrations/attio"
import { useTaskStore } from "@/stores/useTaskStore"

// ============================================================================
// Per-connection sync state
// ============================================================================

export interface ConnectionSyncState {
  isSyncing: boolean
  lastSyncedAt: number | null
  error: string | null
}

// ============================================================================
// Store shape
// ============================================================================

interface ConnectionState {
  connections: IntegrationConnection[]
  isLoaded: boolean

  /** Per-connection sync status */
  syncStates: Map<string, ConnectionSyncState>

  /** Per-connection fetched inbox items (not yet imported) */
  inboxItems: Map<string, InboxItem[]>

  // ---- Lifecycle ----
  loadConnections: () => Promise<void>

  // ---- CRUD ----
  addConnection: (type: IntegrationType, apiKey: string, label: string) => Promise<IntegrationConnection>
  removeConnection: (id: string) => Promise<void>
  updateConnection: (id: string, updates: Partial<Pick<IntegrationConnection, "label" | "apiKey" | "isActive" | "metadata" | "defaultBucketId" | "defaultSection" | "autoImport">>) => Promise<void>

  // ---- Sync ----
  syncConnection: (id: string) => Promise<void>
  syncAll: () => Promise<void>

  // ---- Import ----
  importItem: (connectionId: string, item: InboxItem, bucketId: string, section: "today" | "sooner" | "later", insertPosition?: number) => Promise<void>

  // ---- Selectors ----
  getConnectionsByType: (type: IntegrationType) => IntegrationConnection[]
  getInboxCount: (connectionId: string) => number
  getTotalInboxCount: () => number
  getSyncState: (connectionId: string) => ConnectionSyncState
}

const DEFAULT_SYNC: ConnectionSyncState = { isSyncing: false, lastSyncedAt: null, error: null }

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: [],
  isLoaded: false,
  syncStates: new Map(),
  inboxItems: new Map(),

  // =========================================================================
  // Lifecycle
  // =========================================================================

  loadConnections: async () => {
    const raw = await db.connections.toArray()
    // Backfill default-mapping fields for connections created before this feature
    const connections = raw.map((c) => ({
      ...c,
      defaultBucketId: c.defaultBucketId ?? null,
      defaultSection: c.defaultSection ?? null,
      autoImport: c.autoImport ?? false,
    }))
    set({ connections, isLoaded: true })
  },

  // =========================================================================
  // CRUD
  // =========================================================================

  addConnection: async (type, apiKey, label) => {
    const conn: IntegrationConnection = {
      id: crypto.randomUUID(),
      type,
      label,
      apiKey,
      metadata: {},
      isActive: true,
      created_at: new Date().toISOString(),
      defaultBucketId: null,
      defaultSection: null,
      autoImport: false,
    }
    await db.connections.put(conn)
    set((s) => ({ connections: [...s.connections, conn] }))
    return conn
  },

  removeConnection: async (id) => {
    await db.connections.delete(id)
    set((s) => {
      const next = new Map(s.inboxItems)
      next.delete(id)
      const syncNext = new Map(s.syncStates)
      syncNext.delete(id)
      return {
        connections: s.connections.filter((c) => c.id !== id),
        inboxItems: next,
        syncStates: syncNext,
      }
    })
  },

  updateConnection: async (id, updates) => {
    await db.connections.update(id, updates)
    set((s) => ({
      connections: s.connections.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    }))
  },

  // =========================================================================
  // Sync
  // =========================================================================

  syncConnection: async (id) => {
    const conn = get().connections.find((c) => c.id === id)
    if (!conn || !conn.isActive) return

    // Set syncing state
    set((s) => {
      const next = new Map(s.syncStates)
      next.set(id, { isSyncing: true, lastSyncedAt: null, error: null })
      return { syncStates: next }
    })

    try {
      let items: InboxItem[] = []

      if (conn.type === "linear") {
        items = await syncLinearConnection(conn)
      } else if (conn.type === "todoist") {
        items = await syncTodoistConnection(conn)
      } else if (conn.type === "attio") {
        items = await syncAttioConnection(conn)
      }

      // Filter out already-imported items (dedup by source + source_id)
      const existingSourceIds = new Set(
        (await db.tasks.where("source").equals(conn.type).toArray()).map(
          (t) => t.source_id,
        ),
      )
      const newItems = items.filter((i) => !existingSourceIds.has(i.sourceId))

      // Auto-import: if this connection has default mapping enabled, import matching items
      const autoImportedIds = new Set<string>()
      if (conn.autoImport && conn.defaultBucketId) {
        const section = conn.defaultSection ?? "sooner"
        // Load import rules once, outside the loop
        const importRules = await db.importRules.where("integration_type").equals(conn.type).toArray()
        const activeRules = importRules.filter((r) => r.is_active)

        for (const item of newItems) {
          // Use the specific rule's bucket/section if one matches, otherwise default mapping
          const matchedRule = activeRules.find((r) => matchItemToRule(item, r))
          const targetBucketId = matchedRule ? matchedRule.target_bucket_id : conn.defaultBucketId
          const targetSection = matchedRule ? matchedRule.target_section : section

          const userId = getCurrentUserId()
          const position = await db.tasks
            .where("[user_id+bucket_id]")
            .equals([userId, targetBucketId])
            .count()

          const task = mapInboxItemToLocalTask(item, userId, targetBucketId, targetSection, position)
          await db.tasks.put(task)
          autoImportedIds.add(item.id)
        }
      }

      // Refresh the task store so auto-imported tasks appear in the UI
      if (autoImportedIds.size > 0) {
        void useTaskStore.getState().loadTasks()
      }

      // Items that weren't auto-imported go to the inbox
      const remainingItems = newItems.filter((i) => !autoImportedIds.has(i.id))

      set((s) => {
        const inboxNext = new Map(s.inboxItems)
        inboxNext.set(id, remainingItems)
        const syncNext = new Map(s.syncStates)
        syncNext.set(id, { isSyncing: false, lastSyncedAt: Date.now(), error: null })
        return { inboxItems: inboxNext, syncStates: syncNext }
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed. Try again."
      set((s) => {
        const syncNext = new Map(s.syncStates)
        syncNext.set(id, { isSyncing: false, lastSyncedAt: s.syncStates.get(id)?.lastSyncedAt ?? null, error: message })
        return { syncStates: syncNext }
      })
    }
  },

  syncAll: async () => {
    const { connections, syncConnection } = get()
    const active = connections.filter((c) => c.isActive)
    // Sync sequentially per provider type to respect rate limits
    for (const conn of active) {
      await syncConnection(conn.id)
    }
  },

  // =========================================================================
  // Import
  // =========================================================================

  importItem: async (connectionId, item, bucketId, section, insertPosition) => {
    // Check for duplicates
    const existing = await db.tasks
      .where("source_id")
      .equals(item.sourceId)
      .toArray()
    if (existing.length > 0) return

    const userId = getCurrentUserId()

    if (insertPosition != null) {
      // Shift tasks at or after the insert position down by 1
      const tasksToShift = await db.tasks
        .where("[user_id+bucket_id]")
        .equals([userId, bucketId])
        .filter((t) => t.section === section && t.position >= insertPosition)
        .toArray()
      await Promise.all(
        tasksToShift.map((t) => db.tasks.update(t.id, { position: t.position + 1 })),
      )
    }

    const position = insertPosition ?? await db.tasks
      .where("[user_id+bucket_id]")
      .equals([userId, bucketId])
      .count()

    const task = mapInboxItemToLocalTask(item, userId, bucketId, section, position)
    await db.tasks.put(task)

    // Remove from inbox
    set((s) => {
      const inboxNext = new Map(s.inboxItems)
      const current = inboxNext.get(connectionId) ?? []
      inboxNext.set(connectionId, current.filter((i) => i.id !== item.id))
      return { inboxItems: inboxNext }
    })
  },

  // =========================================================================
  // Selectors
  // =========================================================================

  getConnectionsByType: (type) => {
    return get().connections.filter((c) => c.type === type)
  },

  getInboxCount: (connectionId) => {
    return get().inboxItems.get(connectionId)?.length ?? 0
  },

  getTotalInboxCount: () => {
    let total = 0
    for (const items of get().inboxItems.values()) {
      total += items.length
    }
    return total
  },

  getSyncState: (connectionId) => {
    return get().syncStates.get(connectionId) ?? DEFAULT_SYNC
  },
}))

// ============================================================================
// Import rule matching helper (used during auto-import)
// ============================================================================

import type { ImportRule } from "@/types/import-rule"

function matchItemToRule(item: InboxItem, rule: ImportRule): boolean {
  if (rule.integration_type !== item.sourceType) return false
  const metadata = item.metadata as Record<string, unknown>
  switch (item.sourceType) {
    case "linear":
      return rule.source_filter.teamId === metadata.teamId
    case "todoist":
      return rule.source_filter.projectId === metadata.projectId
    case "attio":
      return rule.source_filter.listId === "all" || rule.source_filter.listId === metadata.listId
    default:
      return false
  }
}

// ============================================================================
// Provider-specific sync functions
// ============================================================================

async function syncLinearConnection(conn: IntegrationConnection): Promise<InboxItem[]> {
  // Validate key + refresh metadata (teams, user)
  const user = await validateLinearKey(conn.apiKey)
  const teams = await fetchTeams(conn.apiKey)

  // Use connection-configured state filter, or default to started+unstarted
  const stateFilter = (conn.metadata.linearStateTypes as LinearStateType[] | undefined) ?? [...DEFAULT_LINEAR_STATE_FILTER]
  const issues = await fetchAssignedIssues(conn.apiKey, undefined, stateFilter)

  // Update connection metadata with latest user/teams info (preserve stateTypes setting)
  await db.connections.update(conn.id, {
    metadata: { ...conn.metadata, user, teams },
  })

  return issues.map((issue) => mapLinearIssueToInboxItem(issue, conn.id))
}

async function syncTodoistConnection(conn: IntegrationConnection): Promise<InboxItem[]> {
  await validateTodoistToken(conn.apiKey)
  const projects = await fetchTodoistProjects(conn.apiKey)
  const tasks = await fetchTodoistTasks(conn.apiKey)

  // Build project name lookup
  const projectMap = new Map(projects.map((p) => [p.id, p.name]))

  // Update connection metadata
  await db.connections.update(conn.id, {
    metadata: { projects },
  })

  return tasks.map((task) =>
    mapTodoistTaskToInboxItem(task, conn.id, projectMap.get(task.project_id)),
  )
}

async function syncAttioConnection(conn: IntegrationConnection): Promise<InboxItem[]> {
  await validateAttioKey(conn.apiKey)
  const tasks = await fetchAttioTasks(conn.apiKey)

  // Update connection metadata
  await db.connections.update(conn.id, {
    metadata: { taskCount: tasks.length },
  })

  return tasks.map((task) => mapAttioTaskToInboxItem(task, conn.id))
}
