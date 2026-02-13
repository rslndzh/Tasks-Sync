import { db } from "@/lib/db"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { isAuthenticated, getCurrentUserId } from "@/lib/auth"
import { useBucketStore } from "@/stores/useBucketStore"
import { useTaskStore } from "@/stores/useTaskStore"
import { useSessionStore } from "@/stores/useSessionStore"
import { useSyncStore } from "@/stores/useSyncStore"
import type { SyncQueueItem } from "@/types/local"

/**
 * Sync engine — handles offline queue, Supabase push/pull, and Realtime.
 *
 * Strategy:
 * 1. Writes always go to Dexie first (optimistic).
 * 2. If authenticated, mutations also push to the sync queue.
 * 3. On login/app load: pull remote → flush queue → subscribe Realtime.
 * 4. Realtime subscriptions keep data in sync across tabs/devices.
 *
 * Conflict resolution: last-write-wins (updated_at).
 */

/** Extract a readable message from Supabase errors or JS errors */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err)
}

// ============================================================================
// Queue mutations
// ============================================================================

/**
 * Queue a mutation to be synced to Supabase when online.
 * No-op for anonymous users or when Supabase isn't configured.
 */
export async function queueSync(
  table: SyncQueueItem["table"],
  operation: SyncQueueItem["operation"],
  payload: Record<string, unknown>,
): Promise<void> {
  if (!isSupabaseConfigured || !isAuthenticated()) return

  await db.syncQueue.put({
    id: crypto.randomUUID(),
    table,
    operation,
    payload,
    createdAt: Date.now(),
    retryCount: 0,
  })
}

// ============================================================================
// Flush queue
// ============================================================================

/** Max retries before moving a queue item to dead-letter status */
const MAX_RETRIES = 3

/**
 * Process all queued mutations, pushing them to Supabase.
 * Retries up to 3 times per item. Failed items beyond that are marked as dead letters.
 */
export async function flushSyncQueue(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return

  const items = await db.syncQueue
    .orderBy("createdAt")
    .filter((item) => item.retryCount < MAX_RETRIES)
    .toArray()

  if (items.length === 0) {
    useSyncStore.getState().setPendingCount(0)
    return
  }

  useSyncStore.getState().setPendingCount(items.length)

  let failCount = 0
  let lastError = ""
  for (const item of items) {
    try {
      await pushToSupabase(item)
      await db.syncQueue.delete(item.id)
    } catch (err) {
      failCount++
      lastError = extractErrorMessage(err)
      const newCount = item.retryCount + 1
      await db.syncQueue.update(item.id, { retryCount: newCount })
    }
  }

  // Update pending count with remaining items
  const remaining = await db.syncQueue
    .filter((item) => item.retryCount < MAX_RETRIES)
    .count()
  useSyncStore.getState().setPendingCount(remaining)

  if (failCount > 0) {
    useSyncStore.getState().setError(`${failCount} change${failCount > 1 ? "s" : ""} failed to sync: ${lastError}`)
  }
}

/**
 * Count of dead-lettered sync items (exceeded max retries).
 * Used to show a subtle indicator in Settings.
 */
export async function getDeadLetterCount(): Promise<number> {
  return db.syncQueue
    .filter((item) => item.retryCount >= MAX_RETRIES)
    .count()
}

/**
 * Clear dead-lettered items (user acknowledges they're gone).
 */
export async function clearDeadLetters(): Promise<void> {
  const dead = await db.syncQueue
    .filter((item) => item.retryCount >= MAX_RETRIES)
    .toArray()
  await db.syncQueue.bulkDelete(dead.map((d) => d.id))
}

async function pushToSupabase(item: SyncQueueItem): Promise<void> {
  if (!supabase) return

  const { table, operation, payload } = item

  // Dynamic table name means TypeScript can't narrow the upsert/update types.
  // We use `as any` here because the payload shapes are validated at queue-time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  switch (operation) {
    case "insert": {
      // Use upsert to handle conflicts (e.g., duplicate Inbox bucket)
      const { error } = await client.from(table).upsert(payload)
      if (error) throw error
      break
    }
    case "update": {
      const { id, ...rest } = payload
      const { error } = await client.from(table).update(rest).eq("id", id as string)
      // Ignore 404-style errors — the row might have been deleted on server
      if (error && error.code !== "PGRST116") throw error
      break
    }
    case "delete": {
      const { error } = await client.from(table).delete().eq("id", payload.id as string)
      // Ignore "not found" errors on delete — already gone server-side
      if (error && error.code !== "PGRST116") throw error
      break
    }
  }
}

// ============================================================================
// Pull from Supabase (initial load + merge)
// ============================================================================

/**
 * Pull all user data from Supabase and merge into Dexie.
 * Server wins on conflict (bulkPut = upsert by primary key).
 */
export async function pullFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return

  try {
    // Pull buckets
    const { data: remoteBuckets, error: bucketsError } = await supabase
      .from("buckets")
      .select("*")
      .order("position")

    if (bucketsError) throw bucketsError
    if (remoteBuckets?.length) {
      await db.buckets.bulkPut(remoteBuckets)
    }

    // Pull active tasks
    const { data: remoteTasks, error: tasksError } = await supabase
      .from("tasks")
      .select("*")
      .in("status", ["active"])

    if (tasksError) throw tasksError
    if (remoteTasks?.length) {
      await db.tasks.bulkPut(remoteTasks)
    }

    // Pull sessions (today only for performance)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data: remoteSessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("*")
      .gte("started_at", todayStart.toISOString())

    if (sessionsError) throw sessionsError
    if (remoteSessions?.length) {
      await db.sessions.bulkPut(remoteSessions)
    }

    // Pull time entries (today only)
    const { data: remoteEntries, error: entriesError } = await supabase
      .from("time_entries")
      .select("*")
      .gte("started_at", todayStart.toISOString())

    if (entriesError) throw entriesError
    if (remoteEntries?.length) {
      await db.timeEntries.bulkPut(remoteEntries)
    }
  } catch (err) {
    const message = extractErrorMessage(err)
    // Surface schema-missing errors with a friendly message
    if (message.includes("schema cache") || message.includes("does not exist")) {
      useSyncStore.getState().setError("Cloud database isn't set up yet. Run the setup SQL in your Supabase SQL Editor (see scripts/setup-db.sql).")
    } else {
      useSyncStore.getState().setError(`Sync pull failed: ${message}`)
    }
  }
}

/**
 * Reload all Zustand stores from Dexie after a pull or Realtime change.
 */
export async function reloadStoresFromDexie(): Promise<void> {
  await useBucketStore.getState().loadBuckets()
  await useTaskStore.getState().loadTasks()
  await useSessionStore.getState().loadTodaySessions()
}

// ============================================================================
// Realtime subscriptions
// ============================================================================

type RealtimeTable = "buckets" | "tasks" | "sessions" | "time_entries"

let realtimeChannel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null

/**
 * Subscribe to Supabase Realtime for all synced tables.
 * Incoming changes are written to Dexie, then stores reload.
 */
export function subscribeToRealtime(): void {
  if (!isSupabaseConfigured || !supabase) return

  // Clean up existing subscription
  if (realtimeChannel) {
    void supabase.removeChannel(realtimeChannel)
  }

  realtimeChannel = supabase
    .channel("flowpin-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "buckets" }, (payload) => {
      void handleRealtimeChange("buckets", payload)
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (payload) => {
      void handleRealtimeChange("tasks", payload)
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, (payload) => {
      void handleRealtimeChange("sessions", payload)
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, (payload) => {
      void handleRealtimeChange("time_entries", payload)
    })
    .subscribe()
}

export function unsubscribeFromRealtime(): void {
  if (realtimeChannel && supabase) {
    void supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
}

async function handleRealtimeChange(
  table: RealtimeTable,
  payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> },
): Promise<void> {
  const { eventType } = payload
  const dexieTable = table === "time_entries" ? db.timeEntries : db[table as "buckets" | "tasks" | "sessions"]

  switch (eventType) {
    case "INSERT":
    case "UPDATE": {
      const record = payload.new
      await (dexieTable as typeof db.tasks).put(record as never)
      break
    }
    case "DELETE": {
      const record = payload.old
      await (dexieTable as typeof db.tasks).delete(record.id as string)
      break
    }
  }

  // Reload affected store so UI reflects the change
  await reloadStoresFromDexie()
}

// ============================================================================
// Local data migration (anonymous → authenticated)
// ============================================================================

/**
 * Rewrite all Dexie rows from user_id="local" to the real Supabase user ID.
 * Called once when a user signs up or signs in for the first time.
 */
export async function migrateLocalData(userId: string): Promise<void> {
  await db.transaction("rw", [db.buckets, db.tasks, db.sessions, db.timeEntries], async () => {
    // Migrate buckets
    const localBuckets = await db.buckets.where("user_id").equals("local").toArray()
    for (const bucket of localBuckets) {
      await db.buckets.update(bucket.id, { user_id: userId })
    }

    // Migrate tasks
    const localTasks = await db.tasks.where("user_id").equals("local").toArray()
    for (const task of localTasks) {
      await db.tasks.update(task.id, { user_id: userId })
    }

    // Migrate sessions
    const localSessions = await db.sessions.where("user_id").equals("local").toArray()
    for (const session of localSessions) {
      await db.sessions.update(session.id, { user_id: userId })
    }

    // Migrate time entries
    const localEntries = await db.timeEntries.where("user_id").equals("local").toArray()
    for (const entry of localEntries) {
      await db.timeEntries.update(entry.id, { user_id: userId })
    }
  })
}

/**
 * Push all local data to Supabase after migration.
 * Order matters: buckets first (tasks reference them), then tasks, then sessions, then time_entries.
 * Uses upsert to handle conflicts (e.g., Supabase trigger-created Inbox bucket).
 */
export async function pushAllToSupabase(userId: string): Promise<void> {
  if (!supabase) return

  // Local types match Supabase schema but TypeScript can't verify the
  // structural overlap, so we cast via `any` for the upsert calls.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  // Delete the trigger-created default Inbox bucket on Supabase
  // (we'll push our local one which has the user's real data)
  await client.from("buckets").delete().eq("user_id", userId).eq("is_default", true)

  // Push buckets
  const buckets = await db.buckets.where("user_id").equals(userId).toArray()
  if (buckets.length > 0) {
    const { error } = await client.from("buckets").upsert(buckets)
    if (error) throw error
  }

  // Push tasks
  const tasks = await db.tasks.where("user_id").equals(userId).toArray()
  if (tasks.length > 0) {
    const { error } = await client.from("tasks").upsert(tasks)
    if (error) throw error
  }

  // Push sessions
  const sessions = await db.sessions.where("user_id").equals(userId).toArray()
  if (sessions.length > 0) {
    const { error } = await client.from("sessions").upsert(sessions)
    if (error) throw error
  }

  // Push time entries
  const entries = await db.timeEntries.where("user_id").equals(userId).toArray()
  if (entries.length > 0) {
    const { error } = await client.from("time_entries").upsert(entries)
    if (error) throw error
  }
}

/**
 * Manual "Sync now" — pull remote, reload stores, flush queue.
 * If Supabase is empty but local has data, pushes everything.
 * Called by the user-facing sync button.
 */
export async function syncNow(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return

  const store = useSyncStore.getState()
  store.setSyncing()

  try {
    await pullFromSupabase()

    // Check if the initial push never landed (e.g., tables were missing
    // when user first signed up). If Supabase has 0 tasks but local has
    // data for this user, do a full push.
    const userId = getCurrentUserId()
    if (userId !== "local") {
      const { count: remoteCount } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
      const localCount = await db.tasks.where("user_id").equals(userId).count()

      if ((remoteCount === null || remoteCount === 0) && localCount > 0) {
        await pushAllToSupabase(userId)
      }
    }

    await reloadStoresFromDexie()
    await flushSyncQueue()

    // If flushSyncQueue set an error, don't overwrite it with "synced"
    if (useSyncStore.getState().status !== "error") {
      store.setSynced()
    }
  } catch (err) {
    const message = extractErrorMessage(err)
    if (message.includes("schema cache") || message.includes("does not exist")) {
      store.setError("Cloud database isn't set up yet. Run the setup SQL in your Supabase SQL Editor (see scripts/setup-db.sql).")
    } else {
      store.setError(`Sync failed: ${message}`)
    }
  }
}

/**
 * Check if there's local data that needs migrating (user_id="local").
 */
export async function hasLocalData(): Promise<boolean> {
  const count = await db.buckets.where("user_id").equals("local").count()
  return count > 0
}
