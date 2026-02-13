import { create } from "zustand"
import { db } from "@/lib/db"
import { getCurrentUserId } from "@/lib/auth"
import { queueSync } from "@/lib/sync"
import type { LocalBucket } from "@/types/local"

interface BucketState {
  /** All user buckets, sorted by position */
  buckets: LocalBucket[]
  /** Whether initial load from Dexie is done */
  isLoaded: boolean

  // Actions
  loadBuckets: () => Promise<void>
  addBucket: (name: string, icon?: string, color?: string) => Promise<LocalBucket>
  updateBucket: (id: string, updates: Partial<Pick<LocalBucket, "name" | "icon" | "color">>) => Promise<void>
  deleteBucket: (id: string) => Promise<void>
  reorderBucket: (id: string, newPosition: number) => Promise<void>

  // Selectors (computed from state)
  getDefaultBucket: () => LocalBucket | undefined
  getBucket: (id: string) => LocalBucket | undefined
}

export const useBucketStore = create<BucketState>((set, get) => ({
  buckets: [],
  isLoaded: false,

  loadBuckets: async () => {
    // Use transaction to prevent race condition (React StrictMode double-effect)
    const buckets = await db.transaction("rw", db.buckets, async () => {
      const existing = await db.buckets.orderBy("position").toArray()

      // If no buckets exist (first launch / dev mode), create default Inbox
      if (existing.length === 0) {
        const inbox: LocalBucket = {
          id: crypto.randomUUID(),
          user_id: getCurrentUserId(),
          name: "Inbox",
          icon: null,
          color: null,
          position: 0,
          is_default: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        await db.buckets.put(inbox)
        return [inbox]
      }

      return existing
    })

    set({ buckets, isLoaded: true })
  },

  addBucket: async (name, icon, color) => {
    const { buckets } = get()
    const maxPosition = buckets.length > 0 ? Math.max(...buckets.map((b) => b.position)) : -1

    const bucket: LocalBucket = {
      id: crypto.randomUUID(),
      user_id: getCurrentUserId(),
      name,
      icon: icon ?? null,
      color: color ?? null,
      position: maxPosition + 1,
      is_default: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    await db.buckets.put(bucket)
    set({ buckets: [...buckets, bucket] })

    void queueSync("buckets", "insert", { ...bucket })
    return bucket
  },

  updateBucket: async (id, updates) => {
    const now = new Date().toISOString()
    await db.buckets.update(id, { ...updates, updated_at: now })

    set((state) => ({
      buckets: state.buckets.map((b) =>
        b.id === id ? { ...b, ...updates, updated_at: now } : b,
      ),
    }))

    void queueSync("buckets", "update", { id, ...updates, updated_at: now })
  },

  deleteBucket: async (id) => {
    const bucket = get().getBucket(id)
    if (!bucket || bucket.is_default) return

    // Move orphaned tasks to Inbox
    const defaultBucket = get().getDefaultBucket()
    if (defaultBucket) {
      await db.tasks.where("bucket_id").equals(id).modify({ bucket_id: defaultBucket.id })
    }

    await db.buckets.delete(id)
    set((state) => ({
      buckets: state.buckets.filter((b) => b.id !== id),
    }))

    void queueSync("buckets", "delete", { id })
  },

  reorderBucket: async (id, newPosition) => {
    const { buckets } = get()
    const bucket = buckets.find((b) => b.id === id)
    if (!bucket) return

    const oldPosition = bucket.position
    const updated = buckets.map((b) => {
      if (b.id === id) return { ...b, position: newPosition }
      if (newPosition < oldPosition && b.position >= newPosition && b.position < oldPosition) {
        return { ...b, position: b.position + 1 }
      }
      if (newPosition > oldPosition && b.position > oldPosition && b.position <= newPosition) {
        return { ...b, position: b.position - 1 }
      }
      return b
    })

    // Batch update Dexie
    await db.transaction("rw", db.buckets, async () => {
      for (const b of updated) {
        await db.buckets.update(b.id, { position: b.position })
      }
    })

    set({ buckets: updated.sort((a, b) => a.position - b.position) })

    // Queue position updates for each affected bucket
    for (const b of updated) {
      if (b.position !== buckets.find((orig) => orig.id === b.id)?.position) {
        void queueSync("buckets", "update", { id: b.id, position: b.position })
      }
    }
  },

  getDefaultBucket: () => get().buckets.find((b) => b.is_default),
  getBucket: (id) => get().buckets.find((b) => b.id === id),
}))
