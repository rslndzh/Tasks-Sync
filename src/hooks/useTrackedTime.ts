import { useMemo } from "react"
import { useSessionStore } from "@/stores/useSessionStore"

/**
 * Builds a map of task_id → total tracked seconds from today's completed time entries.
 * Does NOT include the live elapsed seconds of the active timer —
 * that's added by the component that needs it, using `elapsedSeconds` from the session store.
 * This keeps the map stable and avoids re-computing every tick.
 */
export function useTrackedTimeMap(): Map<string, number> {
  const todayTimeEntries = useSessionStore((s) => s.todayTimeEntries)

  return useMemo(() => {
    const map = new Map<string, number>()
    for (const entry of todayTimeEntries) {
      if (!entry.duration_seconds) continue
      map.set(entry.task_id, (map.get(entry.task_id) ?? 0) + entry.duration_seconds)
    }
    return map
  }, [todayTimeEntries])
}
