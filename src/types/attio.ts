// ============================================================================
// Attio API v2 types — Tasks only
// ============================================================================

export interface AttioTaskId {
  workspace_id: string
  task_id: string
}

export interface AttioTask {
  id: AttioTaskId
  content_plaintext: string
  deadline_at: string | null
  is_completed: boolean
  linked_records: AttioLinkedRecord[]
  assignees: AttioActor[]
  created_by_actor: AttioActor
  created_at: string
}

export interface AttioLinkedRecord {
  target_object_id: string
  target_record_id: string
}

export interface AttioActor {
  type?: string
  id?: string
  referenced_actor_type?: string
  referenced_actor_id?: string
}

/** Attio lists (CRM pipeline views — not task lists) */
export interface AttioList {
  id: {
    workspace_id: string
    list_id: string
  }
  api_slug: string
  name: string
  parent_object: string[]
  created_at: string
}

export interface AttioListResponse {
  data: AttioTask[] | AttioList[]
}

/** Self / workspace identity — used for validation */
export interface AttioWorkspace {
  id: { workspace_id: string }
  name: string
}

// ============================================================================
// Error types
// ============================================================================

export type AttioErrorType =
  | "invalid_key"
  | "rate_limited"
  | "network_error"
  | "server_error"
  | "unknown"

export class AttioApiError extends Error {
  constructor(
    message: string,
    public readonly errorType: AttioErrorType,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = "AttioApiError"
  }
}
