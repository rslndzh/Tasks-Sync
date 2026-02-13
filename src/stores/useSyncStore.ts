import { create } from "zustand"

export type SyncStatus = "idle" | "syncing" | "synced" | "error"

interface SyncState {
  /** Current sync lifecycle status */
  status: SyncStatus
  /** Timestamp of last successful sync (ISO string) */
  lastSyncedAt: string | null
  /** Human-readable error message (cleared on next successful sync) */
  error: string | null
  /** Number of items waiting in the offline sync queue */
  pendingCount: number
  /** Whether the initial sync after login has completed */
  hasInitialSynced: boolean

  // Actions
  setSyncing: () => void
  setSynced: () => void
  setError: (message: string) => void
  setPendingCount: (count: number) => void
  setInitialSynced: () => void
  reset: () => void
}

export const useSyncStore = create<SyncState>((set) => ({
  status: "idle",
  lastSyncedAt: null,
  error: null,
  pendingCount: 0,
  hasInitialSynced: false,

  setSyncing: () => set({ status: "syncing", error: null }),

  setSynced: () =>
    set({
      status: "synced",
      lastSyncedAt: new Date().toISOString(),
      error: null,
    }),

  setError: (message) => set({ status: "error", error: message }),

  setPendingCount: (count) => set({ pendingCount: count }),

  setInitialSynced: () => set({ hasInitialSynced: true }),

  reset: () =>
    set({
      status: "idle",
      lastSyncedAt: null,
      error: null,
      pendingCount: 0,
      hasInitialSynced: false,
    }),
}))
