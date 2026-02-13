import Dexie from "dexie"
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
  })

  return deviceId
}
