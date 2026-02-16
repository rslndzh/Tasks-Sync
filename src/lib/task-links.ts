import type { LocalTask } from "@/types/local"

/**
 * Build a provider URL for an imported task.
 * Returns null when the provider doesn't have a stable deep link from local data.
 */
export function getTaskSourceUrl(task: Pick<LocalTask, "source" | "source_id">): string | null {
  if (!task.source_id) return null

  switch (task.source) {
    case "todoist":
      return `https://todoist.com/showTask?id=${encodeURIComponent(task.source_id)}`
    case "linear":
      return `https://linear.app/issue/${encodeURIComponent(task.source_id)}`
    default:
      return null
  }
}

export function getTaskAppUrl(taskId: string): string {
  if (typeof window === "undefined") return `/task/${taskId}`
  return `${window.location.origin}/task/${taskId}`
}

