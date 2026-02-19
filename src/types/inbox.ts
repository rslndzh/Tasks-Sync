import type { IntegrationType } from "@/types/database"
import type { LocalTask } from "@/types/local"

/**
 * Normalized inbox item — shared shape across all integration providers.
 * Linear issues, Todoist tasks, and Attio tasks all map to this.
 */
export interface InboxItem {
  /** Unique ID within the provider (e.g. Linear issue ID, Todoist task ID) */
  id: string
  /** Which connection fetched this item */
  connectionId: string
  /** Provider type */
  sourceType: IntegrationType
  /** Provider-specific identifier (e.g. "ENG-123" for Linear) */
  sourceId: string
  /** Task title */
  title: string
  /** Secondary info: team name, project, etc. */
  subtitle: string | null
  /** Provider-specific metadata bag */
  metadata: Record<string, unknown>
  /** URL to open in provider's UI */
  url: string | null
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Provider project/list/workspace label for imported tasks.
 * Linear/Todoist: projectName, Attio: list/workspace fallback.
 */
export function deriveSourceProject(item: InboxItem): string | null {
  const metadata = item.metadata as Record<string, unknown>

  if (item.sourceType === "linear" || item.sourceType === "todoist") {
    return toNonEmptyString(metadata.projectName)
  }

  if (item.sourceType === "attio") {
    return (
      toNonEmptyString(metadata.projectName) ??
      toNonEmptyString(metadata.listName) ??
      toNonEmptyString(metadata.workspaceName) ??
      toNonEmptyString(metadata.workspaceId)
    )
  }

  return null
}

/**
 * Convert a normalized InboxItem into a LocalTask ready for Dexie.
 * Caller provides the target bucket + section.
 */
export function mapInboxItemToLocalTask(
  item: InboxItem,
  userId: string,
  bucketId: string,
  section: "today" | "sooner" | "later",
  position: number,
  todayLane?: "now" | "next",
): LocalTask {
  // Pull original description from provider metadata if available
  const sourceDesc = typeof item.metadata.description === "string" ? item.metadata.description : null
  const sourceProject = deriveSourceProject(item)

  return {
    id: crypto.randomUUID(),
    user_id: userId,
    title: item.title,
    description: null,
    source_description: sourceDesc,
    source_project: sourceProject,
    status: "active",
    source: item.sourceType,
    source_id: item.sourceId,
    connection_id: item.connectionId,
    bucket_id: bucketId,
    section,
    today_lane: section === "today" ? (todayLane ?? "now") : null,
    estimate_minutes: null,
    position,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
  }
}
