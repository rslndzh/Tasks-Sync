/**
 * Two-way sync writeback — pushes task status changes back to the source provider.
 *
 * Used by completeTask/uncompleteTask with optimistic rollback:
 * 1. Task is completed/uncompleted locally (instant UI feedback)
 * 2. This module fires the provider API call
 * 3. On failure, the caller rolls the task back and shows an error toast
 */
import { db } from "@/lib/db"
import { closeTodoistTask, reopenTodoistTask } from "@/integrations/todoist"
import { fetchIssueTeamId, updateLinearIssueState } from "@/integrations/linear"
import { closeAttioTask, reopenAttioTask } from "@/integrations/attio"
import type { LocalTask, IntegrationConnection } from "@/types/local"

interface WritebackResult {
  ok: boolean
  error?: string
}

/**
 * Push a completion or reopen to the source provider.
 * Returns `{ ok: true }` on success, `{ ok: false, error }` on failure.
 */
export async function writebackCompletion(
  task: LocalTask,
  completed: boolean,
): Promise<WritebackResult> {
  if (task.source === "manual" || !task.source_id) {
    return { ok: true }
  }

  try {
    const conn = await resolveConnection(task)
    if (!conn) {
      // Connection was deleted — skip writeback, let local change stand
      return { ok: true }
    }

    switch (task.source) {
      case "todoist":
        if (completed) {
          await closeTodoistTask(conn.apiKey, task.source_id)
        } else {
          await reopenTodoistTask(conn.apiKey, task.source_id)
        }
        break

      case "linear": {
        const stateId = await resolveLinearStateId(conn, task, completed)
        if (!stateId) {
          // No cached state — skip writeback, sync the connection first to populate states
          return { ok: true }
        }
        await updateLinearIssueState(conn.apiKey, task.source_id, stateId)
        break
      }

      case "attio":
        if (completed) {
          await closeAttioTask(conn.apiKey, task.source_id)
        } else {
          await reopenAttioTask(conn.apiKey, task.source_id)
        }
        break
    }

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went sideways. Try again?"
    return { ok: false, error: message }
  }
}

/**
 * Find the connection that owns this task.
 * Prefers `connection_id` direct lookup, falls back to first matching connection by type.
 */
async function resolveConnection(task: LocalTask): Promise<IntegrationConnection | undefined> {
  if (task.connection_id) {
    return db.connections.get(task.connection_id)
  }
  // Fallback for tasks imported before connection_id was added
  const matches = await db.connections.where("type").equals(task.source).toArray()
  return matches[0]
}

/**
 * Resolve the Linear workflow state ID for completing or reopening an issue.
 * Uses cached teamDoneStates / teamStartedStates from connection metadata.
 */
async function resolveLinearStateId(
  conn: IntegrationConnection,
  task: LocalTask,
  completed: boolean,
): Promise<string | undefined> {
  if (!task.source_id) return undefined

  const metadata = conn.metadata as Record<string, unknown>

  // teamDoneStates: { [teamId]: stateId } — cached during sync
  const stateMap = completed
    ? (metadata.teamDoneStates as Record<string, string> | undefined)
    : (metadata.teamStartedStates as Record<string, string> | undefined)
  if (!stateMap) return undefined

  const mapStateForTeam = (teamId?: string): string | undefined =>
    teamId ? stateMap[teamId] : undefined

  // Fast path: infer team from "[TEAM-123]" title prefix and cached team list.
  const inferredTeamId = inferTaskTeamIdFromIdentifierPrefix(metadata, task.title)
  const inferredState = mapStateForTeam(inferredTeamId)
  if (inferredState) return inferredState

  // Robust fallback: ask Linear for the issue's team ID, then use that team's state.
  const exactTeamId = await fetchIssueTeamId(conn.apiKey, task.source_id)
  const exactState = mapStateForTeam(exactTeamId)
  if (exactState) return exactState

  // Safe fallback for legacy single-team connections only.
  const teamIds = Object.keys(stateMap)
  return teamIds.length === 1 ? stateMap[teamIds[0]] : undefined
}

function inferTaskTeamIdFromIdentifierPrefix(
  metadata: Record<string, unknown>,
  taskTitle: string,
): string | undefined {
  const match = taskTitle.match(/^\[([A-Za-z0-9]+)-\d+\]/)
  const teamKey = match?.[1]?.toUpperCase()
  if (!teamKey) return undefined

  const teams = metadata.teams as Array<{ id: string; key?: string }> | undefined
  const team = teams?.find((t) => t.key?.toUpperCase() === teamKey)
  return team?.id
}
