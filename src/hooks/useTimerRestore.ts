import { useEffect, useRef } from "react"
import { db } from "@/lib/db"
import { useSessionStore } from "@/stores/useSessionStore"
import { toast } from "sonner"

/**
 * Restore a running timer on app launch.
 *
 * Checks Dexie app_state for an activeSessionId.
 * If found and session was started less than 24h ago,
 * restores the full Zustand state so MiniTimer, TaskCard,
 * and CalendarRail all reflect the active session.
 */
export function useTimerRestore() {
  const didRestore = useRef(false)

  useEffect(() => {
    if (didRestore.current) return
    didRestore.current = true

    async function restore() {
      try {
        const state = await db.appState.get("state")
        if (!state?.activeSessionId || !state.timerStartedAt || !state.activeTaskId) return

        // Check if session is still marked as active in DB
        const session = await db.sessions.get(state.activeSessionId)
        if (!session || !session.is_active) return

        // Check if session was started more than 24h ago
        const hoursElapsed = (Date.now() - state.timerStartedAt) / (1000 * 60 * 60)
        if (hoursElapsed > 24) {
          await db.sessions.update(session.id, {
            ended_at: new Date().toISOString(),
            is_active: false,
          })
          await db.appState.update("state", {
            activeSessionId: null,
            activeTimeEntryId: null,
            activeTaskId: null,
            timerStartedAt: null,
          })
          toast.info("Found a session from a while ago. We've closed it for you.")
          return
        }

        // Find the active time entry (no ended_at)
        const activeEntry = state.activeTimeEntryId
          ? await db.timeEntries.get(state.activeTimeEntryId)
          : null

        // Calculate elapsed seconds since the session started
        const elapsedSeconds = Math.round((Date.now() - state.timerStartedAt) / 1000)

        // Restore full Zustand state — start the interval timer too
        const store = useSessionStore.getState()

        // Clear any stale interval just in case
        if (store.timerIntervalId) {
          clearInterval(store.timerIntervalId)
        }

        const intervalId = setInterval(() => useSessionStore.getState()._tick(), 1000)

        useSessionStore.setState({
          activeSession: session,
          activeTimeEntry: activeEntry ?? null,
          activeTaskId: state.activeTaskId,
          timerMode: "open",
          fixedDurationMinutes: null,
          elapsedSeconds,
          isRunning: true,
          timerIntervalId: intervalId,
        })

        toast.success("Picked up right where you left off. Timer's still going.")
      } catch {
        // Silently fail — not critical
      }
    }

    void restore()
  }, [])
}
