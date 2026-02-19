import Dexie from "dexie"
import type { Transaction } from "dexie"
import type {
  AppState,
  IntegrationConnection,
  IntegrationKey,
  LocalBucket,
  LocalSession,
  LocalTask,
  LocalTimeEntry,
  SyncQueueItem,
} from "@/types/local"
import type { ImportRule } from "@/types/import-rule"

function getTableIfExists(tx: Transaction, name: string): Dexie.Table<Record<string, unknown>, unknown> | null {
  try {
    return tx.table(name) as unknown as Dexie.Table<Record<string, unknown>, unknown>
  } catch {
    return null
  }
}

/**
 * Flowpin's local database (IndexedDB via Dexie).
 *
 * Two categories of tables:
 * 1. Mirrors of Supabase tables — for offline reads (buckets, tasks, sessions, time_entries)
 * 2. Local-only stores — never synced (integration_keys, sync_queue, app_state)
 */
class FlowpinDB extends Dexie {
  // Supabase mirrors (offline reads + optimistic writes)
  buckets!: Dexie.Table<LocalBucket, string>
  tasks!: Dexie.Table<LocalTask, string>
  sessions!: Dexie.Table<LocalSession, string>
  timeEntries!: Dexie.Table<LocalTimeEntry, string>
  importRules!: Dexie.Table<ImportRule, string>

  // Local-only stores
  integrationKeys!: Dexie.Table<IntegrationKey, string>
  connections!: Dexie.Table<IntegrationConnection, string>
  syncQueue!: Dexie.Table<SyncQueueItem, string>
  appState!: Dexie.Table<AppState, string>

  constructor() {
    super("flowpin")

    this.version(3).stores({
      buckets: "id, user_id, position, is_default",
      tasks:
        "id, user_id, bucket_id, section, source, source_id, status, [user_id+bucket_id], [user_id+section], [user_id+source]",
      sessions: "id, user_id, is_active, [user_id+is_active]",
      timeEntries: "id, session_id, user_id, started_at",
      importRules: "id, user_id, integration_type, is_active",
      integrationKeys: "integrationId, type",
      syncQueue: "id, table, createdAt",
      appState: "key",
    })

    // v4: Multi-connection model — add `connections` table alongside legacy `integrationKeys`
    this.version(4).stores({
      buckets: "id, user_id, position, is_default",
      tasks:
        "id, user_id, bucket_id, section, source, source_id, status, [user_id+bucket_id], [user_id+section], [user_id+source]",
      sessions: "id, user_id, is_active, [user_id+is_active]",
      timeEntries: "id, session_id, user_id, started_at",
      importRules: "id, user_id, integration_type, is_active",
      integrationKeys: "integrationId, type",
      connections: "id, type, isActive",
      syncQueue: "id, table, createdAt",
      appState: "key",
    }).upgrade(async (tx) => {
      // Migrate legacy integrationKeys → connections
      const oldKeys = await tx.table("integrationKeys").toArray()
      for (const key of oldKeys) {
        await tx.table("connections").put({
          id: crypto.randomUUID(),
          type: key.type,
          label: `${key.type.charAt(0).toUpperCase() + key.type.slice(1)}`,
          apiKey: key.apiKey,
          metadata: {},
          isActive: true,
          created_at: new Date().toISOString(),
        })
      }
    })

    // v5: Add source_description + task_id index on timeEntries for task detail page
    this.version(5).stores({
      buckets: "id, user_id, position, is_default",
      tasks:
        "id, user_id, bucket_id, section, source, source_id, status, [user_id+bucket_id], [user_id+section], [user_id+source]",
      sessions: "id, user_id, is_active, [user_id+is_active]",
      timeEntries: "id, session_id, user_id, task_id, started_at",
      importRules: "id, user_id, integration_type, is_active",
      integrationKeys: "integrationId, type",
      connections: "id, type, isActive",
      syncQueue: "id, table, createdAt",
      appState: "key",
    }).upgrade(async (tx) => {
      // For integration tasks, move description → source_description so the original is preserved
      await tx.table("tasks").toCollection().modify((task: Record<string, unknown>) => {
        if (task.source !== "manual" && task.description) {
          task.source_description = task.description
          task.description = null
        } else {
          task.source_description = null
        }
      })
    })

    // v6: Add connection_id to tasks for two-way sync (maps task → connection → API key)
    this.version(6).stores({
      buckets: "id, user_id, position, is_default",
      tasks:
        "id, user_id, bucket_id, section, source, source_id, status, connection_id, [user_id+bucket_id], [user_id+section], [user_id+source]",
      sessions: "id, user_id, is_active, [user_id+is_active]",
      timeEntries: "id, session_id, user_id, task_id, started_at",
      importRules: "id, user_id, integration_type, is_active",
      integrationKeys: "integrationId, type",
      connections: "id, type, isActive",
      syncQueue: "id, table, createdAt",
      appState: "key",
    }).upgrade(async (tx) => {
      // Backfill connection_id = null for all existing tasks
      await tx.table("tasks").toCollection().modify((task: Record<string, unknown>) => {
        if (task.connection_id === undefined) {
          task.connection_id = null
        }
      })
    })

    // v7: Clean up empty-string UUIDs → null (Postgres rejects "" as UUID)
    this.version(7).stores({
      buckets: "id, user_id, position, is_default",
      tasks:
        "id, user_id, bucket_id, section, source, source_id, status, connection_id, [user_id+bucket_id], [user_id+section], [user_id+source]",
      sessions: "id, user_id, is_active, [user_id+is_active]",
      timeEntries: "id, session_id, user_id, task_id, started_at",
      importRules: "id, user_id, integration_type, is_active",
      integrationKeys: "integrationId, type",
      connections: "id, type, isActive",
      syncQueue: "id, table, createdAt",
      appState: "key",
    }).upgrade(async (tx) => {
      // Fix tasks: connection_id "" → null
      await tx.table("tasks").toCollection().modify((task: Record<string, unknown>) => {
        if (task.connection_id === "" || task.connection_id === undefined) {
          task.connection_id = null
        }
      })
      // Fix connections: defaultBucketId "" → null
      await tx.table("connections").toCollection().modify((conn: Record<string, unknown>) => {
        if (conn.defaultBucketId === "") conn.defaultBucketId = null
        if (conn.defaultSection === "") conn.defaultSection = null
      })
    })

    // v8: Repair legacy sentinel values (e.g. "global") in UUID-backed fields
    this.version(8).stores({
      buckets: "id, user_id, position, is_default",
      tasks:
        "id, user_id, bucket_id, section, source, source_id, status, connection_id, [user_id+bucket_id], [user_id+section], [user_id+source]",
      sessions: "id, user_id, is_active, [user_id+is_active]",
      timeEntries: "id, session_id, user_id, task_id, started_at",
      importRules: "id, user_id, integration_type, is_active",
      integrationKeys: "integrationId, type",
      connections: "id, type, isActive",
      syncQueue: "id, table, createdAt",
      appState: "key",
    }).upgrade(async (tx) => {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      const NULL_SENTINELS = new Set(["", "global", "__none__", "none", "null"])
      const UUID_KEYS = ["bucket_id", "connection_id", "integration_id", "default_bucket_id", "target_bucket_id"]

      const normalizeNullableUuid = (value: unknown): string | null => {
        if (value == null) return null
        if (typeof value !== "string") return null
        const trimmed = value.trim()
        if (NULL_SENTINELS.has(trimmed.toLowerCase())) return null
        return UUID_RE.test(trimmed) ? trimmed : null
      }

      const connectionsTable = getTableIfExists(tx, "connections")
      if (connectionsTable) {
        await connectionsTable.toCollection().modify((conn: Record<string, unknown>) => {
          const nextDefaultBucketId = normalizeNullableUuid(conn.defaultBucketId)
          if (conn.defaultBucketId !== nextDefaultBucketId) conn.defaultBucketId = nextDefaultBucketId
          if (conn.defaultSection === "") conn.defaultSection = null
        })
      }

      const importRulesTable = getTableIfExists(tx, "importRules") ?? getTableIfExists(tx, "import_rules")
      if (importRulesTable) {
        await importRulesTable.toCollection().modify((rule: Record<string, unknown>) => {
          const nextTargetBucketId = normalizeNullableUuid(rule.target_bucket_id)
          if (rule.target_bucket_id !== nextTargetBucketId) rule.target_bucket_id = nextTargetBucketId
        })
      }

      const tasksTable = getTableIfExists(tx, "tasks")
      if (tasksTable) {
        await tasksTable.toCollection().modify((task: Record<string, unknown>) => {
          const nextBucketId = normalizeNullableUuid(task.bucket_id)
          const nextConnectionId = normalizeNullableUuid(task.connection_id)
          if (task.bucket_id !== nextBucketId) task.bucket_id = nextBucketId
          if (task.connection_id !== nextConnectionId) task.connection_id = nextConnectionId
        })
      }

      const syncQueueTable = getTableIfExists(tx, "syncQueue")
      if (syncQueueTable) {
        await syncQueueTable.toCollection().modify((item: Record<string, unknown>) => {
          const payload = item.payload as Record<string, unknown> | undefined
          if (!payload || typeof payload !== "object") return

          const cleaned = { ...payload }
          let changed = false
          for (const key of UUID_KEYS) {
            if (!(key in cleaned)) continue
            const next = normalizeNullableUuid(cleaned[key])
            if (cleaned[key] !== next) {
              cleaned[key] = next
              changed = true
            }
          }

          if (changed) item.payload = cleaned
        })
      }
    })

    // v9: Compatibility migration for legacy store name `import_rules`.
    // Some deployed builds used snake_case store naming; ensure we can read and
    // copy those rows into the canonical camelCase `importRules` store.
    this.version(9).stores({
      buckets: "id, user_id, position, is_default",
      tasks:
        "id, user_id, bucket_id, section, source, source_id, status, connection_id, [user_id+bucket_id], [user_id+section], [user_id+source]",
      sessions: "id, user_id, is_active, [user_id+is_active]",
      timeEntries: "id, session_id, user_id, task_id, started_at",
      importRules: "id, user_id, integration_type, is_active",
      import_rules: "id, user_id, integration_type, is_active",
      integrationKeys: "integrationId, type",
      connections: "id, type, isActive",
      syncQueue: "id, table, createdAt",
      appState: "key",
    }).upgrade(async (tx) => {
      const canonical = getTableIfExists(tx, "importRules")
      const legacy = getTableIfExists(tx, "import_rules")
      if (!canonical || !legacy) return

      const legacyRows = await legacy.toArray()
      if (legacyRows.length === 0) return
      await canonical.bulkPut(legacyRows)
    })

    // v10: Add waiting_for_reason to tasks for "Waiting For" workflow
    this.version(10).stores({
      buckets: "id, user_id, position, is_default",
      tasks:
        "id, user_id, bucket_id, section, source, source_id, status, connection_id, [user_id+bucket_id], [user_id+section], [user_id+source]",
      sessions: "id, user_id, is_active, [user_id+is_active]",
      timeEntries: "id, session_id, user_id, task_id, started_at",
      importRules: "id, user_id, integration_type, is_active",
      import_rules: "id, user_id, integration_type, is_active",
      integrationKeys: "integrationId, type",
      connections: "id, type, isActive",
      syncQueue: "id, table, createdAt",
      appState: "key",
    }).upgrade(async (tx) => {
      const tasksTable = getTableIfExists(tx, "tasks")
      if (!tasksTable) return
      await tasksTable.toCollection().modify((task: Record<string, unknown>) => {
        if (task.waiting_for_reason === undefined) {
          task.waiting_for_reason = null
        }
      })
    })

    // v11: Add source_project to tasks for provider project/list/workspace label.
    // Also backfill waiting_for_reason for users coming from older local builds.
    this.version(11).stores({
      buckets: "id, user_id, position, is_default",
      tasks:
        "id, user_id, bucket_id, section, source, source_id, status, connection_id, [user_id+bucket_id], [user_id+section], [user_id+source]",
      sessions: "id, user_id, is_active, [user_id+is_active]",
      timeEntries: "id, session_id, user_id, task_id, started_at",
      importRules: "id, user_id, integration_type, is_active",
      import_rules: "id, user_id, integration_type, is_active",
      integrationKeys: "integrationId, type",
      connections: "id, type, isActive",
      syncQueue: "id, table, createdAt",
      appState: "key",
    }).upgrade(async (tx) => {
      const tasksTable = getTableIfExists(tx, "tasks")
      if (!tasksTable) return
      await tasksTable.toCollection().modify((task: Record<string, unknown>) => {
        if (task.source_project === undefined) task.source_project = null
        if (task.waiting_for_reason === undefined) task.waiting_for_reason = null
      })
    })
  }
}

export const db = new FlowpinDB()

/**
 * Generate a stable device ID for this browser/device.
 * Persisted in app_state so it survives page refreshes.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const state = await db.appState.get("state")
  if (state?.deviceId) return state.deviceId

  const deviceId = crypto.randomUUID()
  await db.appState.put({
    key: "state",
    activeSessionId: null,
    activeTimeEntryId: null,
    activeTaskId: null,
    timerStartedAt: null,
    currentView: "today",
    deviceId,
    rightRailPanel: null,
    todaySectionsEnabled: false,
    todayLaneByTaskId: {},
  })

  return deviceId
}
