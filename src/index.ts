/**
 * Tasks Sync — Two-way sync between Attio/Linear/Locu and Todoist.
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
import { sync as syncAttioTodoist } from "./sync.js";
import { syncLinear } from "./sync-linear.js";
import { syncAttioLocu } from "./sync-locu.js";
import { findLocuProjectByName } from "./locu.js";

// ─── Config types ────────────────────────────────────────────────────────

interface AttioSyncConfig {
  enabled?: boolean;
  todoistProject: string;
  apiKeyEnv: string;
}

interface LinearSyncConfig {
  enabled?: boolean;
  teamKey: string;
  todoistProject: string;
  apiKeyEnv: string;
}

interface AttioLocuSyncConfig {
  enabled?: boolean;
  attioApiKeyEnv: string;
  locuApiKeyEnv: string;
  locuProject?: string;
}

interface AppConfig {
  syncIntervalMinutes: number;
  attio: AttioSyncConfig[];
  linear: LinearSyncConfig[];
  attioLocu?: AttioLocuSyncConfig[];
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

interface ResolvedAttioLocuSync {
  attioApiKey: string;
  locuApiKey: string;
  locuProjectId?: string;
  locuProjectName?: string;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const todoistApi = getTodoistApi(TODOIST_TOKEN!);

  // Resolve Attio → Todoist syncs
  const attioSyncs: ResolvedAttioSync[] = [];
  for (const entry of config.attio) {
    if (entry.enabled === false) {
      console.log(`⏸  Attio→Todoist sync disabled: ${entry.todoistProject}`);
      continue;
    }
    const apiKey = process.env[entry.apiKeyEnv];
    if (!apiKey) {
      console.warn(`⚠️  Skipping Attio→Todoist sync: ${entry.apiKeyEnv} not set in .env`);
      continue;
    }
    const projectId = await resolveProject(todoistApi, entry.todoistProject);
    if (!projectId) continue;
    attioSyncs.push({ apiKey, todoistProjectId: projectId, todoistProjectName: entry.todoistProject });
  }

  // Resolve Linear → Todoist syncs
  const linearSyncs: ResolvedLinearSync[] = [];
  for (const entry of config.linear) {
    if (entry.enabled === false) {
      console.log(`⏸  Linear sync disabled: ${entry.teamKey} → ${entry.todoistProject}`);
      continue;
    }
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

  // Resolve Attio ↔ Locu syncs
  const attioLocuSyncs: ResolvedAttioLocuSync[] = [];
  for (const entry of config.attioLocu ?? []) {
    if (entry.enabled === false) {
      console.log(`⏸  Attio↔Locu sync disabled`);
      continue;
    }
    const attioApiKey = process.env[entry.attioApiKeyEnv];
    const locuApiKey = process.env[entry.locuApiKeyEnv];
    if (!attioApiKey) {
      console.warn(`⚠️  Skipping Attio↔Locu sync: ${entry.attioApiKeyEnv} not set in .env`);
      continue;
    }
    if (!locuApiKey) {
      console.warn(`⚠️  Skipping Attio↔Locu sync: ${entry.locuApiKeyEnv} not set in .env`);
      continue;
    }

    let locuProjectId: string | undefined;
    if (entry.locuProject) {
      console.log(`Looking for Locu project: "${entry.locuProject}"...`);
      const project = await findLocuProjectByName(locuApiKey, entry.locuProject);
      if (!project) {
        console.warn(`⚠️  Locu project "${entry.locuProject}" not found. Tasks will be created without a project.`);
      } else {
        console.log(`Found Locu project: "${project.name}" (${project.id})`);
        locuProjectId = project.id;
      }
    }

    attioLocuSyncs.push({ attioApiKey, locuApiKey, locuProjectId, locuProjectName: entry.locuProject });
  }

  const totalSyncs = attioSyncs.length + linearSyncs.length + attioLocuSyncs.length;
  if (totalSyncs === 0) {
    console.error("❌ No syncs configured. Check config.json and .env");
    process.exit(1);
  }

  console.log(`\nConfigured syncs: ${attioSyncs.length} Attio→Todoist, ${linearSyncs.length} Linear→Todoist, ${attioLocuSyncs.length} Attio↔Locu\n`);

  if (WATCH_MODE) {
    console.log(
      `Running in watch mode — syncing every ${config.syncIntervalMinutes} minutes. Press Ctrl+C to stop.\n`
    );
    await runAllSyncs(todoistApi, attioSyncs, linearSyncs, attioLocuSyncs);
    setInterval(
      () => runAllSyncs(todoistApi, attioSyncs, linearSyncs, attioLocuSyncs),
      SYNC_INTERVAL
    );
  } else {
    await runAllSyncs(todoistApi, attioSyncs, linearSyncs, attioLocuSyncs);
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
  linearSyncs: ResolvedLinearSync[],
  attioLocuSyncs: ResolvedAttioLocuSync[]
) {
  const timestamp = new Date().toLocaleTimeString();

  // ─── Attio → Todoist syncs ─────────────────────────────────────
  for (const entry of attioSyncs) {
    console.log(`\n[${timestamp}] Starting Attio → Todoist sync (${entry.todoistProjectName})...`);
    try {
      const stats = await syncAttioTodoist(todoistApi, entry.apiKey, entry.todoistProjectId);
      console.log(`[${timestamp}] Attio→Todoist sync complete (${entry.todoistProjectName}):`);
      console.log(`  Created in Todoist:   ${stats.created_in_todoist}`);
      console.log(`  Updated in Todoist:   ${stats.updated_in_todoist}`);
      console.log(`  Updated in Attio:     ${stats.updated_in_attio}`);
      console.log(`  Completed in Todoist: ${stats.completed_in_todoist}`);
      console.log(`  Completed in Attio:   ${stats.completed_in_attio}`);
    } catch (err) {
      console.error(`[${timestamp}] Attio→Todoist sync failed (${entry.todoistProjectName}):`, err);
    }
  }

  // ─── Linear → Todoist syncs ────────────────────────────────────
  for (const entry of linearSyncs) {
    console.log(`\n[${timestamp}] Starting Linear → Todoist sync (${entry.teamKey} → ${entry.todoistProjectName})...`);
    try {
      const stats = await syncLinear(
        todoistApi,
        entry.apiKey,
        entry.teamKey,
        entry.todoistProjectId
      );
      console.log(`[${timestamp}] Linear→Todoist sync complete (${entry.teamKey} → ${entry.todoistProjectName}):`);
      console.log(`  Created in Todoist:   ${stats.created_in_todoist}`);
      console.log(`  Updated in Todoist:   ${stats.updated_in_todoist}`);
      console.log(`  Updated in Linear:    ${stats.updated_in_linear}`);
      console.log(`  Completed in Todoist: ${stats.completed_in_todoist}`);
      console.log(`  Completed in Linear:  ${stats.completed_in_linear}`);
    } catch (err) {
      console.error(`[${timestamp}] Linear→Todoist sync failed (${entry.teamKey} → ${entry.todoistProjectName}):`, err);
    }
  }

  // ─── Attio ↔ Locu syncs ───────────────────────────────────────
  for (const entry of attioLocuSyncs) {
    const label = entry.locuProjectName ? `Attio ↔ Locu (${entry.locuProjectName})` : "Attio ↔ Locu";
    console.log(`\n[${timestamp}] Starting ${label} sync...`);
    try {
      const stats = await syncAttioLocu(entry.attioApiKey, entry.locuApiKey, entry.locuProjectId);
      console.log(`[${timestamp}] ${label} sync complete:`);
      console.log(`  Created in Locu:      ${stats.created_in_locu}`);
      console.log(`  Updated in Locu:      ${stats.updated_in_locu}`);
      console.log(`  Updated in Attio:     ${stats.updated_in_attio}`);
      console.log(`  Completed in Locu:    ${stats.completed_in_locu}`);
      console.log(`  Completed in Attio:   ${stats.completed_in_attio}`);
    } catch (err) {
      console.error(`[${timestamp}] ${label} sync failed:`, err);
    }
  }

  console.log("");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
