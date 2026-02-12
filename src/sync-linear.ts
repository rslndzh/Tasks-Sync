/**
 * Stateless two-way sync engine between Linear issues and Todoist tasks.
 *
 * Cross-reference strategy:
 *   - Todoist task description: [🔗 Linear](https://linear.app/.../DTF-95#linear-id=UUID)
 *   - Linear issue description: [todoist:TASK_ID]
 */

import type { TodoistApi, Task as TodoistTask } from "@doist/todoist-api-typescript";
import type { LinearIssue } from "./linear.js";
import {
  getAllMyIssues,
  getViewerId,
  getTeamByKey,
  createLinearIssue,
  updateIssueDescription,
  updateIssueState,
  linearPriorityToTodoist,
  todoistPriorityToLinear,
} from "./linear.js";
import {
  getAllProjectTasks,
  createTodoistTask,
  updateTodoistTask,
  closeTodoistTask,
} from "./todoist.js";

// ─── Cross-reference tag helpers ────────────────────────────────────────

// Format in Todoist description: [🔗 Linear](https://linear.app/.../DTF-95#linear-id=UUID)
const LINEAR_LINK_RE = /#linear-id=([a-f0-9-]+)/;
// Format in Linear issue description: [todoist:12345]
const TODOIST_TAG_RE = /\[todoist:(\d+)\]/;

function extractLinearId(todoistDescription: string): string | null {
  const m = todoistDescription.match(LINEAR_LINK_RE);
  return m ? m[1] : null;
}

function extractTodoistId(linearDescription: string | null): string | null {
  if (!linearDescription) return null;
  const m = linearDescription.match(TODOIST_TAG_RE);
  return m ? m[1] : null;
}

/**
 * Build a pretty Todoist description with a clickable Linear link
 * and an optional project link, all on one row.
 * The linear issue ID (UUID) is embedded in the URL fragment for sync matching.
 */
function buildLinearDescription(issue: LinearIssue): string {
  const parts = [`[🔗 Linear](${issue.url}#linear-id=${issue.id})`];
  if (issue.project) {
    parts.push(`[📁 ${issue.project.name}](${issue.project.url})`);
  }
  return parts.join(" | ");
}

/**
 * Append a todoist tag to a Linear issue description.
 */
function appendTodoistTag(description: string | null, todoistTaskId: string): string {
  const base = description ?? "";
  const tag = `[todoist:${todoistTaskId}]`;
  // Don't double-append
  if (base.includes(tag)) return base;
  return base ? `${base}\n\n${tag}` : tag;
}

/** Strip the todoist tag from Linear description */
function cleanLinearDescription(description: string | null): string {
  if (!description) return "";
  return description.replace(TODOIST_TAG_RE, "").trim();
}

// ─── State helpers ──────────────────────────────────────────────────────

/** Check if a Linear issue is in an active state (Todo or In Progress) */
function isActiveState(stateType: string): boolean {
  return stateType === "unstarted" || stateType === "started";
}

/** Check if a Linear issue is in a completed/canceled state */
function isCompletedState(stateType: string): boolean {
  return stateType === "completed" || stateType === "canceled";
}

// ─── Sync logic ─────────────────────────────────────────────────────────

export interface LinearSyncStats {
  created_in_todoist: number;
  created_in_linear: number;
  updated_in_todoist: number;
  updated_in_linear: number;
  completed_in_todoist: number;
  completed_in_linear: number;
}

export async function syncLinear(
  todoistApi: TodoistApi,
  linearApiKey: string,
  linearTeamKey: string,
  todoistProjectId: string
): Promise<LinearSyncStats> {
  const stats: LinearSyncStats = {
    created_in_todoist: 0,
    created_in_linear: 0,
    updated_in_todoist: 0,
    updated_in_linear: 0,
    completed_in_todoist: 0,
    completed_in_linear: 0,
  };

  // 1. Fetch viewer ID (the authenticated user) and team info
  console.log(`  Fetching Linear team "${linearTeamKey}"...`);
  const [viewerId, team] = await Promise.all([
    getViewerId(linearApiKey),
    getTeamByKey(linearApiKey, linearTeamKey),
  ]);
  console.log(`  Syncing issues assigned to viewer: ${viewerId}`);

  const doneState = team.states.find((s) => s.name === "Done");
  const todoState = team.states.find((s) => s.name === "Todo");
  if (!doneState || !todoState) {
    throw new Error("Could not find Done or Todo states in Linear team");
  }

  // 2. Fetch all Linear issues assigned to me (all states, to detect completions)
  console.log("  Fetching my Linear issues...");
  const linearIssues = await getAllMyIssues(linearApiKey, linearTeamKey, viewerId);
  console.log(`  Found ${linearIssues.length} Linear issues assigned to me`);

  // 3. Fetch Todoist tasks
  console.log("  Fetching Todoist tasks (active + completed)...");
  const todoistTasks = await getAllProjectTasks(todoistApi, todoistProjectId);
  console.log(`  Found ${todoistTasks.length} Todoist tasks in project`);

  // 4. Build lookup maps
  const todoistByLinearId = new Map<string, TodoistTask>();
  const linearByTodoistId = new Map<string, LinearIssue>();

  for (const tt of todoistTasks) {
    const linearId = extractLinearId(tt.description);
    if (linearId) {
      todoistByLinearId.set(linearId, tt);
    }
  }

  for (const li of linearIssues) {
    const todoistId = extractTodoistId(li.description);
    if (todoistId) {
      linearByTodoistId.set(todoistId, li);
    }
  }

  // 5. Process Linear issues → sync to Todoist
  for (const issue of linearIssues) {
    const existingTodoist = todoistByLinearId.get(issue.id);

    if (!existingTodoist) {
      // Not yet linked to Todoist

      // Skip non-active issues (Backlog, Done, Canceled, etc.)
      if (!isActiveState(issue.state.type)) continue;

      // Check if this issue was PREVIOUSLY linked (has [todoist:XXX] tag)
      const previousTodoistId = extractTodoistId(issue.description);
      if (previousTodoistId) {
        // The Todoist task is gone — mark issue as Done
        console.log(`  ✓ Todoist task gone, marking Done in Linear: "[${issue.identifier}] ${issue.title}"`);
        await updateIssueState(linearApiKey, issue.id, doneState.id);
        stats.completed_in_linear++;
        continue;
      }

      // Genuinely new active issue — create in Todoist
      console.log(`  → Creating in Todoist: "[${issue.identifier}] ${issue.title}"`);
      const created = await createTodoistTask(todoistApi, {
        content: `[${issue.identifier}] ${issue.title}`,
        description: buildLinearDescription(issue),
        projectId: todoistProjectId,
        dueString: issue.dueDate ?? undefined,
        priority: linearPriorityToTodoist(issue.priority),
      });

      // Write the Todoist ID back into the Linear issue description
      const updatedDesc = appendTodoistTag(issue.description, created.id);
      await updateIssueDescription(linearApiKey, issue.id, updatedDesc);

      stats.created_in_todoist++;
    } else {
      // Existing pair — sync updates
      await syncLinearPair(
        todoistApi,
        linearApiKey,
        issue,
        existingTodoist,
        doneState.id,
        stats
      );
    }
  }

  // 6. Todoist-only tasks (no Linear link) are left as-is — no auto-creation in Linear

  return stats;
}

/**
 * Sync an existing pair of linked Linear issue + Todoist task.
 */
async function syncLinearPair(
  todoistApi: TodoistApi,
  linearApiKey: string,
  issue: LinearIssue,
  todoistTask: TodoistTask,
  doneStateId: string,
  stats: LinearSyncStats
): Promise<void> {
  const todoistIsCompleted = todoistTask.completedAt !== null;
  const linearIsCompleted = isCompletedState(issue.state.type);

  // ─── Completion sync ────────────────────────────────────────────
  if (linearIsCompleted && !todoistIsCompleted) {
    console.log(`  ✓ Completing in Todoist: "${todoistTask.content}"`);
    await closeTodoistTask(todoistApi, todoistTask.id);
    stats.completed_in_todoist++;
    return;
  }

  if (!linearIsCompleted && todoistIsCompleted) {
    console.log(`  ✓ Completing in Linear: "${issue.identifier} ${issue.title}"`);
    await updateIssueState(linearApiKey, issue.id, doneStateId);
    stats.completed_in_linear++;
    return;
  }

  // Both completed — nothing to do
  if (linearIsCompleted && todoistIsCompleted) return;

  // ─── Content sync (Linear is source of truth for title) ─────────
  const expectedContent = `[${issue.identifier}] ${issue.title}`;
    if (todoistTask.content !== expectedContent) {
      console.log(`  ↔ Syncing title to Todoist: "${expectedContent}"`);
    await updateTodoistTask(todoistApi, todoistTask.id, {
      content: expectedContent,
    });
    stats.updated_in_todoist++;
  }

  // ─── Due date sync (Todoist is source of truth) ─────────────────
  const todoistDue = todoistTask.due?.date ?? undefined;
  const linearDue = issue.dueDate ?? undefined;

  if (todoistDue !== linearDue) {
    if (todoistDue && todoistDue !== linearDue) {
      // Todoist has a due date, push to Linear
      // Note: Linear dueDate update requires a separate mutation — skip for now
      // as it's less common to set due dates in Linear
    } else if (linearDue && !todoistDue) {
      // Linear has a due date, push to Todoist
      console.log(`  ↔ Syncing due date to Todoist: ${linearDue}`);
      await updateTodoistTask(todoistApi, todoistTask.id, {
        dueString: linearDue,
      });
      stats.updated_in_todoist++;
    }
  }

  // ─── Priority sync (Linear is source of truth) ──────────────────
  const expectedPriority = linearPriorityToTodoist(issue.priority);
  if (todoistTask.priority !== expectedPriority) {
    console.log(`  ↔ Syncing priority to Todoist: ${expectedPriority}`);
    await updateTodoistTask(todoistApi, todoistTask.id, {
      priority: expectedPriority,
    });
    stats.updated_in_todoist++;
  }
}
