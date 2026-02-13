import { create } from "zustand"
import { db } from "@/lib/db"
import { getCurrentUserId } from "@/lib/auth"
import type { ImportRule, ImportRuleSourceFilter } from "@/types/import-rule"
import type { IntegrationType, SectionType } from "@/types/database"

interface ImportRuleState {
  rules: ImportRule[]
  isLoaded: boolean

  // Actions
  loadRules: () => Promise<void>
  addRule: (
    sourceId: string,
    sourceName: string,
    targetBucketId: string,
    targetSection: SectionType,
    integrationType?: IntegrationType,
  ) => Promise<ImportRule>
  updateRule: (id: string, updates: Partial<Pick<ImportRule, "target_bucket_id" | "target_section" | "is_active">>) => Promise<void>
  deleteRule: (id: string) => Promise<void>

  // Selectors
  getActiveRules: () => ImportRule[]
  getRuleForSource: (sourceId: string, type: IntegrationType) => ImportRule | undefined
}

export const useImportRuleStore = create<ImportRuleState>((set, get) => ({
  rules: [],
  isLoaded: false,

  loadRules: async () => {
    const rules = await db.importRules.toArray()
    set({ rules, isLoaded: true })
  },

  addRule: async (sourceId, sourceName, targetBucketId, targetSection, integrationType = "linear") => {
    // Build polymorphic source filter based on provider type
    const source_filter: ImportRuleSourceFilter = {}
    if (integrationType === "linear") {
      source_filter.teamId = sourceId
      source_filter.teamName = sourceName
    } else if (integrationType === "todoist") {
      source_filter.projectId = sourceId
      source_filter.projectName = sourceName
    } else if (integrationType === "attio") {
      source_filter.listId = sourceId
      source_filter.listName = sourceName
    }

    const rule: ImportRule = {
      id: crypto.randomUUID(),
      user_id: getCurrentUserId(),
      integration_type: integrationType,
      source_filter,
      target_bucket_id: targetBucketId,
      target_section: targetSection,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    await db.importRules.put(rule)
    set((state) => ({ rules: [...state.rules, rule] }))
    return rule
  },

  updateRule: async (id, updates) => {
    const now = new Date().toISOString()
    await db.importRules.update(id, { ...updates, updated_at: now })

    set((state) => ({
      rules: state.rules.map((r) =>
        r.id === id ? { ...r, ...updates, updated_at: now } : r,
      ),
    }))
  },

  deleteRule: async (id) => {
    await db.importRules.delete(id)
    set((state) => ({
      rules: state.rules.filter((r) => r.id !== id),
    }))
  },

  getActiveRules: () => get().rules.filter((r) => r.is_active),
  getRuleForSource: (sourceId, type) =>
    get().rules.find(
      (r) =>
        r.is_active &&
        r.integration_type === type &&
        (r.source_filter.teamId === sourceId ||
          r.source_filter.projectId === sourceId ||
          r.source_filter.listId === sourceId),
    ),
}))
