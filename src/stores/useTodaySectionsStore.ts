import { create } from "zustand"
import { db, getOrCreateDeviceId } from "@/lib/db"
import { queueSync } from "@/lib/sync"
import { useAuthStore } from "@/stores/useAuthStore"
import { useTaskStore } from "@/stores/useTaskStore"
import type { AppState, LocalTask } from "@/types/local"

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
  applyProfileEnabled: (enabled: boolean | null | undefined) => Promise<void>
  syncFromTasks: (tasks: LocalTask[]) => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
  setTaskLane: (taskId: string, lane: TodayLane) => Promise<void>
  setTaskLanes: (entries: LaneUpdateEntry[]) => Promise<void>
  setTaskLanesLocal: (entries: LaneUpdateEntry[]) => void
  getTaskLane: (taskId: string) => TodayLane
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

function areLaneMapsEqual(a: Record<string, TodayLane>, b: Record<string, TodayLane>): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false
  }
  return true
}

function buildLaneMapFromTasks(tasks: LocalTask[], fallbackMap: Record<string, TodayLane>): Record<string, TodayLane> {
  const next: Record<string, TodayLane> = {}
  for (const task of tasks) {
    if (task.section !== "today") continue
    if (task.today_lane === "now" || task.today_lane === "next") {
      next[task.id] = task.today_lane
      continue
    }
    const fallback = fallbackMap[task.id]
    if (fallback === "now" || fallback === "next") {
      next[task.id] = fallback
    }
  }
  return next
}

export const useTodaySectionsStore = create<TodaySectionsState>((set, get) => ({
  isLoaded: false,
  enabled: false,
  taskLanes: {},

  load: async () => {
    await getOrCreateDeviceId()
    const [state, tasks] = await Promise.all([
      db.appState.get("state"),
      db.tasks.where("status").equals("active").toArray(),
    ])
    const appLaneMap = normalizeLaneMap(state?.todayLaneByTaskId)
    const mergedLaneMap = buildLaneMapFromTasks(tasks, appLaneMap)
    const profileEnabled = useAuthStore.getState().profile?.today_sections_enabled
    const nextEnabled = profileEnabled ?? state?.todaySectionsEnabled ?? false

    set({
      isLoaded: true,
      enabled: nextEnabled,
      taskLanes: mergedLaneMap,
    })

    if (!areLaneMapsEqual(appLaneMap, mergedLaneMap)) {
      await persistState(nextEnabled, mergedLaneMap)
    }

    // Backfill legacy local lane assignments into tasks.today_lane
    // so they can sync across devices.
    const backfillEntries: LaneUpdateEntry[] = tasks
      .filter((task) => task.section === "today" && task.today_lane == null)
      .map((task) => {
        const lane = mergedLaneMap[task.id]
        return lane ? { taskId: task.id, lane } : null
      })
      .filter(Boolean) as LaneUpdateEntry[]
    if (backfillEntries.length > 0) {
      await get().setTaskLanes(backfillEntries)
    }
  },

  applyProfileEnabled: async (enabledFromProfile) => {
    if (enabledFromProfile == null) return
    const { enabled, taskLanes } = get()
    if (enabled === enabledFromProfile) return
    set({ enabled: enabledFromProfile })
    await persistState(enabledFromProfile, taskLanes)
  },

  syncFromTasks: async (tasks) => {
    const { enabled, taskLanes } = get()
    const nextMap = buildLaneMapFromTasks(tasks, taskLanes)
    if (areLaneMapsEqual(taskLanes, nextMap)) return
    set({ taskLanes: nextMap })
    await persistState(enabled, nextMap)
  },

  setEnabled: async (enabled) => {
    const { taskLanes } = get()
    set({ enabled })
    await persistState(enabled, taskLanes)
    await useAuthStore.getState().patchProfile({ today_sections_enabled: enabled })
  },

  setTaskLane: async (taskId, lane) => get().setTaskLanes([{ taskId, lane }]),

  setTaskLanes: async (entries) => {
    if (entries.length === 0) return
    const { enabled, taskLanes } = get()
    const tasks = useTaskStore.getState().tasks
    const taskMap = new Map(tasks.map((task) => [task.id, task]))
    const now = new Date().toISOString()
    const nextMap = { ...taskLanes }
    const persistEntries: Array<{ taskId: string; lane: TodayLane }> = []

    for (const entry of entries) {
      const task = taskMap.get(entry.taskId)
      if (!task) continue
      if (task.section !== "today") continue
      if (task.today_lane === entry.lane && nextMap[entry.taskId] === entry.lane) continue
      nextMap[entry.taskId] = entry.lane
      persistEntries.push(entry)
    }

    if (persistEntries.length === 0) return

    set({ taskLanes: nextMap })
    useTaskStore.getState().moveTasksLocal(
      persistEntries.map((entry) => ({
        id: entry.taskId,
        updates: { today_lane: entry.lane, updated_at: now },
      })),
    )
    await persistState(enabled, nextMap)

    await db.transaction("rw", db.tasks, async () => {
      for (const entry of persistEntries) {
        await db.tasks.update(entry.taskId, { today_lane: entry.lane, updated_at: now })
      }
    })

    for (const entry of persistEntries) {
      void queueSync("tasks", "update", { id: entry.taskId, today_lane: entry.lane, updated_at: now })
    }
  },

  setTaskLanesLocal: (entries) => {
    if (entries.length === 0) return
    useTaskStore.getState().moveTasksLocal(
      entries.map((entry) => ({
        id: entry.taskId,
        updates: { today_lane: entry.lane },
      })),
    )
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
}))
