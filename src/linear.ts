/**
 * Linear GraphQL API client for issues.
 * Uses fetch directly against the Linear GraphQL endpoint.
 */

const LINEAR_API_URL = "https://api.linear.app/graphql";

export interface LinearIssue {
  id: string;
  identifier: string; // e.g. "DTF-95"
  title: string;
  description: string | null;
  url: string; // e.g. "https://linear.app/dtf/issue/DTF-95"
  state: { id: string; name: string; type: string };
  dueDate: string | null; // "YYYY-MM-DD"
  priority: number; // 0=None, 1=Urgent, 2=High, 3=Normal, 4=Low
  assignee: { id: string; name: string } | null;
  project: { id: string; name: string; url: string } | null;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function gql<T>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linear API failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(
      `Linear GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`
    );
  }
  if (!json.data) {
    throw new Error("Linear API returned no data");
  }
  return json.data;
}

// ─── Viewer ─────────────────────────────────────────────────────────────

/**
 * Get the authenticated user's ID (the API key owner).
 */
export async function getViewerId(apiKey: string): Promise<string> {
  const data = await gql<{ viewer: { id: string } }>(
    apiKey,
    `query { viewer { id } }`
  );
  return data.viewer.id;
}

// ─── Queries ────────────────────────────────────────────────────────────

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  url
  state { id name type }
  dueDate
  priority
  assignee { id name }
  project { id name url }
`;

interface IssuesResponse {
  issues: {
    nodes: LinearIssue[];
    pageInfo: { hasNextPage: boolean; endCursor: string };
  };
}

/**
 * Fetch active issues (Todo + In Progress) for a team.
 * Active = state type "unstarted" or "started".
 */
export async function getActiveIssues(
  apiKey: string,
  teamKey: string
): Promise<LinearIssue[]> {
  const allIssues: LinearIssue[] = [];
  let hasNextPage = true;
  let endCursor: string | null = null;

  while (hasNextPage) {
    const data: IssuesResponse = await gql(
      apiKey,
      `query($teamKey: String!, $after: String) {
        issues(
          filter: {
            team: { key: { eq: $teamKey } }
            state: { type: { in: ["unstarted", "started"] } }
          }
          first: 100
          after: $after
        ) {
          nodes { ${ISSUE_FIELDS} }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { teamKey, after: endCursor }
    );

    allIssues.push(...data.issues.nodes);
    hasNextPage = data.issues.pageInfo.hasNextPage;
    endCursor = data.issues.pageInfo.endCursor;
  }

  return allIssues;
}

/**
 * Fetch ALL issues for a team assigned to a specific user (any state).
 * Used to detect issues that moved to Done/Canceled so we can complete them in Todoist.
 */
export async function getAllMyIssues(
  apiKey: string,
  teamKey: string,
  viewerId: string
): Promise<LinearIssue[]> {
  const allIssues: LinearIssue[] = [];
  let hasNextPage = true;
  let endCursor: string | null = null;

  while (hasNextPage) {
    const data: IssuesResponse = await gql(
      apiKey,
      `query($teamKey: String!, $viewerId: ID!, $after: String) {
        issues(
          filter: {
            team: { key: { eq: $teamKey } }
            assignee: { id: { eq: $viewerId } }
          }
          first: 100
          after: $after
        ) {
          nodes { ${ISSUE_FIELDS} }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { teamKey, viewerId, after: endCursor }
    );

    allIssues.push(...data.issues.nodes);
    hasNextPage = data.issues.pageInfo.hasNextPage;
    endCursor = data.issues.pageInfo.endCursor;
  }

  return allIssues;
}

/**
 * Update the description of an issue (used to append todoist tag).
 */
export async function updateIssueDescription(
  apiKey: string,
  issueId: string,
  description: string
): Promise<void> {
  await gql(
    apiKey,
    `mutation($id: String!, $description: String!) {
      issueUpdate(id: $id, input: { description: $description }) {
        success
      }
    }`,
    { id: issueId, description }
  );
}

/**
 * Move an issue to a specific workflow state.
 */
export async function updateIssueState(
  apiKey: string,
  issueId: string,
  stateId: string
): Promise<void> {
  await gql(
    apiKey,
    `mutation($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success
      }
    }`,
    { id: issueId, stateId }
  );
}

/**
 * Create a new issue in a team.
 */
export async function createLinearIssue(
  apiKey: string,
  teamId: string,
  data: {
    title: string;
    description?: string;
    dueDate?: string; // YYYY-MM-DD
    priority?: number;
    stateId?: string; // default to Todo
  }
): Promise<LinearIssue> {
  const result = await gql<{
    issueCreate: { success: boolean; issue: LinearIssue };
  }>(
    apiKey,
    `mutation($teamId: String!, $title: String!, $description: String, $dueDate: TimelessDate, $priority: Int, $stateId: String) {
      issueCreate(input: {
        teamId: $teamId
        title: $title
        description: $description
        dueDate: $dueDate
        priority: $priority
        stateId: $stateId
      }) {
        success
        issue { ${ISSUE_FIELDS} }
      }
    }`,
    {
      teamId,
      title: data.title,
      description: data.description ?? null,
      dueDate: data.dueDate ?? null,
      priority: data.priority ?? 0,
      stateId: data.stateId ?? null,
    }
  );

  return result.issueCreate.issue;
}

/**
 * Get team info including workflow states.
 */
export async function getTeamByKey(
  apiKey: string,
  teamKey: string
): Promise<{
  id: string;
  name: string;
  key: string;
  states: Array<{ id: string; name: string; type: string }>;
}> {
  const data = await gql<{
    teams: {
      nodes: Array<{
        id: string;
        name: string;
        key: string;
        states: { nodes: Array<{ id: string; name: string; type: string }> };
      }>;
    };
  }>(
    apiKey,
    `query($teamKey: String!) {
      teams(filter: { key: { eq: $teamKey } }) {
        nodes {
          id
          name
          key
          states { nodes { id name type } }
        }
      }
    }`,
    { teamKey }
  );

  const team = data.teams.nodes[0];
  if (!team) throw new Error(`Linear team "${teamKey}" not found`);

  return {
    id: team.id,
    name: team.name,
    key: team.key,
    states: team.states.nodes,
  };
}

// ─── Priority mapping ───────────────────────────────────────────────────
// Linear: 0=None, 1=Urgent, 2=High, 3=Normal, 4=Low
// Todoist: 1=Low (p4), 2=Normal (p3), 3=High (p2), 4=Urgent (p1)

export function linearPriorityToTodoist(linearPriority: number): number {
  switch (linearPriority) {
    case 1: return 4; // Urgent → p1
    case 2: return 3; // High → p2
    case 3: return 2; // Normal → p3
    case 4: return 1; // Low → p4
    default: return 1; // None → p4
  }
}

export function todoistPriorityToLinear(todoistPriority: number): number {
  switch (todoistPriority) {
    case 4: return 1; // p1 → Urgent
    case 3: return 2; // p2 → High
    case 2: return 3; // p3 → Normal
    case 1: return 4; // p4 → Low
    default: return 0; // None
  }
}
