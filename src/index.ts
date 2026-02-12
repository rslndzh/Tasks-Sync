/**
 * Tasks Sync — Two-way sync between Attio/Linear and Todoist.
 *
 * Configuration lives in config.json (sync mappings) and .env (API keys).
 *
 * Usage:
 *   npm run sync          # run once
 *   npm run watch         # run on interval
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { getTodoistApi, findProjectByName } from "./todoist.js";
import { sync as syncAttio } from "./sync.js";
import { syncLinear } from "./sync-linear.js";

// ─── Config types ────────────────────────────────────────────────────────

interface AttioSyncConfig {
  todoistProject: string;
  apiKeyEnv: string;
}

interface LinearSyncConfig {
  teamKey: string;
  todoistProject: string;
  apiKeyEnv: string;
}

interface AppConfig {
  syncIntervalMinutes: number;
  attio: AttioSyncConfig[];
  linear: LinearSyncConfig[];
}

// ─── Load config ─────────────────────────────────────────────────────────

const config: AppConfig = JSON.parse(
  readFileSync(new URL("../config.json", import.meta.url), "utf-8")
);

const TODOIST_TOKEN = process.env.TODOIST_API_TOKEN;
const SYNC_INTERVAL = (config.syncIntervalMinutes ?? 5) * 60_000;
const WATCH_MODE = process.argv.includes("--watch");

if (!TODOIST_TOKEN) {
  console.error("❌ Missing TODOIST_API_TOKEN in .env");
  process.exit(1);
}

// ─── Resolved sync entries (with actual API keys & project IDs) ──────────

interface ResolvedAttioSync {
  apiKey: string;
  todoistProjectId: string;
  todoistProjectName: string;
}

interface ResolvedLinearSync {
  apiKey: string;
  teamKey: string;
  todoistProjectId: string;
  todoistProjectName: string;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const todoistApi = getTodoistApi(TODOIST_TOKEN!);

  // Resolve Attio syncs
  const attioSyncs: ResolvedAttioSync[] = [];
  for (const entry of config.attio) {
    const apiKey = process.env[entry.apiKeyEnv];
    if (!apiKey) {
      console.warn(`⚠️  Skipping Attio sync: ${entry.apiKeyEnv} not set in .env`);
      continue;
    }
    const projectId = await resolveProject(todoistApi, entry.todoistProject);
    if (!projectId) continue;
    attioSyncs.push({ apiKey, todoistProjectId: projectId, todoistProjectName: entry.todoistProject });
  }

  // Resolve Linear syncs
  const linearSyncs: ResolvedLinearSync[] = [];
  for (const entry of config.linear) {
    const apiKey = process.env[entry.apiKeyEnv];
    if (!apiKey) {
      console.warn(`⚠️  Skipping Linear sync (${entry.teamKey}): ${entry.apiKeyEnv} not set in .env`);
      continue;
    }
    const projectId = await resolveProject(todoistApi, entry.todoistProject);
    if (!projectId) continue;
    linearSyncs.push({
      apiKey,
      teamKey: entry.teamKey,
      todoistProjectId: projectId,
      todoistProjectName: entry.todoistProject,
    });
  }

  if (attioSyncs.length === 0 && linearSyncs.length === 0) {
    console.error("❌ No syncs configured. Check config.json and .env");
    process.exit(1);
  }

  console.log(`\nConfigured syncs: ${attioSyncs.length} Attio, ${linearSyncs.length} Linear\n`);

  if (WATCH_MODE) {
    console.log(
      `Running in watch mode — syncing every ${config.syncIntervalMinutes} minutes. Press Ctrl+C to stop.\n`
    );
    await runAllSyncs(todoistApi, attioSyncs, linearSyncs);
    setInterval(
      () => runAllSyncs(todoistApi, attioSyncs, linearSyncs),
      SYNC_INTERVAL
    );
  } else {
    await runAllSyncs(todoistApi, attioSyncs, linearSyncs);
  }
}

async function resolveProject(
  todoistApi: ReturnType<typeof getTodoistApi>,
  projectName: string
): Promise<string | null> {
  console.log(`Looking for Todoist project: "${projectName}"...`);
  const project = await findProjectByName(todoistApi, projectName);

  if (!project) {
    console.error(
      `⚠️  Todoist project "${projectName}" not found. Skipping this sync.`
    );
    const all = await todoistApi.getProjects();
    console.error(`   Available projects: ${all.results.map((p) => p.name).join(", ")}`);
    return null;
  }

  console.log(`Found project: "${project.name}" (${project.id})`);
  return project.id;
}

async function runAllSyncs(
  todoistApi: ReturnType<typeof getTodoistApi>,
  attioSyncs: ResolvedAttioSync[],
  linearSyncs: ResolvedLinearSync[]
) {
  const timestamp = new Date().toLocaleTimeString();

  // ─── Attio syncs ───────────────────────────────────────────────
  for (const entry of attioSyncs) {
    console.log(`\n[${timestamp}] Starting Attio → Todoist sync (${entry.todoistProjectName})...`);
    try {
      const stats = await syncAttio(todoistApi, entry.apiKey, entry.todoistProjectId);
      console.log(`[${timestamp}] Attio sync complete (${entry.todoistProjectName}):`);
      console.log(`  Created in Todoist:   ${stats.created_in_todoist}`);
      console.log(`  Updated in Todoist:   ${stats.updated_in_todoist}`);
      console.log(`  Updated in Attio:     ${stats.updated_in_attio}`);
      console.log(`  Completed in Todoist: ${stats.completed_in_todoist}`);
      console.log(`  Completed in Attio:   ${stats.completed_in_attio}`);
    } catch (err) {
      console.error(`[${timestamp}] Attio sync failed (${entry.todoistProjectName}):`, err);
    }
  }

  // ─── Linear syncs ──────────────────────────────────────────────
  for (const entry of linearSyncs) {
    console.log(`\n[${timestamp}] Starting Linear → Todoist sync (${entry.teamKey} → ${entry.todoistProjectName})...`);
    try {
      const stats = await syncLinear(
        todoistApi,
        entry.apiKey,
        entry.teamKey,
        entry.todoistProjectId
      );
      console.log(`[${timestamp}] Linear sync complete (${entry.teamKey} → ${entry.todoistProjectName}):`);
      console.log(`  Created in Todoist:   ${stats.created_in_todoist}`);
      console.log(`  Updated in Todoist:   ${stats.updated_in_todoist}`);
      console.log(`  Updated in Linear:    ${stats.updated_in_linear}`);
      console.log(`  Completed in Todoist: ${stats.completed_in_todoist}`);
      console.log(`  Completed in Linear:  ${stats.completed_in_linear}`);
    } catch (err) {
      console.error(`[${timestamp}] Linear sync failed (${entry.teamKey} → ${entry.todoistProjectName}):`, err);
    }
  }

  console.log("");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
