import { create } from "zustand"
import { db } from "@/lib/db"
import { getCurrentUserId } from "@/lib/auth"
import { queueSync } from "@/lib/sync"
import type { IntegrationConnection } from "@/types/local"
import type { IntegrationType } from "@/types/database"
import type { InboxItem } from "@/types/inbox"
import { buildTaskSourceMetadata, mapInboxItemToLocalTask } from "@/types/inbox"
import { normalizeTaskSourceMetadata, sourceMetadataSignature } from "@/lib/task-source"
import { validateApiKey as validateLinearKey, fetchTeams, fetchAssignedIssues, fetchWorkflowStates, DEFAULT_LINEAR_STATE_FILTER, LINEAR_STATE_TYPES } from "@/integrations/linear"
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function toValidUuid(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return UUID_RE.test(trimmed) ? trimmed : null
}

function canInferCompletionByAbsence(type: IntegrationType): boolean {
  // Linear fetch is filter-driven (state/team settings), so absence does not
  // reliably mean "completed". Todoist/Attio fetch active tasks only.
  return type === "todoist" || type === "attio"
}

interface SyncFetchResult {
  items: InboxItem[]
  /** Source IDs known to be active in the provider (used for safe reopen) */
  activeSourceIds: Set<string>
}

/** Convert a local IntegrationConnection to a Supabase-compatible row for queueSync */
function toRemotePayload(conn: IntegrationConnection): Record<string, unknown> {
  const userId = getCurrentUserId()
  return {
    id: conn.id,
    user_id: userId,
    type: conn.type,
    api_key: conn.apiKey,
    label: conn.label,
    metadata: conn.metadata,
    is_active: conn.isActive,
    default_bucket_id: conn.defaultBucketId,
    default_section: conn.defaultSection ?? "sooner",
    auto_import: conn.autoImport,
    created_at: conn.created_at,
  }
}

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
    void queueSync("integrations", "insert", toRemotePayload(conn))
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
    void queueSync("integrations", "delete", { id })
  },

  updateConnection: async (id, updates) => {
    await db.connections.update(id, updates)
    set((s) => ({
      connections: s.connections.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    }))
    // Map camelCase updates to snake_case for Supabase
    const remoteUpdates: Record<string, unknown> = { id }
    if (updates.label !== undefined) remoteUpdates.label = updates.label
    if (updates.apiKey !== undefined) remoteUpdates.api_key = updates.apiKey
    if (updates.isActive !== undefined) remoteUpdates.is_active = updates.isActive
    if (updates.metadata !== undefined) remoteUpdates.metadata = updates.metadata
    if (updates.defaultBucketId !== undefined) remoteUpdates.default_bucket_id = updates.defaultBucketId
    if (updates.defaultSection !== undefined) remoteUpdates.default_section = updates.defaultSection
    if (updates.autoImport !== undefined) remoteUpdates.auto_import = updates.autoImport
    void queueSync("integrations", "update", remoteUpdates)
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
      const defaultBucketId = toValidUuid(conn.defaultBucketId)
      if (conn.defaultBucketId && !defaultBucketId) {
        await db.connections.update(conn.id, { defaultBucketId: null })
        void queueSync("integrations", "update", { id: conn.id, default_bucket_id: null })
        set((s) => ({
          connections: s.connections.map((c) => (
            c.id === conn.id ? { ...c, defaultBucketId: null } : c
          )),
        }))
      }

      let result: SyncFetchResult = { items: [], activeSourceIds: new Set<string>() }

      if (conn.type === "linear") {
        result = await syncLinearConnection(conn)
      } else if (conn.type === "todoist") {
        result = await syncTodoistConnection(conn)
      } else if (conn.type === "attio") {
        result = await syncAttioConnection(conn)
      }
      const items = result.items
      const itemBySourceId = new Map(items.map((item) => [item.sourceId, item]))

      const existingConnectionTasks = await db.tasks
        .where("source")
        .equals(conn.type)
        .filter((t) =>
          t.source_id != null &&
          (t.connection_id === conn.id || t.connection_id == null),
        )
        .toArray()
      let shouldReloadTasks = false

      // Keep provider metadata fresh for imported tasks.
      const nowIso = new Date().toISOString()
      for (const task of existingConnectionTasks) {
        if (!task.source_id) continue
        const sourceItem = itemBySourceId.get(task.source_id)
        if (!sourceItem) continue

        const currentMetadata = normalizeTaskSourceMetadata(task.source_metadata, {
          project: task.source_project,
          description: task.source_description,
        })
        const nextMetadata = buildTaskSourceMetadata(sourceItem)
        if (sourceMetadataSignature(currentMetadata) === sourceMetadataSignature(nextMetadata)) continue

        await db.tasks.update(task.id, {
          source_metadata: nextMetadata,
          updated_at: nowIso,
        })
        void queueSync("tasks", "update", {
          id: task.id,
          source_metadata: nextMetadata,
          updated_at: nowIso,
        })
        shouldReloadTasks = true
      }

      // Inbound reopen detection: if a previously completed task appears in
      // active fetch again, restore it locally without writeback.
      const fetchedSourceIds = new Set(items.map((i) => i.sourceId))
      const activeSourceIds = result.activeSourceIds.size > 0 ? result.activeSourceIds : fetchedSourceIds
      const reopenedLocally = existingConnectionTasks.filter(
        (t) => t.status === "completed" && t.source_id && activeSourceIds.has(t.source_id),
      )
      if (reopenedLocally.length > 0) {
        const taskStore = useTaskStore.getState()
        for (const task of reopenedLocally) {
          await taskStore.uncompleteTask(task.id, { skipWriteback: true })

          // Todoist recurring tasks keep the same source ID when completed.
          // If the next due date moved into the future, don't keep them pinned in Today.
          if (conn.type === "todoist" && task.section === "today" && task.source_id) {
            const sourceItem = itemBySourceId.get(task.source_id)
            if (shouldDemoteRecurringTodoistTask(sourceItem)) {
              const targetSection = conn.defaultSection && conn.defaultSection !== "today"
                ? conn.defaultSection
                : "sooner"
              await taskStore.moveToSection(task.id, targetSection)
            }
          }
        }
      }

      // Todoist recurring tasks can remain "active" while their due date moves
      // to a future occurrence. Keep them out of Today in that case.
      if (conn.type === "todoist") {
        const taskStore = useTaskStore.getState()
        const targetSection = conn.defaultSection && conn.defaultSection !== "today"
          ? conn.defaultSection
          : "sooner"

        const activeRecurringFutureTasks = existingConnectionTasks.filter((task) =>
          task.status === "active" &&
          task.section === "today" &&
          task.source_id &&
          activeSourceIds.has(task.source_id) &&
          shouldDemoteRecurringTodoistTask(itemBySourceId.get(task.source_id)),
        )

        for (const task of activeRecurringFutureTasks) {
          await taskStore.moveToSection(task.id, targetSection)
        }
      }

      // Inbound completion detection: only for providers where "not fetched"
      // truly means "no longer active" (Todoist/Attio).
      if (canInferCompletionByAbsence(conn.type)) {
        const importedActiveTasks = existingConnectionTasks.filter((t) => t.status === "active")
        const completedExternally = importedActiveTasks.filter(
          (t) => t.source_id && !fetchedSourceIds.has(t.source_id),
        )

        if (completedExternally.length > 0) {
          const taskStore = useTaskStore.getState()
          for (const task of completedExternally) {
            // skipWriteback: task is already done in the source — don't push back
            await taskStore.completeTask(task.id, { skipWriteback: true })
          }
        }
      }

      // Filter out already-imported items (dedup by source + source_id)
      const existingSourceIds = new Set(existingConnectionTasks.map((t) => t.source_id))
      const newItems = items.filter((i) => !existingSourceIds.has(i.sourceId))

      // Auto-import: if this connection has default mapping enabled, import matching items
      const autoImportedIds = new Set<string>()
      if (conn.autoImport && defaultBucketId) {
        const section = conn.defaultSection ?? "sooner"
        // Load import rules once, outside the loop
        const importRules = await db.importRules.where("integration_type").equals(conn.type).toArray()
        const activeRules = importRules.filter((r) => r.is_active)

        for (const item of newItems) {
          // Use the specific rule's bucket/section if one matches, otherwise default mapping
          const matchedRule = activeRules.find((r) => matchItemToRule(item, r))
          const targetBucketId = toValidUuid(matchedRule?.target_bucket_id) ?? defaultBucketId
          const targetSection = matchedRule ? matchedRule.target_section : section
          if (!targetBucketId) continue

          const userId = getCurrentUserId()
          const position = await db.tasks
            .where("[user_id+bucket_id]")
            .equals([userId, targetBucketId])
            .count()

          const task = mapInboxItemToLocalTask(item, userId, targetBucketId, targetSection, position)
          await db.tasks.put(task)
          void queueSync("tasks", "insert", task as unknown as Record<string, unknown>)
          autoImportedIds.add(item.id)
        }
      }

      // Refresh task store so auto-imports and project-label backfills render immediately.
      if (autoImportedIds.size > 0 || shouldReloadTasks) {
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
      for (const t of tasksToShift) {
        void queueSync("tasks", "update", { id: t.id, position: t.position + 1 })
      }
    }

    const position = insertPosition ?? await db.tasks
      .where("[user_id+bucket_id]")
      .equals([userId, bucketId])
      .count()

    const task = mapInboxItemToLocalTask(item, userId, bucketId, section, position)
    await db.tasks.put(task)
    void queueSync("tasks", "insert", task as unknown as Record<string, unknown>)

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

function parseDueAsLocalDay(value: string): Date | null {
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

/**
 * Recurring Todoist tasks remain active after completion and shift their due date.
 * If the next occurrence is in the future, move them out of Today when reopening.
 */
function shouldDemoteRecurringTodoistTask(item: InboxItem | undefined): boolean {
  if (!item || item.sourceType !== "todoist") return false
  const metadata = item.metadata as Record<string, unknown>
  const due = metadata.due as { date?: string; is_recurring?: boolean } | null | undefined
  if (!due?.is_recurring || !due.date) return false

  const dueDate = parseDueAsLocalDay(due.date)
  if (!dueDate) return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return dueDate.getTime() > today.getTime()
}

// ============================================================================
// Provider-specific sync functions
// ============================================================================

async function syncLinearConnection(conn: IntegrationConnection): Promise<SyncFetchResult> {
  // Validate key + refresh metadata (teams, user)
  const user = await validateLinearKey(conn.apiKey)
  const teams = await fetchTeams(conn.apiKey)

  // Use connection-configured state filter, or default to started+unstarted
  const stateFilter = (conn.metadata.linearStateTypes as LinearStateType[] | undefined) ?? [...DEFAULT_LINEAR_STATE_FILTER]
  // Always fetch all active state-types so we can safely reopen tasks that are
  // still active in Linear but hidden by a narrower inbox filter.
  const allActiveIssues = await fetchAssignedIssues(conn.apiKey, undefined, [...LINEAR_STATE_TYPES])
  const issues = allActiveIssues.filter((issue) => {
    const stateType = issue.state?.type as LinearStateType | undefined
    return stateType ? stateFilter.includes(stateType) : false
  })

  // Cache workflow state IDs per team for two-way sync writeback
  const teamDoneStates: Record<string, string> = {}
  const teamStartedStates: Record<string, string> = {}
  for (const team of teams) {
    const states = await fetchWorkflowStates(conn.apiKey, team.id)
    const done = states.find((s) => s.type === "completed")
    const started = states.find((s) => s.type === "started")
    if (done) teamDoneStates[team.id] = done.id
    if (started) teamStartedStates[team.id] = started.id
  }

  // Update connection metadata with latest user/teams info + cached states
  const updatedMetadata = { ...conn.metadata, user, teams, teamDoneStates, teamStartedStates }
  await db.connections.update(conn.id, { metadata: updatedMetadata })
  void queueSync("integrations", "update", { id: conn.id, metadata: updatedMetadata })

  return {
    items: issues.map((issue) => mapLinearIssueToInboxItem(issue, conn.id)),
    activeSourceIds: new Set(allActiveIssues.map((issue) => issue.id)),
  }
}

async function syncTodoistConnection(conn: IntegrationConnection): Promise<SyncFetchResult> {
  await validateTodoistToken(conn.apiKey)
  const projects = await fetchTodoistProjects(conn.apiKey)
  const tasks = await fetchTodoistTasks(conn.apiKey)

  // Build project name lookup
  const projectMap = new Map(projects.map((p) => [p.id, p.name]))

  // Update connection metadata
  const updatedMetadata = { projects }
  await db.connections.update(conn.id, { metadata: updatedMetadata })
  void queueSync("integrations", "update", { id: conn.id, metadata: updatedMetadata })

  return {
    items: tasks.map((task) =>
      mapTodoistTaskToInboxItem(task, conn.id, projectMap.get(task.project_id)),
    ),
    activeSourceIds: new Set(tasks.map((task) => String(task.id))),
  }
}

async function syncAttioConnection(conn: IntegrationConnection): Promise<SyncFetchResult> {
  await validateAttioKey(conn.apiKey)
  const tasks = await fetchAttioTasks(conn.apiKey)

  // Update connection metadata
  const updatedMetadata = { taskCount: tasks.length }
  await db.connections.update(conn.id, { metadata: updatedMetadata })
  void queueSync("integrations", "update", { id: conn.id, metadata: updatedMetadata })

  return {
    items: tasks.map((task) => mapAttioTaskToInboxItem(task, conn.id)),
    activeSourceIds: new Set(tasks.map((task) => String(task.id))),
  }
}
