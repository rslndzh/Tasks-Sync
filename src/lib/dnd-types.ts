import type { LocalTask } from "@/types/local"
import type { InboxItem } from "@/types/inbox"
import type { SectionType } from "@/types/database"

export type TodayLane = "now" | "next"

/**
 * Discriminated union for all draggable item types in the app.
 * Carried via `active.data.current` during a drag operation.
 */
export type DragData =
  | { type: "task"; task: LocalTask }
  | { type: "inbox-item"; item: InboxItem; connectionId: string }
  | { type: "bucket"; bucketId: string }

/**
 * Identifies a drop target: either a section column or a sidebar bucket.
 * Encoded as the droppable `id` string — parsed by the DndProvider handlers.
 *
 * Format: "section:{section}:{bucketId}" or "bucket:{bucketId}"
 */
export function encodeSectionDroppableId(section: SectionType, bucketId: string): string {
  return `section:${section}:${bucketId}`
}

export function encodeTodayLaneDroppableId(lane: TodayLane, bucketId: string): string {
  return `today-lane:${lane}:${bucketId}`
}

export function encodeBucketDroppableId(bucketId: string): string {
  return `bucket:${bucketId}`
}

export type DroppableTarget =
  | { kind: "section"; section: SectionType; bucketId: string }
  | { kind: "today-lane"; lane: TodayLane; bucketId: string }
  | { kind: "bucket"; bucketId: string }
  | null

/** Parse a droppable ID string back into a structured target */
export function parseDroppableId(id: string): DroppableTarget {
  if (id.startsWith("today-lane:")) {
    const parts = id.split(":")
    return { kind: "today-lane", lane: parts[1] as TodayLane, bucketId: parts[2] }
  }
  if (id.startsWith("section:")) {
    const parts = id.split(":")
    return { kind: "section", section: parts[1] as SectionType, bucketId: parts[2] }
  }
  if (id.startsWith("bucket:")) {
    return { kind: "bucket", bucketId: id.slice(7) }
  }
  return null
}
