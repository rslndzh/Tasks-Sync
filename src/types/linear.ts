/**
 * Linear GraphQL API response types.
 * We only type the subset of fields we actually use.
 */

export interface LinearUser {
  id: string
  name: string
  email: string
}

export interface LinearTeam {
  id: string
  name: string
  key: string
}

export interface LinearIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  url: string
  state: {
    id: string
    name: string
    type: string
  }
  assignee: {
    id: string
    name: string
  } | null
  team: {
    id: string
    name: string
    key: string
  }
  project: {
    id: string
    name: string
  } | null
  estimate: number | null
  createdAt: string
  updatedAt: string
}

// GraphQL response shapes
export interface LinearGraphQLResponse<T> {
  data?: T
  errors?: Array<{
    message: string
    extensions?: {
      code?: string
      userPresentableMessage?: string
    }
  }>
}

export interface ViewerResponse {
  viewer: LinearUser
}

export interface TeamsResponse {
  teams: {
    nodes: LinearTeam[]
  }
}

export interface AssignedIssuesResponse {
  viewer: {
    assignedIssues: {
      nodes: LinearIssue[]
      pageInfo: {
        hasNextPage: boolean
        endCursor: string | null
      }
    }
  }
}

export interface TeamIssuesResponse {
  team: {
    issues: {
      nodes: LinearIssue[]
      pageInfo: {
        hasNextPage: boolean
        endCursor: string | null
      }
    }
  }
}

// Error types for the client
export type LinearErrorType =
  | "invalid_key"
  | "rate_limited"
  | "network_error"
  | "server_error"
  | "unknown"

export class LinearApiError extends Error {
  constructor(
    message: string,
    public type: LinearErrorType,
    public statusCode?: number,
  ) {
    super(message)
    this.name = "LinearApiError"
  }
}
