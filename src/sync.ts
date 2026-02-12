/**
 * Stateless two-way sync engine between Attio tasks and Todoist tasks.
 *
 * Cross-reference strategy:
 *   - Todoist task description contains: <!-- attio:TASK_ID -->
 *   - Attio task content contains: [todoist:TASK_ID]
 *     (Attio is plaintext-only, so we use a bracket tag instead of HTML comment)
 */

import type { TodoistApi, Task as TodoistTask } from "@doist/todoist-api-typescript";
import type { AttioTask } from "./attio.js";
import {
  getAttioTasks,
  getRecordWebUrl,
  createAttioTask,
  updateAttioTask,
} from "./attio.js";
import {
  getAllProjectTasks,
  createTodoistTask,
  updateTodoistTask,
  closeTodoistTask,
  reopenTodoistTask,
} from "./todoist.js";

// ─── Cross-reference tag helpers ────────────────────────────────────────

// New format: [🔗 Attio](https://app.attio.com/.../record/...#attio-task=UUID)
// The attio task ID is hidden in the URL fragment — invisible to user.
const ATTIO_LINK_RE = /#attio-task=([a-f0-9-]+)/;
// Legacy format for backward compat: <!-- attio:UUID -->
const ATTIO_TAG_LEGACY_RE = /<!-- attio:([a-f0-9-]+) -->/;
// Full link regex for cleanup
const ATTIO_LINK_FULL_RE = /\[🔗 Attio\]\([^)]+#attio-task=[a-f0-9-]+\)/;

const TODOIST_TAG_RE = /\[todoist:(\d+)\]/;

function extractAttioId(todoistDescription: string): string | null {
  // Try new format first, then legacy
  const m = todoistDescription.match(ATTIO_LINK_RE)
    || todoistDescription.match(ATTIO_TAG_LEGACY_RE);
  return m ? m[1] : null;
}

function extractTodoistId(attioContent: string): string | null {
  const m = attioContent.match(TODOIST_TAG_RE);
  return m ? m[1] : null;
}

/**
 * Build a pretty Todoist description with a clickable Attio link.
 * The attio task ID is embedded in the URL fragment for sync matching.
 */
function buildAttioDescription(attioTaskId: string, attioWebUrl: string | null): string {
  const baseUrl = attioWebUrl ?? "https://app.attio.com";
  return `[🔗 Attio](${baseUrl}#attio-task=${attioTaskId})`;
}

function appendTodoistTag(content: string, todoistTaskId: string): string {
  return `${content} [todoist:${todoistTaskId}]`;
}

/** Strip the todoist tag from Attio content to get the "clean" title */
function cleanAttioContent(content: string): string {
  return content.replace(TODOIST_TAG_RE, "").trim();
}

/**
 * Escape `@` in content for Todoist.
 * Todoist interprets `@word` as a label, stripping it from the content.
 * We replace `@` with the Unicode fullwidth `＠` (U+FF20) which looks the same but isn't parsed.
 */
function escapeForTodoist(content: string): string {
  return content.replace(/@/g, "＠");
}

/** Check if a Todoist description uses the old <!-- attio:... --> format */
function isLegacyFormat(description: string): boolean {
  return ATTIO_TAG_LEGACY_RE.test(description);
}

// ─── Date helpers ───────────────────────────────────────────────────────

/** Convert ISO datetime or date string to YYYY-MM-DD or null */
function toDateOnly(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  return iso.slice(0, 10); // "2023-01-01T15:00:00.000Z" → "2023-01-01"
}

/** Get the due date string from a Todoist task */
function todoistDueDate(task: TodoistTask): string | undefined {
  return task.due?.date ?? undefined;
}

// ─── Sync logic ─────────────────────────────────────────────────────────

interface SyncStats {
  created_in_todoist: number;
  created_in_attio: number;
  updated_in_todoist: number;
  updated_in_attio: number;
  completed_in_todoist: number;
  completed_in_attio: number;
  reopened_in_todoist: number;
  reopened_in_attio: number;
}

export async function sync(
  todoistApi: TodoistApi,
  attioApiKey: string,
  todoistProjectId: string
): Promise<SyncStats> {
  const stats: SyncStats = {
    created_in_todoist: 0,
    created_in_attio: 0,
    updated_in_todoist: 0,
    updated_in_attio: 0,
    completed_in_todoist: 0,
    completed_in_attio: 0,
    reopened_in_todoist: 0,
    reopened_in_attio: 0,
  };

  // 1. Fetch tasks from both services
  console.log("  Fetching Attio tasks...");
  const attioTasks = await getAttioTasks(attioApiKey);
  console.log(`  Found ${attioTasks.length} Attio tasks`);

  console.log("  Fetching Todoist tasks (active + completed)...");
  const todoistTasks = await getAllProjectTasks(todoistApi, todoistProjectId);
  console.log(`  Found ${todoistTasks.length} Todoist tasks in project (active + completed)`);

  // 2. Build lookup maps
  // Map: attioTaskId → TodoistTask (tasks in Todoist that reference an Attio task)
  const todoistByAttioId = new Map<string, TodoistTask>();
  // Map: todoistTaskId → AttioTask (tasks in Attio that reference a Todoist task)
  const attioByTodoistId = new Map<string, AttioTask>();

  for (const tt of todoistTasks) {
    const attioId = extractAttioId(tt.description);
    if (attioId) {
      todoistByAttioId.set(attioId, tt);
    }
  }

  for (const at of attioTasks) {
    const todoistId = extractTodoistId(at.content_plaintext);
    if (todoistId) {
      attioByTodoistId.set(todoistId, at);
    }
  }

  // 3. Process Attio tasks → sync to Todoist
  for (const attioTask of attioTasks) {
    const attioId = attioTask.id.task_id;
    const existingTodoist = todoistByAttioId.get(attioId);

    if (!existingTodoist) {
      const cleanContent = cleanAttioContent(attioTask.content_plaintext);
      if (!cleanContent) continue; // skip empty tasks

      // Skip already-completed Attio tasks — no need to create in Todoist
      if (attioTask.is_completed) {
        console.log(`  ⊘ Skipping completed Attio task: "${cleanContent}"`);
        continue;
      }

      // Check if this Attio task was PREVIOUSLY linked to a Todoist task
      // (has a [todoist:XXX] tag). If so, that Todoist task was completed
      // or deleted — don't re-create it, mark Attio task as completed instead.
      const previousTodoistId = extractTodoistId(attioTask.content_plaintext);
      if (previousTodoistId) {
        console.log(`  ✓ Todoist task gone, completing in Attio: "${cleanContent}"`);
        await updateAttioTask(attioApiKey, attioId, { is_completed: true });
        stats.completed_in_attio++;
        continue;
      }

      // Genuinely new Attio task — create in Todoist
      console.log(`  → Creating in Todoist: "${cleanContent}"`);

      // Fetch the linked record's web URL for a clickable link
      const webUrl = await getLinkedRecordUrl(attioApiKey, attioTask);

      const created = await createTodoistTask(todoistApi, {
        content: escapeForTodoist(cleanContent),
        description: buildAttioDescription(attioId, webUrl),
        projectId: todoistProjectId,
        dueString: toDateOnly(attioTask.deadline_at),
      });

      // Write the Todoist ID back into the Attio task
      const updatedContent = appendTodoistTag(
        attioTask.content_plaintext,
        created.id
      );
      await updateAttioTask(attioApiKey, attioId, {
        content: updatedContent,
      });

      stats.created_in_todoist++;
    } else {
      // Existing pair — sync updates
      await syncPair(
        todoistApi,
        attioApiKey,
        attioTask,
        existingTodoist,
        stats
      );
    }
  }

  // 4. Todoist-only tasks (no Attio link) are left as-is — no auto-creation in Attio

  return stats;
}

/**
 * Get the web_url of the first linked record on an Attio task.
 */
async function getLinkedRecordUrl(
  attioApiKey: string,
  attioTask: AttioTask
): Promise<string | null> {
  const linked = attioTask.linked_records[0];
  if (!linked) return null;
  return getRecordWebUrl(
    attioApiKey,
    linked.target_object_id,
    linked.target_record_id
  );
}

/**
 * Sync an existing pair of linked tasks.
 * We compare content, due date, and completion status.
 * Also migrates old description format to the new pretty link.
 */
async function syncPair(
  todoistApi: TodoistApi,
  attioApiKey: string,
  attioTask: AttioTask,
  todoistTask: TodoistTask,
  stats: SyncStats
): Promise<void> {
  const attioId = attioTask.id.task_id;

  // ─── Completion status ──────────────────────────────────────────
  const todoistIsCompleted = todoistTask.completedAt !== null;

  if (attioTask.is_completed && !todoistIsCompleted) {
    console.log(`  ✓ Completing in Todoist: "${todoistTask.content}"`);
    await closeTodoistTask(todoistApi, todoistTask.id);
    stats.completed_in_todoist++;
    return; // no further sync needed for completed tasks
  }

  if (!attioTask.is_completed && todoistIsCompleted) {
    console.log(`  ✓ Completing in Attio: "${cleanAttioContent(attioTask.content_plaintext)}"`);
    await updateAttioTask(attioApiKey, attioId, { is_completed: true });
    stats.completed_in_attio++;
    return;
  }

  // Both completed — nothing to do
  if (attioTask.is_completed && todoistIsCompleted) return;

  // ─── Content sync (Attio is source of truth for content) ────────
  // Attio is the source of truth because Todoist mangles `@` prefixes
  // (interpreting them as labels). We always push Attio → Todoist.
  const attioClean = cleanAttioContent(attioTask.content_plaintext);
  const todoistContent = todoistTask.content;
  const attioEscaped = escapeForTodoist(attioClean);

  if (attioClean && todoistContent && attioEscaped !== todoistContent) {
    console.log(`  ↔ Syncing content to Todoist: "${attioClean}"`);
    await updateTodoistTask(todoistApi, todoistTask.id, {
      content: attioEscaped,
    });
    stats.updated_in_todoist++;
  }

  // ─── Due date sync ─────────────────────────────────────────────
  const attioDue = toDateOnly(attioTask.deadline_at);
  const todoistDue = todoistDueDate(todoistTask);

  if (attioDue !== todoistDue) {
    if (todoistDue && todoistDue !== attioDue) {
      // Todoist due date is source of truth (user likely updated it there)
      console.log(`  ↔ Syncing due date to Attio: ${todoistDue}`);
      await updateAttioTask(attioApiKey, attioId, {
        deadline_at: new Date(todoistDue).toISOString(),
      });
      stats.updated_in_attio++;
    } else if (attioDue && !todoistDue) {
      // Attio has a due date, Todoist doesn't — push to Todoist
      console.log(`  ↔ Syncing due date to Todoist: ${attioDue}`);
      await updateTodoistTask(todoistApi, todoistTask.id, {
        dueString: attioDue,
      });
      stats.updated_in_todoist++;
    }
  }

  // ─── Migrate old description format to pretty link ─────────────
  if (isLegacyFormat(todoistTask.description)) {
    console.log(`  🔄 Migrating description to pretty link: "${todoistTask.content}"`);
    const webUrl = await getLinkedRecordUrl(attioApiKey, attioTask);
    const newDescription = buildAttioDescription(attioId, webUrl);
    await updateTodoistTask(todoistApi, todoistTask.id, {
      description: newDescription,
    });
    stats.updated_in_todoist++;
  }
}
