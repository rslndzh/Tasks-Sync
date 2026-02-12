/**
 * Todoist client wrapper using the official TypeScript SDK.
 */

import { TodoistApi, type Task } from "@doist/todoist-api-typescript";

let _api: TodoistApi | null = null;

export function getTodoistApi(token: string): TodoistApi {
  if (!_api) {
    _api = new TodoistApi(token);
  }
  return _api;
}

/**
 * Find a project by name. Returns the first match.
 */
export async function findProjectByName(
  api: TodoistApi,
  name: string
): Promise<{ id: string; name: string } | undefined> {
  const response = await api.getProjects();
  return response.results.find(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Get all active tasks in a specific project, handling pagination.
 */
export async function getProjectTasks(
  api: TodoistApi,
  projectId: string
): Promise<Task[]> {
  const allTasks: Task[] = [];
  let cursor: string | null = null;

  do {
    const response = await api.getTasks({
      projectId,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    allTasks.push(...response.results);
    cursor = response.nextCursor;
  } while (cursor);

  return allTasks;
}

/**
 * Get recently completed tasks in a specific project (last 30 days).
 * Returns them alongside active tasks so the sync engine can see completions.
 */
export async function getCompletedProjectTasks(
  api: TodoistApi,
  projectId: string
): Promise<Task[]> {
  const allTasks: Task[] = [];
  let cursor: string | null = null;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  do {
    const response = await api.getCompletedTasksByCompletionDate({
      since: thirtyDaysAgo.toISOString(),
      until: now.toISOString(),
      projectId,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    allTasks.push(...response.items);
    cursor = response.nextCursor;
  } while (cursor);

  return allTasks;
}

/**
 * Get ALL tasks (active + recently completed) for a project.
 */
export async function getAllProjectTasks(
  api: TodoistApi,
  projectId: string
): Promise<Task[]> {
  const [active, completed] = await Promise.all([
    getProjectTasks(api, projectId),
    getCompletedProjectTasks(api, projectId),
  ]);

  // Deduplicate by ID (shouldn't overlap, but just in case)
  const seen = new Set<string>();
  const all: Task[] = [];
  for (const task of [...active, ...completed]) {
    if (!seen.has(task.id)) {
      seen.add(task.id);
      all.push(task);
    }
  }

  return all;
}

/**
 * Create a task in a project.
 */
export async function createTodoistTask(
  api: TodoistApi,
  data: {
    content: string;
    description?: string;
    projectId: string;
    dueString?: string; // e.g. "2023-01-15" or "tomorrow"
    priority?: number; // 1 (low) to 4 (urgent)
  }
): Promise<Task> {
  return api.addTask({
    content: data.content,
    description: data.description,
    projectId: data.projectId,
    ...(data.dueString ? { dueString: data.dueString } : {}),
    ...(data.priority ? { priority: data.priority } : {}),
  });
}

/**
 * Update an existing Todoist task.
 */
export async function updateTodoistTask(
  api: TodoistApi,
  taskId: string,
  data: {
    content?: string;
    description?: string;
    dueString?: string;
    priority?: number;
  }
): Promise<Task> {
  return api.updateTask(taskId, {
    ...(data.content !== undefined ? { content: data.content } : {}),
    ...(data.description !== undefined
      ? { description: data.description }
      : {}),
    ...(data.dueString !== undefined ? { dueString: data.dueString } : {}),
    ...(data.priority !== undefined ? { priority: data.priority } : {}),
  });
}

/**
 * Complete (close) a Todoist task.
 */
export async function closeTodoistTask(
  api: TodoistApi,
  taskId: string
): Promise<boolean> {
  return api.closeTask(taskId);
}

/**
 * Reopen a completed Todoist task.
 */
export async function reopenTodoistTask(
  api: TodoistApi,
  taskId: string
): Promise<boolean> {
  return api.reopenTask(taskId);
}
