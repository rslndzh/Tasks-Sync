import { create } from "zustand"
import { db } from "@/lib/db"
import { getCurrentUserId } from "@/lib/auth"
import { queueSync } from "@/lib/sync"
import type { LocalTask } from "@/types/local"
import type { SectionType } from "@/types/database"

interface TaskState {
  /** All active tasks */
  tasks: LocalTask[]
  /** Whether initial load from Dexie is done */
  isLoaded: boolean
  /** Currently focused task ID (for keyboard navigation) */
  selectedTaskId: string | null
  /** Multi-select: set of task IDs for batch DnD */
  selectedTaskIds: Set<string>
  /** Anchor task ID for Shift+Arrow range selection (start of range) */
  selectionAnchorId: string | null

  // Actions
  loadTasks: () => Promise<void>
  addTask: (title: string, bucketId: string, section?: SectionType) => Promise<LocalTask>
  updateTask: (id: string, updates: Partial<Pick<LocalTask, "title" | "description" | "estimate_minutes">>) => Promise<void>
  completeTask: (id: string) => Promise<void>
  uncompleteTask: (id: string) => Promise<void>
  archiveTask: (id: string) => Promise<void>
  moveToSection: (id: string, section: SectionType) => Promise<void>
  moveToBucket: (id: string, bucketId: string) => Promise<void>
  setSelectedTask: (id: string | null) => void

  // Multi-select actions
  toggleSelectTask: (id: string, multi: boolean) => void
  selectRange: (fromId: string, toId: string, orderedIds: string[]) => void
  clearSelection: () => void

  // DnD reorder actions
  /** In-memory-only move — used during drag to update SortableContexts without Dexie writes */
  moveTaskLocal: (id: string, updates: { section?: SectionType; bucket_id?: string; position?: number }) => void
  /** Batch in-memory move — moves multiple tasks at once in a single state update */
  moveTasksLocal: (entries: Array<{ id: string; updates: { section?: SectionType; bucket_id?: string; position?: number } }>) => void
  reorderTask: (id: string, newPosition: number, newBucketId?: string, newSection?: SectionType) => Promise<void>
  moveTasksBatch: (ids: string[], targetBucketId: string, targetSection: SectionType, insertPosition?: number) => Promise<void>

  // Selectors
  getTasksByBucket: (bucketId: string) => LocalTask[]
  getTasksByBucketAndSection: (bucketId: string, section: SectionType) => LocalTask[]
  getTodayTasks: () => LocalTask[]
  getUnbucketedTasks: () => LocalTask[]
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  isLoaded: false,
  selectedTaskId: null,
  selectedTaskIds: new Set<string>(),
  selectionAnchorId: null,

  loadTasks: async () => {
    const tasks = await db.tasks.where("status").equals("active").toArray()
    set({ tasks, isLoaded: true })
  },

  addTask: async (title, bucketId, section = "sooner") => {
    const { tasks } = get()

    // Calculate position: last in this bucket+section
    const siblingCount = tasks.filter(
      (t) => t.bucket_id === bucketId && t.section === section,
    ).length

    const task: LocalTask = {
      id: crypto.randomUUID(),
      user_id: getCurrentUserId(),
      title,
      description: null,
      source_description: null,
      status: "active",
      source: "manual",
      source_id: null,
      bucket_id: bucketId,
      section,
      estimate_minutes: null,
      position: siblingCount,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    }

    await db.tasks.put(task)
    set({ tasks: [...tasks, task] })

    void queueSync("tasks", "insert", { ...task })
    return task
  },

  updateTask: async (id, updates) => {
    const now = new Date().toISOString()
    await db.tasks.update(id, { ...updates, updated_at: now })

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...updates, updated_at: now } : t,
      ),
    }))

    void queueSync("tasks", "update", { id, ...updates, updated_at: now })
  },

  completeTask: async (id) => {
    const now = new Date().toISOString()
    await db.tasks.update(id, {
      status: "completed",
      completed_at: now,
      updated_at: now,
    })

    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
      selectedTaskIds: removeFromSet(state.selectedTaskIds, id),
    }))

    void queueSync("tasks", "update", { id, status: "completed", completed_at: now, updated_at: now })
  },

  uncompleteTask: async (id) => {
    const now = new Date().toISOString()
    const task = await db.tasks.get(id)
    if (!task) return

    await db.tasks.update(id, {
      status: "active",
      completed_at: null,
      updated_at: now,
    })

    const updated = { ...task, status: "active" as const, completed_at: null, updated_at: now }
    set((state) => ({
      tasks: [...state.tasks, updated],
    }))

    void queueSync("tasks", "update", { id, status: "active", completed_at: null, updated_at: now })
  },

  archiveTask: async (id) => {
    const now = new Date().toISOString()
    await db.tasks.update(id, { status: "archived", updated_at: now })

    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
      selectedTaskIds: removeFromSet(state.selectedTaskIds, id),
    }))

    void queueSync("tasks", "update", { id, status: "archived", updated_at: now })
  },

  moveToSection: async (id, section) => {
    const now = new Date().toISOString()
    await db.tasks.update(id, { section, updated_at: now })

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, section, updated_at: now } : t,
      ),
    }))

    void queueSync("tasks", "update", { id, section, updated_at: now })
  },

  moveToBucket: async (id, bucketId) => {
    const now = new Date().toISOString()
    await db.tasks.update(id, { bucket_id: bucketId, updated_at: now })

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, bucket_id: bucketId, updated_at: now } : t,
      ),
    }))

    void queueSync("tasks", "update", { id, bucket_id: bucketId, updated_at: now })
  },

  setSelectedTask: (id) => set({ selectedTaskId: id }),

  // --- Multi-select ---

  toggleSelectTask: (id, multi) => {
    set((state) => {
      if (!multi) {
        // Plain click/arrow — select only this task, reset anchor
        return {
          selectedTaskId: id,
          selectedTaskIds: new Set([id]),
          selectionAnchorId: null,
        }
      }
      // Cmd/Ctrl+click — toggle in/out of set, reset anchor
      const next = new Set(state.selectedTaskIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return {
        selectedTaskId: next.size > 0 ? id : null,
        selectedTaskIds: next,
        selectionAnchorId: null,
      }
    })
  },

  selectRange: (fromId, toId, orderedIds) => {
    set((state) => {
      // First Shift+Arrow: anchor is the currently focused task
      const anchor = state.selectionAnchorId ?? fromId
      const anchorIdx = orderedIds.indexOf(anchor)
      const endIdx = orderedIds.indexOf(toId)
      if (anchorIdx === -1 || endIdx === -1) return state
      const lo = Math.min(anchorIdx, endIdx)
      const hi = Math.max(anchorIdx, endIdx)
      const rangeIds = orderedIds.slice(lo, hi + 1)
      return {
        selectedTaskId: toId,
        selectedTaskIds: new Set(rangeIds),
        selectionAnchorId: anchor,
      }
    })
  },

  clearSelection: () => set({ selectedTaskId: null, selectedTaskIds: new Set(), selectionAnchorId: null }),

  // --- DnD reorder ---

  moveTaskLocal: (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
      ),
    }))
  },

  moveTasksLocal: (entries) => {
    if (entries.length === 0) return
    const updateMap = new Map(entries.map((e) => [e.id, e.updates]))
    set((state) => ({
      tasks: state.tasks.map((t) => {
        const u = updateMap.get(t.id)
        return u ? { ...t, ...u } : t
      }),
    }))
  },

  reorderTask: async (id, newPosition, newBucketId, newSection) => {
    const now = new Date().toISOString()
    const updates: Partial<LocalTask> = { position: newPosition, updated_at: now }
    if (newBucketId !== undefined) updates.bucket_id = newBucketId
    if (newSection !== undefined) updates.section = newSection

    await db.tasks.update(id, updates)

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
      ),
    }))

    void queueSync("tasks", "update", { id, ...updates })
  },

  moveTasksBatch: async (ids, targetBucketId, targetSection, insertPosition = 0) => {
    const now = new Date().toISOString()
    const { tasks } = get()

    // Calculate how many tasks already exist in the target container
    const existingInTarget = tasks
      .filter((t) => t.bucket_id === targetBucketId && t.section === targetSection && !ids.includes(t.id))
      .sort((a, b) => a.position - b.position)

    // Build new positions: existing tasks that come before insert point, then the moved tasks, then the rest
    const before = existingInTarget.filter((_, i) => i < insertPosition)
    const after = existingInTarget.filter((_, i) => i >= insertPosition)
    const movedTasks = ids.map((taskId) => tasks.find((t) => t.id === taskId)).filter(Boolean) as LocalTask[]

    // Batch Dexie writes
    const allUpdates: Array<{ id: string; changes: Partial<LocalTask> }> = []

    before.forEach((t, i) => {
      allUpdates.push({ id: t.id, changes: { position: i, updated_at: now } })
    })
    movedTasks.forEach((t, i) => {
      allUpdates.push({
        id: t.id,
        changes: {
          position: before.length + i,
          bucket_id: targetBucketId,
          section: targetSection,
          updated_at: now,
        },
      })
    })
    after.forEach((t, i) => {
      allUpdates.push({ id: t.id, changes: { position: before.length + movedTasks.length + i, updated_at: now } })
    })

    // Persist to Dexie in a single transaction
    await db.transaction("rw", db.tasks, async () => {
      for (const { id, changes } of allUpdates) {
        await db.tasks.update(id, changes)
      }
    })

    // Apply to Zustand
    const changeMap = new Map(allUpdates.map(({ id, changes }) => [id, changes]))
    set((state) => ({
      tasks: state.tasks.map((t) => {
        const changes = changeMap.get(t.id)
        return changes ? { ...t, ...changes } : t
      }),
    }))

    // Queue each updated task for sync
    for (const { id, changes } of allUpdates) {
      void queueSync("tasks", "update", { id, ...changes })
    }
  },

  // --- Selectors ---

  getTasksByBucket: (bucketId) =>
    get()
      .tasks.filter((t) => t.bucket_id === bucketId)
      .sort((a, b) => a.position - b.position),

  getTasksByBucketAndSection: (bucketId, section) =>
    get()
      .tasks.filter((t) => t.bucket_id === bucketId && t.section === section)
      .sort((a, b) => a.position - b.position),

  getTodayTasks: () =>
    get()
      .tasks.filter((t) => t.section === "today")
      .sort((a, b) => a.position - b.position),

  getUnbucketedTasks: () =>
    get()
      .tasks.filter((t) => t.bucket_id === null)
      .sort((a, b) => a.position - b.position),
}))

/** Immutable Set helper — returns a new Set without the given id */
function removeFromSet(s: Set<string>, id: string): Set<string> {
  if (!s.has(id)) return s
  const next = new Set(s)
  next.delete(id)
  return next
}
