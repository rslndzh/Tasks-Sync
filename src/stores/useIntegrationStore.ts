import { create } from "zustand"
import { db } from "@/lib/db"
import { queueSync } from "@/lib/sync"
import type { IntegrationKey } from "@/types/local"
import type { LinearTeam, LinearUser } from "@/types/linear"
import type { TodayLaneType } from "@/types/database"
import { validateApiKey, fetchTeams, fetchAssignedIssues, mapLinearIssueToTask } from "@/integrations/linear"
import type { LinearIssue } from "@/types/linear"

interface IntegrationState {
  // Linear connection
  linearApiKey: string | null
  linearUser: LinearUser | null
  linearTeams: LinearTeam[]
  isLinearConnected: boolean

  // Sync state
  isSyncing: boolean
  lastSyncedAt: number | null
  syncError: string | null

  // Fetched but not-yet-imported Linear issues
  linearIssues: LinearIssue[]

  // Actions
  loadIntegrationKeys: () => Promise<void>
  connectLinear: (apiKey: string) => Promise<LinearUser>
  disconnectLinear: () => Promise<void>
  syncLinearIssues: () => Promise<void>
  importIssueToTask: (issue: LinearIssue, bucketId: string, section?: string) => Promise<void>
}

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  linearApiKey: null,
  linearUser: null,
  linearTeams: [],
  isLinearConnected: false,
  isSyncing: false,
  lastSyncedAt: null,
  syncError: null,
  linearIssues: [],

  loadIntegrationKeys: async () => {
    const key = await db.integrationKeys.get("linear")
    if (key) {
      set({ linearApiKey: key.apiKey, isLinearConnected: true })
      // Validate + load teams in background
      try {
        const user = await validateApiKey(key.apiKey)
        const teams = await fetchTeams(key.apiKey)
        set({ linearUser: user, linearTeams: teams })
      } catch {
        // Key might be expired — keep the key but mark error
        set({ syncError: "Linear key may be expired. Please re-enter." })
      }
    }
  },

  connectLinear: async (apiKey: string) => {
    const user = await validateApiKey(apiKey)
    const teams = await fetchTeams(apiKey)

    // Store key locally (never sent to Supabase)
    const integrationKey: IntegrationKey = {
      integrationId: "linear",
      type: "linear",
      apiKey,
    }
    await db.integrationKeys.put(integrationKey)

    set({
      linearApiKey: apiKey,
      linearUser: user,
      linearTeams: teams,
      isLinearConnected: true,
      syncError: null,
    })

    return user
  },

  disconnectLinear: async () => {
    await db.integrationKeys.delete("linear")
    set({
      linearApiKey: null,
      linearUser: null,
      linearTeams: [],
      isLinearConnected: false,
      linearIssues: [],
      syncError: null,
    })
  },

  syncLinearIssues: async () => {
    const { linearApiKey, isLinearConnected } = get()
    if (!isLinearConnected || !linearApiKey) return

    set({ isSyncing: true, syncError: null })

    try {
      const issues = await fetchAssignedIssues(linearApiKey)

      // Filter out issues already imported as tasks
      const existingSourceIds = new Set(
        (await db.tasks.where("source").equals("linear").toArray()).map(
          (t) => t.source_id,
        ),
      )

      const newIssues = issues.filter((i) => !existingSourceIds.has(i.id))

      set({
        linearIssues: newIssues,
        isSyncing: false,
        lastSyncedAt: Date.now(),
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Sync failed. Please try again."
      set({ isSyncing: false, syncError: message })
    }
  },

  importIssueToTask: async (issue, bucketId, section = "sooner") => {
    const taskData = mapLinearIssueToTask(issue, "local")
    const existingTasks = await db.tasks
      .where("source_id")
      .equals(issue.id)
      .toArray()

    if (existingTasks.length > 0) return // Already imported

    const task = {
      ...taskData,
      bucket_id: bucketId,
      section: section as "today" | "sooner" | "later",
      today_lane: section === "today" ? ("now" as TodayLaneType) : null,
      position: 0,
    }

    const taskCount: number = await db.tasks
      .where("[user_id+bucket_id]")
      .equals([task.user_id, bucketId])
      .count()

    task.position = taskCount

    await db.tasks.put(task)
    void queueSync("tasks", "insert", task as unknown as Record<string, unknown>)

    // Remove from linearIssues
    set((state) => ({
      linearIssues: state.linearIssues.filter((i) => i.id !== issue.id),
    }))
  },
}))
