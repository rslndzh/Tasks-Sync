import { db } from "@/lib/db"
import { getCurrentUserId } from "@/lib/auth"
import type { ImportRule } from "@/types/import-rule"
import type { InboxItem } from "@/types/inbox"
import { mapInboxItemToLocalTask } from "@/types/inbox"
import type { IntegrationType } from "@/types/database"

/**
 * Import engine — applies rules to normalized inbox items from any provider.
 *
 * For each item:
 * 1. Check if already imported (by source_id) → skip
 * 2. Check active rules for matching source → auto-bucket
 * 3. No matching rule → leave in inbox (not imported)
 *
 * Rules only affect NEW imports. Existing tasks are never rebucketed.
 */
export async function applyImportRules(
  items: InboxItem[],
  rules: ImportRule[],
  userId: string = getCurrentUserId(),
): Promise<{ imported: number; autoRouted: number; skipped: number }> {
  const activeRules = rules.filter((r) => r.is_active)
  let imported = 0
  let autoRouted = 0
  let skipped = 0

  for (const item of items) {
    // Check for duplicate
    const existing = await db.tasks
      .where("source_id")
      .equals(item.sourceId)
      .first()

    if (existing) {
      skipped++
      continue
    }

    // Find matching rule based on provider type
    const matchingRule = findMatchingRule(item, activeRules)

    if (!matchingRule) {
      // No rule matches — item stays in inbox for manual triage
      continue
    }

    if (!matchingRule.target_bucket_id) {
      // Corrupted or cleared rule target — skip import until user picks a bucket
      skipped++
      continue
    }

    // Count tasks in target bucket for position
    const position = await db.tasks
      .where("[user_id+bucket_id]")
      .equals([userId, matchingRule.target_bucket_id])
      .count()

    const task = mapInboxItemToLocalTask(
      item,
      userId,
      matchingRule.target_bucket_id,
      matchingRule.target_section,
      position,
    )

    await db.tasks.put(task)
    imported++
    autoRouted++
  }

  return { imported, autoRouted, skipped }
}

/**
 * Match an inbox item against active rules by provider type and source filter.
 */
function findMatchingRule(item: InboxItem, rules: ImportRule[]): ImportRule | undefined {
  const providerRules = rules.filter((r) => r.integration_type === item.sourceType)
  if (providerRules.length === 0) return undefined

  const metadata = item.metadata as Record<string, unknown>

  return providerRules.find((rule) => {
    return matchesSourceFilter(item.sourceType, rule, metadata)
  })
}

function matchesSourceFilter(
  type: IntegrationType,
  rule: ImportRule,
  metadata: Record<string, unknown>,
): boolean {
  switch (type) {
    case "linear":
      return rule.source_filter.teamId === metadata.teamId
    case "todoist":
      return rule.source_filter.projectId === metadata.projectId
    case "attio":
      // "all" matches everything for Attio
      return rule.source_filter.listId === "all" || rule.source_filter.listId === metadata.listId
    default:
      return false
  }
}
