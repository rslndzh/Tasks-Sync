import type { IntegrationType, SectionType, TaskSource, TaskStatus, TodayLaneType } from "./database"

/**
 * Local-only types for Dexie (IndexedDB).
 * These mirror Supabase tables for offline reads, plus local-only stores.
 */

// ============================================================================
// Mirrors of Supabase tables (for offline reads)
// ============================================================================

export interface LocalBucket {
  id: string
  user_id: string
  name: string
  icon: string | null
  color: string | null
  position: number
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface LocalTask {
  id: string
  user_id: string
  title: string
  /** User's own notes (editable via Tiptap WYSIWYG) */
  description: string | null
  /** Original description from integration provider (read-only) */
  source_description: string | null
  status: TaskStatus
  source: TaskSource
  source_id: string | null
  /** Which integration connection imported this task (null for manual) */
  connection_id: string | null
  bucket_id: string | null
  section: SectionType
  today_lane: TodayLaneType | null
  estimate_minutes: number | null
  position: number
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface LocalSession {
  id: string
  user_id: string
  task_id: string
  started_at: string
  ended_at: string | null
  is_active: boolean
  device_id: string
  created_at: string
}

export interface LocalTimeEntry {
  id: string
  user_id: string
  session_id: string
  task_id: string
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  device_id: string
  created_at: string
}

// ============================================================================
// Local-only stores (NEVER synced to Supabase)
// ============================================================================

/** API keys stored locally, encrypted at rest */
export interface IntegrationKey {
  integrationId: string
  type: IntegrationType
  apiKey: string
}

/**
 * Multi-connection model — supports multiple connections per provider.
 * e.g. two Linear workspaces, personal + work Todoist, etc.
 */
export interface IntegrationConnection {
  id: string
  type: IntegrationType
  /** User-visible label: "Linear (Work)", "Todoist (Personal)" */
  label: string
  apiKey: string
  /** Provider-specific data: workspaceName, userId, teams, etc. */
  metadata: Record<string, unknown>
  isActive: boolean
  created_at: string

  // ---- Default mapping ----
  /** When set, newly synced items auto-import into this bucket */
  defaultBucketId: string | null
  /** Default section for auto-imported items */
  defaultSection: SectionType | null
  /** When true, items matching this connection auto-import on sync */
  autoImport: boolean
}

/** Offline mutation queue — pending changes to push to Supabase */
export interface SyncQueueItem {
  id: string
  table: "buckets" | "tasks" | "sessions" | "time_entries" | "integrations" | "import_rules" | "profiles"
  operation: "insert" | "update" | "delete"
  payload: Record<string, unknown>
  createdAt: number
  retryCount: number
}

/** Ephemeral app state that persists across restarts */
export interface AppState {
  key: "state"
  activeSessionId: string | null
  activeTimeEntryId: string | null
  activeTaskId: string | null
  timerStartedAt: number | null
  currentView: string
  deviceId: string
  /** Active right-rail panel: "calendar" | connectionId | null (collapsed) */
  rightRailPanel: string | null
  /** Optional Today split-list feature toggle */
  todaySectionsEnabled?: boolean
  /** Local lane assignment for Today tasks when split mode is enabled */
  todayLaneByTaskId?: Record<string, "now" | "next">
}
