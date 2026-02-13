// ============================================================================
// Todoist REST API v1 types
// ============================================================================

export interface TodoistTask {
  id: string
  user_id: string
  project_id: string
  section_id: string | null
  parent_id: string | null
  content: string
  description: string
  priority: number // 1 = normal, 4 = urgent (inverted from UI display)
  due: TodoistDue | null
  labels: string[]
  checked: boolean
  is_deleted: boolean
  added_at: string
  completed_at: string | null
  updated_at: string
  child_order: number
  day_order: number
  duration: TodoistDuration | null
}

export interface TodoistDue {
  date: string
  string: string
  lang: string
  is_recurring?: boolean
  datetime?: string
  timezone?: string
}

export interface TodoistDuration {
  amount: number
  unit: "minute" | "day"
}

export interface TodoistProject {
  id: string
  name: string
  description: string
  color: string
  parent_id: string | null
  child_order: number
  is_favorite: boolean
  is_archived: boolean
  is_deleted: boolean
  inbox_project: boolean
  created_at: string
  updated_at: string
}

export interface TodoistUser {
  id: string
  name: string
  email: string
}

/** Paginated response from Todoist v1 API */
export interface TodoistPaginatedResponse<T> {
  results: T[]
  next_cursor: string | null
}

// ============================================================================
// Error types
// ============================================================================

export type TodoistErrorType =
  | "invalid_key"
  | "rate_limited"
  | "network_error"
  | "server_error"
  | "unknown"

export class TodoistApiError extends Error {
  constructor(
    message: string,
    public readonly errorType: TodoistErrorType,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = "TodoistApiError"
  }
}
