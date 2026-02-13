import { useEffect, useRef } from "react"
import { useConnectionStore } from "@/stores/useConnectionStore"
import { useOnlineStatus } from "@/hooks/useOnlineStatus"

const SYNC_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Auto-sync hook — syncs all active connections on mount and every 5 minutes.
 * Skips sync when offline. Syncs sequentially to respect rate limits.
 */
export function useAutoSync() {
  const syncAll = useConnectionStore((s) => s.syncAll)
  const connections = useConnectionStore((s) => s.connections)
  const isLoaded = useConnectionStore((s) => s.isLoaded)
  const isOnline = useOnlineStatus()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasSyncedRef = useRef(false)

  useEffect(() => {
    if (!isLoaded || !isOnline) return

    const activeConnections = connections.filter((c) => c.isActive)
    if (activeConnections.length === 0) return

    // Initial sync on first load
    if (!hasSyncedRef.current) {
      hasSyncedRef.current = true
      void syncAll()
    }

    // Background polling
    intervalRef.current = setInterval(() => {
      if (navigator.onLine) {
        void syncAll()
      }
    }, SYNC_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isLoaded, isOnline, connections, syncAll])
}
