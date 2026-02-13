import type {
  TodoistTask,
  TodoistProject,
  TodoistPaginatedResponse,
} from "@/types/todoist"
import { TodoistApiError } from "@/types/todoist"
import type { InboxItem } from "@/types/inbox"

const TODOIST_API_URL = "https://api.todoist.com/api/v1"

// ============================================================================
// Core REST client
// ============================================================================

async function todoistGet<T>(
  token: string,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${TODOIST_API_URL}${path}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
  }

  let response: Response

  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  } catch {
    throw new TodoistApiError(
      "Could not reach Todoist. Check your connection.",
      "network_error",
    )
  }

  // Rate limit: 450 requests / 15 min
  if (response.status === 429) {
    throw new TodoistApiError(
      "Todoist rate limit hit. Take a breather and try again shortly.",
      "rate_limited",
      429,
    )
  }

  if (response.status === 401 || response.status === 403) {
    throw new TodoistApiError(
      "That Todoist token didn't work. Double-check and try again?",
      "invalid_key",
      response.status,
    )
  }

  if (response.status >= 500) {
    throw new TodoistApiError(
      "Todoist is having a moment. Try again shortly.",
      "server_error",
      response.status,
    )
  }

  if (!response.ok) {
    throw new TodoistApiError(
      `Unexpected response from Todoist (${response.status}).`,
      "unknown",
      response.status,
    )
  }

  return (await response.json()) as T
}

// ============================================================================
// Public API functions
// ============================================================================

/**
 * Validate a Todoist API token by fetching the first task.
 * If the token is invalid, Todoist returns 401/403.
 * On success we return void (token is valid).
 */
export async function validateApiToken(token: string): Promise<void> {
  await todoistGet<TodoistPaginatedResponse<TodoistTask>>(token, "/tasks", {
    limit: "1",
  })
}

/**
 * Fetch all active projects.
 */
export async function fetchProjects(token: string): Promise<TodoistProject[]> {
  const all: TodoistProject[] = []
  let cursor: string | null = null

  do {
    const params: Record<string, string> = { limit: "200" }
    if (cursor) params.cursor = cursor

    const data = await todoistGet<TodoistPaginatedResponse<TodoistProject>>(
      token,
      "/projects",
      params,
    )
    all.push(...data.results)
    cursor = data.next_cursor
  } while (cursor)

  return all
}

/**
 * Fetch all active (non-completed) tasks.
 * Optionally filter by project ID.
 */
export async function fetchActiveTasks(
  token: string,
  projectId?: string,
): Promise<TodoistTask[]> {
  const all: TodoistTask[] = []
  let cursor: string | null = null

  do {
    const params: Record<string, string> = { limit: "200" }
    if (projectId) params.project_id = projectId
    if (cursor) params.cursor = cursor

    const data = await todoistGet<TodoistPaginatedResponse<TodoistTask>>(
      token,
      "/tasks",
      params,
    )
    all.push(...data.results)
    cursor = data.next_cursor
  } while (cursor)

  return all
}

// ============================================================================
// Mapper
// ============================================================================

/**
 * Map a Todoist task to the normalized InboxItem shape.
 * Priority in Todoist: 1 = normal, 2 = medium, 3 = high, 4 = urgent
 */
export function mapTodoistTaskToInboxItem(
  task: TodoistTask,
  connectionId: string,
  projectName?: string,
): InboxItem {
  const priorityLabels: Record<number, string> = {
    1: "",
    2: "Medium",
    3: "High",
    4: "Urgent",
  }
  const priorityLabel = priorityLabels[task.priority] ?? ""
  const parts = [projectName, priorityLabel].filter(Boolean)

  return {
    id: task.id,
    connectionId,
    sourceType: "todoist",
    sourceId: task.id,
    title: task.content,
    subtitle: parts.length > 0 ? parts.join(" · ") : null,
    metadata: {
      projectId: task.project_id,
      projectName,
      priority: task.priority,
      due: task.due,
      labels: task.labels,
      description: task.description,
      duration: task.duration,
    },
    url: `https://todoist.com/showTask?id=${task.id}`,
  }
}
