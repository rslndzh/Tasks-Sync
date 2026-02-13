import { useEffect, useRef } from "react"
import { useAuthStore } from "@/stores/useAuthStore"
import { useSyncStore } from "@/stores/useSyncStore"
import { useOnlineStatus } from "@/hooks/useOnlineStatus"
import { isSupabaseConfigured } from "@/lib/supabase"
import {
  pullFromSupabase,
  flushSyncQueue,
  subscribeToRealtime,
  unsubscribeFromRealtime,
  reloadStoresFromDexie,
  pushAllToSupabase,
} from "@/lib/sync"
import { getCurrentUserId } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { db } from "@/lib/db"

/**
 * Orchestrates the Supabase sync lifecycle.
 *
 * - Only runs when authenticated AND Supabase is configured
 * - On mount: pull → reload stores → flush queue → subscribe Realtime
 * - On online (after offline): flush queue
 * - On logout/unmount: unsubscribe Realtime
 */
export function useSupabaseSync() {
  const user = useAuthStore((s) => s.user)
  const isMigrating = useAuthStore((s) => s.isMigrating)
  const isOnline = useOnlineStatus()
  const hasSyncedRef = useRef(false)
  const wasOfflineRef = useRef(false)

  // Initial sync when user becomes authenticated
  useEffect(() => {
    if (!isSupabaseConfigured || !user || isMigrating) return

    // Only do the full pull-flush-subscribe once per session
    if (hasSyncedRef.current) return
    hasSyncedRef.current = true

    const syncStore = useSyncStore.getState()
    syncStore.setSyncing()

    async function initSync() {
      try {
        await pullFromSupabase()

        // If the initial push never landed (e.g., DB tables were missing
        // when user signed up), detect and push all local data now.
        const userId = getCurrentUserId()
        if (userId !== "local" && supabase) {
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
        subscribeToRealtime()

        // If no errors were set during the above operations, mark as synced
        if (useSyncStore.getState().status !== "error") {
          syncStore.setSynced()
        }
        syncStore.setInitialSynced()
      } catch (err) {
        const message = err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err)
        syncStore.setError(`Sync failed: ${message}`)
      }
    }

    void initSync()

    return () => {
      unsubscribeFromRealtime()
      hasSyncedRef.current = false
    }
  }, [user, isMigrating])

  // Flush queue when coming back online
  useEffect(() => {
    if (!isSupabaseConfigured || !user) return

    if (!isOnline) {
      wasOfflineRef.current = true
      return
    }

    if (wasOfflineRef.current) {
      wasOfflineRef.current = false
      const syncStore = useSyncStore.getState()
      syncStore.setSyncing()
      void flushSyncQueue().then(() => {
        if (useSyncStore.getState().status !== "error") {
          syncStore.setSynced()
        }
      })
    }
  }, [isOnline, user])

  // Reset sync store on logout
  useEffect(() => {
    if (!user) {
      useSyncStore.getState().reset()
    }
  }, [user])
}
