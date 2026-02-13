import { create } from "zustand"
import { db, getOrCreateDeviceId } from "@/lib/db"
import { getCurrentUserId } from "@/lib/auth"
import { queueSync } from "@/lib/sync"
import type { LocalSession, LocalTimeEntry } from "@/types/local"

type TimerMode = "open" | "fixed"

interface SessionState {
  // Active session state
  activeSession: LocalSession | null
  activeTimeEntry: LocalTimeEntry | null
  activeTaskId: string | null
  timerMode: TimerMode
  fixedDurationMinutes: number | null

  // Timer tick state
  elapsedSeconds: number
  isRunning: boolean
  timerIntervalId: ReturnType<typeof setInterval> | null

  // Session history (today)
  todaySessions: LocalSession[]
  todayTimeEntries: LocalTimeEntry[]

  // Actions
  startSession: (taskId: string, mode?: TimerMode, fixedMinutes?: number) => Promise<void>
  switchTask: (taskId: string) => Promise<void>
  stopSession: () => Promise<void>
  loadTodaySessions: () => Promise<void>

  // Internal
  _tick: () => void
  _persistTimerState: () => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSession: null,
  activeTimeEntry: null,
  activeTaskId: null,
  timerMode: "open",
  fixedDurationMinutes: null,
  elapsedSeconds: 0,
  isRunning: false,
  timerIntervalId: null,
  todaySessions: [],
  todayTimeEntries: [],

  startSession: async (taskId, mode = "open", fixedMinutes) => {
    const { isRunning, stopSession } = get()

    // Stop existing session if running
    if (isRunning) {
      await stopSession()
    }

    const deviceId = await getOrCreateDeviceId()
    const now = new Date().toISOString()

    // Create session
    const session: LocalSession = {
      id: crypto.randomUUID(),
      user_id: getCurrentUserId(),
      task_id: taskId,
      started_at: now,
      ended_at: null,
      is_active: true,
      device_id: deviceId,
      created_at: now,
    }

    // Create first time entry
    const timeEntry: LocalTimeEntry = {
      id: crypto.randomUUID(),
      user_id: getCurrentUserId(),
      session_id: session.id,
      task_id: taskId,
      started_at: now,
      ended_at: null,
      duration_seconds: null,
      device_id: deviceId,
      created_at: now,
    }

    await db.sessions.put(session)
    await db.timeEntries.put(timeEntry)

    void queueSync("sessions", "insert", { ...session })
    void queueSync("time_entries", "insert", { ...timeEntry })

    // Start timer
    const intervalId = setInterval(() => get()._tick(), 1000)

    set({
      activeSession: session,
      activeTimeEntry: timeEntry,
      activeTaskId: taskId,
      timerMode: mode,
      fixedDurationMinutes: mode === "fixed" ? (fixedMinutes ?? 25) : null,
      elapsedSeconds: 0,
      isRunning: true,
      timerIntervalId: intervalId,
    })

    // Persist to app_state for crash recovery
    await get()._persistTimerState()
  },

  switchTask: async (taskId) => {
    const { activeSession, activeTimeEntry, isRunning } = get()
    if (!isRunning || !activeSession || !activeTimeEntry) return

    const now = new Date().toISOString()
    const deviceId = await getOrCreateDeviceId()

    // End current time entry
    const startedAt = new Date(activeTimeEntry.started_at).getTime()
    const duration = Math.round((Date.now() - startedAt) / 1000)

    await db.timeEntries.update(activeTimeEntry.id, {
      ended_at: now,
      duration_seconds: duration,
    })

    // Create new time entry under the same session
    const newEntry: LocalTimeEntry = {
      id: crypto.randomUUID(),
      user_id: getCurrentUserId(),
      session_id: activeSession.id,
      task_id: taskId,
      started_at: now,
      ended_at: null,
      duration_seconds: null,
      device_id: deviceId,
      created_at: now,
    }

    await db.timeEntries.put(newEntry)

    void queueSync("time_entries", "update", { id: activeTimeEntry.id, ended_at: now, duration_seconds: duration })
    void queueSync("time_entries", "insert", { ...newEntry })

    set({
      activeTimeEntry: newEntry,
      activeTaskId: taskId,
    })

    await get()._persistTimerState()
  },

  stopSession: async () => {
    const { activeSession, activeTimeEntry, timerIntervalId } = get()
    const now = new Date().toISOString()

    // Clear interval
    if (timerIntervalId) {
      clearInterval(timerIntervalId)
    }

    // End time entry
    if (activeTimeEntry) {
      const startedAt = new Date(activeTimeEntry.started_at).getTime()
      const duration = Math.round((Date.now() - startedAt) / 1000)

      await db.timeEntries.update(activeTimeEntry.id, {
        ended_at: now,
        duration_seconds: duration,
      })
      void queueSync("time_entries", "update", { id: activeTimeEntry.id, ended_at: now, duration_seconds: duration })
    }

    // End session
    if (activeSession) {
      await db.sessions.update(activeSession.id, {
        ended_at: now,
        is_active: false,
      })
      void queueSync("sessions", "update", { id: activeSession.id, ended_at: now, is_active: false })
    }

    // Clear app_state timer
    await db.appState.update("state", {
      activeSessionId: null,
      activeTimeEntryId: null,
      activeTaskId: null,
      timerStartedAt: null,
    })

    set({
      activeSession: null,
      activeTimeEntry: null,
      activeTaskId: null,
      elapsedSeconds: 0,
      isRunning: false,
      timerIntervalId: null,
      fixedDurationMinutes: null,
    })

    // Reload today sessions
    await get().loadTodaySessions()
  },

  loadTodaySessions: async () => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const startIso = startOfDay.toISOString()

    const userId = getCurrentUserId()
    const sessions = await db.sessions
      .where("user_id")
      .equals(userId)
      .filter((s) => s.created_at >= startIso)
      .toArray()

    const sessionIds = sessions.map((s) => s.id)
    const entries = await db.timeEntries
      .where("session_id")
      .anyOf(sessionIds)
      .toArray()

    set({ todaySessions: sessions, todayTimeEntries: entries })

    // Restore active session from synced data (e.g., timer started on another device).
    // Only restore if we don't already have a local timer running.
    const { isRunning } = get()
    if (!isRunning) {
      const activeSession = sessions.find((s) => s.is_active && !s.ended_at)
      if (activeSession) {
        const activeEntry = entries
          .filter((e) => e.session_id === activeSession.id && !e.ended_at)
          .sort((a, b) => b.started_at.localeCompare(a.started_at))[0]

        if (activeEntry) {
          const elapsed = Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000)
          const intervalId = setInterval(() => get()._tick(), 1000)

          set({
            activeSession,
            activeTimeEntry: activeEntry,
            activeTaskId: activeEntry.task_id,
            timerMode: "open",
            fixedDurationMinutes: null,
            elapsedSeconds: Math.max(0, elapsed),
            isRunning: true,
            timerIntervalId: intervalId,
          })
        }
      }
    }
  },

  _tick: () => {
    const { elapsedSeconds, timerMode, fixedDurationMinutes, stopSession } = get()
    const newElapsed = elapsedSeconds + 1

    set({ elapsedSeconds: newElapsed })

    // Auto-stop for fixed timer
    if (timerMode === "fixed" && fixedDurationMinutes) {
      if (newElapsed >= fixedDurationMinutes * 60) {
        void stopSession()
      }
    }

    // Persist every 5 seconds
    if (newElapsed % 5 === 0) {
      void get()._persistTimerState()
    }
  },

  _persistTimerState: async () => {
    const { activeSession, activeTimeEntry, activeTaskId } = get()
    await db.appState.update("state", {
      activeSessionId: activeSession?.id ?? null,
      activeTimeEntryId: activeTimeEntry?.id ?? null,
      activeTaskId: activeTaskId,
      timerStartedAt: activeSession
        ? new Date(activeSession.started_at).getTime()
        : null,
    })
  },
}))
