import { create } from "zustand"
import { db, getOrCreateDeviceId } from "@/lib/db"
import type { AppState } from "@/types/local"

export type TodayLane = "now" | "next"

interface LaneUpdateEntry {
  taskId: string
  lane: TodayLane
}

interface TodaySectionsState {
  isLoaded: boolean
  enabled: boolean
  taskLanes: Record<string, TodayLane>
  load: () => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
  setTaskLane: (taskId: string, lane: TodayLane) => Promise<void>
  setTaskLanes: (entries: LaneUpdateEntry[]) => Promise<void>
  setTaskLanesLocal: (entries: LaneUpdateEntry[]) => void
  getTaskLane: (taskId: string) => TodayLane
  pruneTaskLanes: (taskIds: string[]) => Promise<void>
}

function normalizeLaneMap(raw: unknown): Record<string, TodayLane> {
  if (!raw || typeof raw !== "object") return {}
  const entries = Object.entries(raw as Record<string, unknown>)
  const valid = entries.filter(([, lane]) => lane === "now" || lane === "next") as Array<[string, TodayLane]>
  return Object.fromEntries(valid)
}

async function persistState(enabled: boolean, taskLanes: Record<string, TodayLane>): Promise<void> {
  await getOrCreateDeviceId()
  await db.appState.update("state", {
    todaySectionsEnabled: enabled,
    todayLaneByTaskId: taskLanes,
  } as Partial<AppState>)
}

export const useTodaySectionsStore = create<TodaySectionsState>((set, get) => ({
  isLoaded: false,
  enabled: false,
  taskLanes: {},

  load: async () => {
    await getOrCreateDeviceId()
    const state = await db.appState.get("state")
    set({
      isLoaded: true,
      enabled: state?.todaySectionsEnabled ?? false,
      taskLanes: normalizeLaneMap(state?.todayLaneByTaskId),
    })
  },

  setEnabled: async (enabled) => {
    const { taskLanes } = get()
    set({ enabled })
    await persistState(enabled, taskLanes)
  },

  setTaskLane: async (taskId, lane) => {
    const { enabled, taskLanes } = get()
    if (taskLanes[taskId] === lane) return
    const next = { ...taskLanes, [taskId]: lane }
    set({ taskLanes: next })
    await persistState(enabled, next)
  },

  setTaskLanes: async (entries) => {
    if (entries.length === 0) return
    const { enabled, taskLanes } = get()
    let changed = false
    const next = { ...taskLanes }

    for (const entry of entries) {
      if (next[entry.taskId] !== entry.lane) {
        next[entry.taskId] = entry.lane
        changed = true
      }
    }

    if (!changed) return
    set({ taskLanes: next })
    await persistState(enabled, next)
  },

  setTaskLanesLocal: (entries) => {
    if (entries.length === 0) return
    set((state) => {
      const next = { ...state.taskLanes }
      let changed = false
      for (const entry of entries) {
        if (next[entry.taskId] !== entry.lane) {
          next[entry.taskId] = entry.lane
          changed = true
        }
      }
      return changed ? { taskLanes: next } : state
    })
  },

  getTaskLane: (taskId) => get().taskLanes[taskId] ?? "now",

  pruneTaskLanes: async (taskIds) => {
    const idSet = new Set(taskIds)
    const { enabled, taskLanes } = get()
    let changed = false
    const next: Record<string, TodayLane> = {}

    for (const [taskId, lane] of Object.entries(taskLanes)) {
      if (idSet.has(taskId)) {
        next[taskId] = lane
      } else {
        changed = true
      }
    }

    if (!changed) return
    set({ taskLanes: next })
    await persistState(enabled, next)
  },
}))
