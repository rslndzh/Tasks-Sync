/**
 * Locu REST API client for tasks.
 * Uses fetch directly against the Locu public API.
 */

const LOCU_API_URL = "https://api.locu.app/api/v1";

export interface LocuTask {
  id: string;
  name: string;
  done: "completed" | null;
  doneAt: string | null;
  parent: { id: string; order: number | null } | null;
  createdAt: string;
  projectId: string | null;
  integrationId: string | null;
  type: "locu" | "linear" | string;
  description: { markdown: string } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

async function locuFetch<T>(
  apiKey: string,
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${LOCU_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Locu ${options?.method ?? "GET"} ${path} failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  return json as T;
}

// ─── Projects ────────────────────────────────────────────────────────────

export interface LocuProject {
  id: string;
  name: string;
}

/**
 * Find a Locu project by name. Returns null if not found.
 */
export async function findLocuProjectByName(
  apiKey: string,
  name: string
): Promise<LocuProject | null> {
  const res = await locuFetch<{ data: LocuProject[] }>(apiKey, "/projects");
  const project = res.data.find((p) => p.name === name);
  return project ?? null;
}

// ─── Tasks ───────────────────────────────────────────────────────────────

/**
 * Fetch all tasks (active + completed). Only returns native Locu tasks (type: "locu").
 */
export async function getLocuTasks(apiKey: string): Promise<LocuTask[]> {
  // Fetch active and completed separately
  const [active, completed] = await Promise.all([
    locuFetch<{ data: LocuTask[] }>(apiKey, "/tasks"),
    locuFetch<{ data: LocuTask[] }>(apiKey, "/tasks?done=true"),
  ]);

  const all = [...active.data, ...completed.data];

  // Only return native Locu tasks (not Linear-imported ones)
  // and skip subtasks (parent !== null)
  return all.filter((t) => t.type === "locu" && t.parent === null);
}

/**
 * Create a new task in Locu.
 * Section is required for root tasks: "today" | "sooner" | "later"
 */
export async function createLocuTask(
  apiKey: string,
  data: {
    name: string;
    description?: string;
    section?: "today" | "sooner" | "later";
    projectId?: string;
  }
): Promise<LocuTask> {
  const body: Record<string, unknown> = {
    name: data.name,
    section: data.section ?? "sooner",
  };
  if (data.description) body.description = data.description;
  if (data.projectId) body.projectId = data.projectId;

  return locuFetch<LocuTask>(apiKey, "/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Update an existing Locu task.
 */
export async function updateLocuTask(
  apiKey: string,
  taskId: string,
  data: {
    name?: string;
    description?: string;
    done?: "completed" | null;
  }
): Promise<LocuTask> {
  return locuFetch<LocuTask>(apiKey, `/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}
