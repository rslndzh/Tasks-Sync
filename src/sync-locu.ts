/**
 * Stateless two-way sync engine between Attio tasks and Locu tasks.
 *
 * Cross-reference strategy:
 *   - Locu task description (markdown): [attio:ATTIO_TASK_ID]
 *   - Attio task content: [locu:LOCU_TASK_ID]
 *
 * Creation is one-directional: Attio → Locu only.
 * Updates and completion sync both ways.
 */

import type { AttioTask } from "./attio.js";
import type { LocuTask } from "./locu.js";
import {
  getAttioTasks,
  getRecordWebUrl,
  updateAttioTask,
} from "./attio.js";
import {
  getLocuTasks,
  createLocuTask,
  updateLocuTask,
} from "./locu.js";

// ─── Cross-reference tag helpers ────────────────────────────────────────

// In Locu task name: ... [attio:UUID]
const ATTIO_TAG_RE = /\[attio:([a-f0-9-]+)\]/;
// In Attio content: [locu:UUID]
const LOCU_TAG_RE = /\[locu:([a-f0-9-]+)\]/;

function extractAttioIdFromName(locuName: string): string | null {
  const m = locuName.match(ATTIO_TAG_RE);
  return m ? m[1] : null;
}

function extractLocuId(attioContent: string): string | null {
  const m = attioContent.match(LOCU_TAG_RE);
  return m ? m[1] : null;
}

/** Format an ISO date string to short format like "Feb 14" */
function formatShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Build a Locu task name with due date prefix and attio ID suffix.
 * Format: ☑️ Feb 14 | @Company Task content [attio:UUID]
 * Without due date: @Company Task content [attio:UUID]
 */
function buildLocuName(cleanContent: string, attioTaskId: string, deadline: string | null): string {
  const tag = `[attio:${attioTaskId}]`;
  const shortDate = formatShortDate(deadline);
  if (shortDate) {
    return `☑️ ${shortDate} | ${cleanContent} ${tag}`;
  }
  return `${cleanContent} ${tag}`;
}

/** Strip the attio tag and date prefix from Locu name to get the clean content */
function cleanLocuName(name: string): string {
  // Remove [attio:UUID]
  let clean = name.replace(ATTIO_TAG_RE, "").trim();
  // Remove ☑️ Mon DD | prefix
  clean = clean.replace(/^☑️\s+\w+\s+\d+\s*\|\s*/, "").trim();
  return clean;
}

/** Append a locu tag to Attio content */
function appendLocuTag(content: string, locuTaskId: string): string {
  const tag = `[locu:${locuTaskId}]`;
  if (content.includes(tag)) return content;
  return `${content} ${tag}`;
}

/** Strip the locu tag from Attio content to get the clean title */
function cleanAttioContent(content: string): string {
  return content.replace(LOCU_TAG_RE, "").trim();
}

// ─── Sync logic ─────────────────────────────────────────────────────────

export interface LocuSyncStats {
  created_in_locu: number;
  updated_in_locu: number;
  updated_in_attio: number;
  completed_in_locu: number;
  completed_in_attio: number;
}

export async function syncAttioLocu(
  attioApiKey: string,
  locuApiKey: string,
  locuProjectId?: string,
): Promise<LocuSyncStats> {
  const stats: LocuSyncStats = {
    created_in_locu: 0,
    updated_in_locu: 0,
    updated_in_attio: 0,
    completed_in_locu: 0,
    completed_in_attio: 0,
  };

  // 1. Fetch tasks from both services
  console.log("  Fetching Attio tasks...");
  const attioTasks = await getAttioTasks(attioApiKey);
  console.log(`  Found ${attioTasks.length} Attio tasks`);

  console.log("  Fetching Locu tasks (native only)...");
  const locuTasks = await getLocuTasks(locuApiKey);
  console.log(`  Found ${locuTasks.length} native Locu tasks`);

  // 2. Build lookup maps
  // Map: attioTaskId → LocuTask
  const locuByAttioId = new Map<string, LocuTask>();
  // Map: locuTaskId → AttioTask
  const attioByLocuId = new Map<string, AttioTask>();

  for (const lt of locuTasks) {
    const attioId = extractAttioIdFromName(lt.name);
    if (attioId) {
      locuByAttioId.set(attioId, lt);
    }
  }

  for (const at of attioTasks) {
    const locuId = extractLocuId(at.content_plaintext);
    if (locuId) {
      attioByLocuId.set(locuId, at);
    }
  }

  // 3. Process Attio tasks → sync to Locu
  for (const attioTask of attioTasks) {
    const attioId = attioTask.id.task_id;
    const existingLocu = locuByAttioId.get(attioId);

    if (!existingLocu) {
      const cleanContent = cleanAttioContent(attioTask.content_plaintext);
      if (!cleanContent) continue;

      // Skip already-completed Attio tasks
      if (attioTask.is_completed) {
        continue;
      }

      // Check if previously linked (has [locu:XXX] tag)
      const previousLocuId = extractLocuId(attioTask.content_plaintext);
      if (previousLocuId) {
        // Locu task is gone — mark Attio task as completed
        console.log(`  ✓ Locu task gone, completing in Attio: "${cleanContent}"`);
        await updateAttioTask(attioApiKey, attioId, { is_completed: true });
        stats.completed_in_attio++;
        continue;
      }

      // Create new task in Locu
      const locuName = buildLocuName(cleanContent, attioId, attioTask.deadline_at);
      console.log(`  → Creating in Locu: "${locuName}"`);
      const created = await createLocuTask(locuApiKey, {
        name: locuName,
        section: "sooner",
        projectId: locuProjectId,
      });

      // Write the Locu ID back into Attio task
      const updatedContent = appendLocuTag(attioTask.content_plaintext, created.id);
      await updateAttioTask(attioApiKey, attioId, { content: updatedContent });

      stats.created_in_locu++;
    } else {
      // Existing pair — sync updates
      await syncPair(attioApiKey, locuApiKey, attioTask, existingLocu, stats);
    }
  }

  // 4. Locu-only tasks are left as-is — no auto-creation in Attio

  return stats;
}

/**
 * Sync an existing pair of linked Attio + Locu tasks.
 */
async function syncPair(
  attioApiKey: string,
  locuApiKey: string,
  attioTask: AttioTask,
  locuTask: LocuTask,
  stats: LocuSyncStats,
): Promise<void> {
  const attioId = attioTask.id.task_id;
  const locuIsCompleted = locuTask.done === "completed";

  // ─── Completion sync ────────────────────────────────────────────
  if (attioTask.is_completed && !locuIsCompleted) {
    console.log(`  ✓ Completing in Locu: "${locuTask.name}"`);
    await updateLocuTask(locuApiKey, locuTask.id, { done: "completed" });
    stats.completed_in_locu++;
    return;
  }

  if (!attioTask.is_completed && locuIsCompleted) {
    const cleanContent = cleanAttioContent(attioTask.content_plaintext);
    console.log(`  ✓ Completing in Attio: "${cleanContent}"`);
    await updateAttioTask(attioApiKey, attioId, { is_completed: true });
    stats.completed_in_attio++;
    return;
  }

  // Both completed — nothing to do
  if (attioTask.is_completed && locuIsCompleted) return;

  // ─── Content sync (Attio is source of truth for name) ──────────
  const attioClean = cleanAttioContent(attioTask.content_plaintext);
  const expectedName = buildLocuName(attioClean, attioId, attioTask.deadline_at);
  if (attioClean && locuTask.name !== expectedName) {
    console.log(`  ↔ Syncing name to Locu: "${expectedName}"`);
    await updateLocuTask(locuApiKey, locuTask.id, { name: expectedName });
    stats.updated_in_locu++;
  }
}
