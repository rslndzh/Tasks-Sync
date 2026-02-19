function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function getFirstString(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null
  for (const key of keys) {
    const next = toNonEmptyString(record[key])
    if (next) return next
  }
  return null
}

export function getSourceMetadataProject(sourceMetadata: unknown): string | null {
  const record = toRecord(sourceMetadata)
  return getFirstString(record, ["project", "projectName", "listName", "workspaceName"])
}

export function getSourceMetadataDescription(sourceMetadata: unknown): string | null {
  const record = toRecord(sourceMetadata)
  return getFirstString(record, ["description", "sourceDescription"])
}

export function normalizeTaskSourceMetadata(
  sourceMetadata: unknown,
  legacy?: { project?: unknown; description?: unknown; url?: unknown },
): Record<string, unknown> | null {
  const next = toRecord(sourceMetadata) ? { ...(sourceMetadata as Record<string, unknown>) } : {}

  const project = toNonEmptyString(legacy?.project)
  if (project && !getSourceMetadataProject(next)) {
    next.project = project
  }

  const description = toNonEmptyString(legacy?.description)
  if (description && !getSourceMetadataDescription(next)) {
    next.description = description
  }

  const url = toNonEmptyString(legacy?.url)
  if (url && !toNonEmptyString(next.url)) {
    next.url = url
  }

  return Object.keys(next).length > 0 ? next : null
}

export function getTaskSourceProject(task: {
  source_metadata?: unknown
  source_project?: unknown
}): string | null {
  return getSourceMetadataProject(task.source_metadata) ?? toNonEmptyString(task.source_project)
}

export function sourceMetadataSignature(sourceMetadata: unknown): string {
  return JSON.stringify(sourceMetadata ?? null)
}
