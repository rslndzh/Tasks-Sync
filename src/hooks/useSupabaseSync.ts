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

        // Always push all local data on initial sync to ensure Supabase
        // has everything (uses upsert, safe for existing rows).
        const userId = getCurrentUserId()
        if (userId !== "local") {
          await pushAllToSupabase(userId)
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
