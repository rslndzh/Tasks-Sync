import type { IntegrationType, SectionType } from "./database"

/**
 * Polymorphic source filter — shape depends on integration_type.
 * Linear: { teamId, teamName }
 * Todoist: { projectId, projectName }
 * Attio: { listId, listName }
 */
export interface ImportRuleSourceFilter {
  teamId?: string
  teamName?: string
  projectId?: string
  projectName?: string
  listId?: string
  listName?: string
}

export interface ImportRule {
  id: string
  user_id: string
  integration_type: IntegrationType
  source_filter: ImportRuleSourceFilter
  target_bucket_id: string
  target_section: SectionType
  is_active: boolean
  created_at: string
  updated_at: string
}
