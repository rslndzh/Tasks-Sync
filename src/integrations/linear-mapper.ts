import type { LinearIssue } from "@/types/linear"
import type { InboxItem } from "@/types/inbox"

/**
 * Map a Linear issue to the normalized InboxItem shape.
 */
export function mapLinearIssueToInboxItem(
  issue: LinearIssue,
  connectionId: string,
): InboxItem {
  return {
    id: issue.id,
    connectionId,
    sourceType: "linear",
    sourceId: issue.id,
    title: `[${issue.identifier}] ${issue.title}`,
    subtitle: issue.team?.name ?? null,
    metadata: {
      identifier: issue.identifier,
      description: issue.description,
      teamId: issue.team?.id,
      teamName: issue.team?.name,
      teamKey: issue.team?.key,
      projectId: issue.project?.id ?? null,
      projectName: issue.project?.name ?? null,
      state: issue.state?.name,
      stateType: issue.state?.type,
      estimate: issue.estimate,
    },
    url: issue.url ?? null,
  }
}
