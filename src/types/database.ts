/**
 * Supabase database types for Flowpin.
 *
 * These are manually defined to match the migration schema.
 * Once connected to a live Supabase project, regenerate with:
 *   npx supabase gen types typescript --local > src/types/database.ts
 */

export type SectionType = "today" | "sooner" | "later"
export type TaskSource = "manual" | "linear" | "todoist" | "attio"
export type TaskStatus = "active" | "completed" | "archived"
export type IntegrationType = "linear" | "todoist" | "attio"
export type TodayLaneType = "now" | "next"

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          onboarding_completed: boolean
          default_import_section: SectionType
          today_sections_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          onboarding_completed?: boolean
          default_import_section?: SectionType
          today_sections_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          onboarding_completed?: boolean
          default_import_section?: SectionType
          today_sections_enabled?: boolean
          updated_at?: string
        }
      }
      buckets: {
        Row: {
          id: string
          user_id: string
          name: string
          icon: string | null
          color: string | null
          position: number
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          icon?: string | null
          color?: string | null
          position?: number
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          icon?: string | null
          color?: string | null
          position?: number
          is_default?: boolean
          updated_at?: string
        }
      }
      tasks: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          source_description: string | null
          source_project: string | null
          status: TaskStatus
          source: TaskSource
          source_id: string | null
          connection_id: string | null
          bucket_id: string | null
          section: SectionType
          today_lane: TodayLaneType | null
          estimate_minutes: number | null
          position: number
          created_at: string
          updated_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          source_description?: string | null
          source_project?: string | null
          status?: TaskStatus
          source?: TaskSource
          source_id?: string | null
          connection_id?: string | null
          bucket_id?: string | null
          section?: SectionType
          today_lane?: TodayLaneType | null
          estimate_minutes?: number | null
          position?: number
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
        Update: {
          title?: string
          description?: string | null
          source_description?: string | null
          source_project?: string | null
          status?: TaskStatus
          source?: TaskSource
          source_id?: string | null
          connection_id?: string | null
          bucket_id?: string | null
          section?: SectionType
          today_lane?: TodayLaneType | null
          estimate_minutes?: number | null
          position?: number
          updated_at?: string
          completed_at?: string | null
        }
      }
      integrations: {
        Row: {
          id: string
          user_id: string
          type: IntegrationType
          api_key: string | null
          label: string | null
          metadata: Record<string, unknown>
          is_active: boolean
          last_synced_at: string | null
          default_bucket_id: string | null
          default_section: SectionType
          auto_import: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: IntegrationType
          api_key?: string | null
          label?: string | null
          metadata?: Record<string, unknown>
          is_active?: boolean
          last_synced_at?: string | null
          default_bucket_id?: string | null
          default_section?: SectionType
          auto_import?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          type?: IntegrationType
          api_key?: string | null
          label?: string | null
          metadata?: Record<string, unknown>
          is_active?: boolean
          last_synced_at?: string | null
          default_bucket_id?: string | null
          default_section?: SectionType
          auto_import?: boolean
          updated_at?: string
        }
      }
      import_rules: {
        Row: {
          id: string
          user_id: string
          integration_id: string | null
          integration_type: IntegrationType | null
          source_filter: Record<string, unknown>
          target_bucket_id: string | null
          target_section: SectionType
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          integration_id?: string | null
          integration_type?: IntegrationType | null
          source_filter: Record<string, unknown>
          target_bucket_id?: string | null
          target_section?: SectionType
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          integration_id?: string | null
          integration_type?: IntegrationType | null
          source_filter?: Record<string, unknown>
          target_bucket_id?: string | null
          target_section?: SectionType
          is_active?: boolean
          updated_at?: string
        }
      }
      sessions: {
        Row: {
          id: string
          user_id: string
          task_id: string
          started_at: string
          ended_at: string | null
          is_active: boolean
          device_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          task_id: string
          started_at?: string
          ended_at?: string | null
          is_active?: boolean
          device_id: string
          created_at?: string
        }
        Update: {
          task_id?: string
          started_at?: string
          ended_at?: string | null
          is_active?: boolean
          device_id?: string
        }
      }
      time_entries: {
        Row: {
          id: string
          user_id: string
          session_id: string
          task_id: string
          started_at: string
          ended_at: string | null
          duration_seconds: number | null
          device_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          session_id: string
          task_id: string
          started_at?: string
          ended_at?: string | null
          duration_seconds?: number | null
          device_id: string
          created_at?: string
        }
        Update: {
          session_id?: string
          task_id?: string
          started_at?: string
          ended_at?: string | null
          duration_seconds?: number | null
          device_id?: string
        }
      }
    }
    Enums: {
      section_type: SectionType
      task_source: TaskSource
      task_status: TaskStatus
      integration_type: IntegrationType
      today_lane_type: TodayLaneType
    }
  }
}
