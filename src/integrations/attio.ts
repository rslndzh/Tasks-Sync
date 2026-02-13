import type { AttioTask } from "@/types/attio"
import { AttioApiError } from "@/types/attio"
import type { InboxItem } from "@/types/inbox"

const ATTIO_API_URL = "https://api.attio.com/v2"

// ============================================================================
// Core REST client
// ============================================================================

async function attioGet<T>(
  apiKey: string,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${ATTIO_API_URL}${path}`)
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
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    })
  } catch {
    throw new AttioApiError(
      "Could not reach Attio. Check your connection.",
      "network_error",
    )
  }

  if (response.status === 429) {
    throw new AttioApiError(
      "Attio rate limit hit. Try again shortly.",
      "rate_limited",
      429,
    )
  }

  if (response.status === 401 || response.status === 403) {
    throw new AttioApiError(
      "That Attio key didn't work. Double-check and try again?",
      "invalid_key",
      response.status,
    )
  }

  if (response.status >= 500) {
    throw new AttioApiError(
      "Attio is having a moment. Try again shortly.",
      "server_error",
      response.status,
    )
  }

  if (!response.ok) {
    throw new AttioApiError(
      `Unexpected response from Attio (${response.status}).`,
      "unknown",
      response.status,
    )
  }

  return (await response.json()) as T
}

async function attioPatch<T>(
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${ATTIO_API_URL}${path}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new AttioApiError(
      "Could not reach Attio. Check your connection.",
      "network_error",
    )
  }

  if (response.status === 429) {
    throw new AttioApiError(
      "Attio rate limit hit. Try again shortly.",
      "rate_limited",
      429,
    )
  }

  if (response.status === 401 || response.status === 403) {
    throw new AttioApiError(
      "That Attio key didn't work. Double-check and try again?",
      "invalid_key",
      response.status,
    )
  }

  if (response.status >= 500) {
    throw new AttioApiError(
      "Attio is having a moment. Try again shortly.",
      "server_error",
      response.status,
    )
  }

  if (!response.ok) {
    throw new AttioApiError(
      `Unexpected response from Attio (${response.status}).`,
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
 * Validate an Attio API key by fetching tasks with limit=1.
 * If the key is invalid, Attio returns 401/403.
 */
export async function validateApiKey(apiKey: string): Promise<void> {
  await attioGet<{ data: AttioTask[] }>(apiKey, "/tasks", { limit: "1" })
}

/**
 * Fetch all incomplete tasks.
 * Attio tasks are workspace-global (no "task lists" in the traditional sense).
 * We paginate through using offset.
 */
export async function fetchTasks(apiKey: string): Promise<AttioTask[]> {
  const all: AttioTask[] = []
  let offset = 0
  const limit = 500

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- pagination loop
  while (true) {
    const data = await attioGet<{ data: AttioTask[] }>(apiKey, "/tasks", {
      limit: String(limit),
      offset: String(offset),
      is_completed: "false",
      sort: "created_at:desc",
    })

    all.push(...data.data)

    // If we got fewer than limit, we've reached the end
    if (data.data.length < limit) break
    offset += limit
  }

  return all
}

// ============================================================================
// Write operations (two-way sync)
// ============================================================================

/** Complete a task in Attio. */
export async function closeAttioTask(apiKey: string, taskId: string): Promise<void> {
  await attioPatch(apiKey, `/tasks/${taskId}`, { data: { is_completed: true } })
}

/** Reopen a completed task in Attio. */
export async function reopenAttioTask(apiKey: string, taskId: string): Promise<void> {
  await attioPatch(apiKey, `/tasks/${taskId}`, { data: { is_completed: false } })
}

// ============================================================================
// Mapper
// ============================================================================

/**
 * Map an Attio task to the normalized InboxItem shape.
 */
export function mapAttioTaskToInboxItem(
  task: AttioTask,
  connectionId: string,
): InboxItem {
  const deadlinePart = task.deadline_at
    ? `Due ${new Date(task.deadline_at).toLocaleDateString()}`
    : null
  const assigneeCount = task.assignees.length
  const assigneePart =
    assigneeCount > 0 ? `${assigneeCount} assignee${assigneeCount > 1 ? "s" : ""}` : null

  const parts = [deadlinePart, assigneePart].filter(Boolean)

  return {
    id: task.id.task_id,
    connectionId,
    sourceType: "attio",
    sourceId: task.id.task_id,
    title: task.content_plaintext,
    subtitle: parts.length > 0 ? parts.join(" · ") : null,
    metadata: {
      workspaceId: task.id.workspace_id,
      deadlineAt: task.deadline_at,
      linkedRecords: task.linked_records,
      assignees: task.assignees,
      createdAt: task.created_at,
    },
    url: null, // Attio doesn't have a direct task URL pattern
  }
}
