import type {
  AssignedIssuesResponse,
  LinearGraphQLResponse,
  LinearIssue,
  LinearTeam,
  LinearUser,
  TeamsResponse,
  TeamIssuesResponse,
  ViewerResponse,
} from "@/types/linear"
import { LinearApiError } from "@/types/linear"
import type { LocalTask } from "@/types/local"

const LINEAR_API_URL = "https://api.linear.app/graphql"

// ============================================================================
// Core GraphQL client
// ============================================================================

async function linearQuery<T>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  let response: Response

  try {
    response = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ query, variables }),
    })
  } catch (err) {
    throw new LinearApiError(
      "Could not reach Linear. Check your connection.",
      "network_error",
    )
  }

  // Rate limit handling
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After")
    throw new LinearApiError(
      `Linear rate limit hit. Try again in ${retryAfter ?? "a few"} seconds.`,
      "rate_limited",
      429,
    )
  }

  // Auth errors
  if (response.status === 401 || response.status === 403) {
    throw new LinearApiError(
      "Hmm, that key didn't work. Double-check and try again?",
      "invalid_key",
      response.status,
    )
  }

  // Server errors
  if (response.status >= 500) {
    throw new LinearApiError(
      "Linear is having a moment. Try again shortly.",
      "server_error",
      response.status,
    )
  }

  const json = (await response.json()) as LinearGraphQLResponse<T>

  // GraphQL-level errors
  if (json.errors?.length) {
    const first = json.errors[0]
    const code = first.extensions?.code

    if (code === "AUTHENTICATION_ERROR") {
      throw new LinearApiError(
        "Hmm, that key didn't work. Double-check and try again?",
        "invalid_key",
      )
    }

    throw new LinearApiError(
      first.extensions?.userPresentableMessage ?? first.message,
      "unknown",
    )
  }

  if (!json.data) {
    throw new LinearApiError("Empty response from Linear.", "unknown")
  }

  return json.data
}

// ============================================================================
// Public API functions
// ============================================================================

/**
 * Validate an API key by fetching the authenticated user.
 * Returns the user on success, throws LinearApiError on failure.
 */
export async function validateApiKey(apiKey: string): Promise<LinearUser> {
  const data = await linearQuery<ViewerResponse>(
    apiKey,
    `query { viewer { id name email } }`,
  )
  return data.viewer
}

/**
 * Fetch all teams accessible to the authenticated user.
 */
export async function fetchTeams(apiKey: string): Promise<LinearTeam[]> {
  const data = await linearQuery<TeamsResponse>(
    apiKey,
    `query {
      teams {
        nodes { id name key }
      }
    }`,
  )
  return data.teams.nodes
}

/** Linear state types that can be filtered */
export const LINEAR_STATE_TYPES = ["triage", "backlog", "unstarted", "started"] as const
export type LinearStateType = (typeof LINEAR_STATE_TYPES)[number]

/** Default: only pull tasks you're actively working on */
export const DEFAULT_LINEAR_STATE_FILTER: LinearStateType[] = ["started", "unstarted"]

/**
 * Fetch all issues assigned to the authenticated user.
 * Optionally filter by team ID and state types.
 */
export async function fetchAssignedIssues(
  apiKey: string,
  teamId?: string,
  stateTypes?: LinearStateType[],
): Promise<LinearIssue[]> {
  if (teamId) {
    return fetchTeamAssignedIssues(apiKey, teamId, stateTypes)
  }

  // Use "in" filter for specific types, fall back to excluding canceled/completed
  const filter = stateTypes?.length
    ? `state: { type: { in: ${JSON.stringify(stateTypes)} } }`
    : `state: { type: { in: ${JSON.stringify([...DEFAULT_LINEAR_STATE_FILTER])} } }`

  const allIssues: LinearIssue[] = []
  let cursor: string | null = null
  let hasMore = true

  while (hasMore) {
    const data: AssignedIssuesResponse = await linearQuery<AssignedIssuesResponse>(
      apiKey,
      `query AssignedIssues($after: String) {
        viewer {
          assignedIssues(
            first: 50
            after: $after
            filter: { ${filter} }
          ) {
            nodes {
              id
              identifier
              title
              description
              url
              estimate
              createdAt
              updatedAt
              state { id name type }
              assignee { id name }
              team { id name key }
              project { id name }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { after: cursor },
    )

    allIssues.push(...data.viewer.assignedIssues.nodes)
    hasMore = data.viewer.assignedIssues.pageInfo.hasNextPage
    cursor = data.viewer.assignedIssues.pageInfo.endCursor
  }

  return allIssues
}

async function fetchTeamAssignedIssues(
  apiKey: string,
  teamId: string,
  stateTypes?: LinearStateType[],
): Promise<LinearIssue[]> {
  const filter = stateTypes?.length
    ? `state: { type: { in: ${JSON.stringify(stateTypes)} } }`
    : `state: { type: { in: ${JSON.stringify([...DEFAULT_LINEAR_STATE_FILTER])} } }`

  const allIssues: LinearIssue[] = []
  let cursor: string | null = null
  let hasMore = true

  while (hasMore) {
    const data: TeamIssuesResponse = await linearQuery<TeamIssuesResponse>(
      apiKey,
      `query TeamIssues($teamId: String!, $after: String) {
        team(id: $teamId) {
          issues(
            first: 50
            after: $after
            filter: {
              assignee: { isMe: { eq: true } }
              ${filter}
            }
          ) {
            nodes {
              id
              identifier
              title
              description
              url
              estimate
              createdAt
              updatedAt
              state { id name type }
              assignee { id name }
              team { id name key }
              project { id name }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { teamId, after: cursor },
    )

    allIssues.push(...data.team.issues.nodes)
    hasMore = data.team.issues.pageInfo.hasNextPage
    cursor = data.team.issues.pageInfo.endCursor
  }

  return allIssues
}

// ============================================================================
// Write operations (two-way sync)
// ============================================================================

/** Linear workflow state shape returned by the API */
export interface LinearWorkflowState {
  id: string
  name: string
  type: string
}

/**
 * Fetch all workflow states for a team.
 * Used to find the "Done" and "Started" state IDs for writeback.
 */
export async function fetchWorkflowStates(
  apiKey: string,
  teamId: string,
): Promise<LinearWorkflowState[]> {
  const data = await linearQuery<{
    team: { states: { nodes: LinearWorkflowState[] } }
  }>(
    apiKey,
    `query TeamStates($teamId: String!) {
      team(id: $teamId) {
        states {
          nodes { id name type }
        }
      }
    }`,
    { teamId },
  )
  return data.team.states.nodes
}

/**
 * Transition a Linear issue to a new workflow state.
 */
export async function updateLinearIssueState(
  apiKey: string,
  issueId: string,
  stateId: string,
): Promise<void> {
  await linearQuery<{ issueUpdate: { success: boolean } }>(
    apiKey,
    `mutation UpdateIssueState($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) {
        success
      }
    }`,
    { issueId, stateId },
  )
}

/**
 * Fetch the owning team ID for a specific issue.
 * Used by writeback to avoid applying a state from the wrong team.
 */
export async function fetchIssueTeamId(
  apiKey: string,
  issueId: string,
): Promise<string | undefined> {
  const data = await linearQuery<{
    issue: { team: { id: string } | null } | null
  }>(
    apiKey,
    `query IssueTeam($issueId: String!) {
      issue(id: $issueId) {
        team { id }
      }
    }`,
    { issueId },
  )

  return data.issue?.team?.id ?? undefined
}

// ============================================================================
// Mapping
// ============================================================================

/**
 * Map a Linear issue to a Flowpin LocalTask shape.
 * The task starts with `bucket_id = null` (unbucketed, in integration inbox).
 */
export function mapLinearIssueToTask(
  issue: LinearIssue,
  userId: string,
): Omit<LocalTask, "position"> {
  return {
    id: crypto.randomUUID(),
    user_id: userId,
    title: `[${issue.identifier}] ${issue.title}`,
    description: null,
    source_description: issue.description,
    status: "active",
    source: "linear",
    source_id: issue.id,
    connection_id: null,
    bucket_id: null,
    section: "sooner",
    today_lane: null,
    estimate_minutes: issue.estimate ? issue.estimate * 60 : null, // Linear estimate is in points, rough ~60min/point
    created_at: issue.createdAt,
    updated_at: issue.updatedAt,
    completed_at: null,
  }
}
