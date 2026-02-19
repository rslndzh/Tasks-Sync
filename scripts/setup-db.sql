-- =============================================================================
-- Flowpin — Complete Database Setup
-- =============================================================================
-- Run this in the Supabase SQL Editor to set up all tables, RLS, and triggers.
-- Combines 001_initial_schema.sql + 002_add_todoist_and_source_description.sql
--
-- Steps:
--   1. Go to https://supabase.com/dashboard → your project → SQL Editor
--   2. Click "New query"
--   3. Paste this entire file
--   4. Click "Run"
-- =============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE section_type AS ENUM ('today', 'sooner', 'later');
CREATE TYPE task_source AS ENUM ('manual', 'linear', 'attio', 'todoist');
CREATE TYPE task_status AS ENUM ('active', 'completed', 'archived');
CREATE TYPE integration_type AS ENUM ('linear', 'attio', 'todoist');
CREATE TYPE today_lane_type AS ENUM ('now', 'next');

-- ============================================================================
-- TABLES
-- ============================================================================

-- User profiles (extends Supabase Auth)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  default_import_section section_type NOT NULL DEFAULT 'sooner',
  today_sections_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User-created buckets (lists/projects). Each has Today/Sooner/Later sections.
CREATE TABLE buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tasks: manual + imported, all in one table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  source_description TEXT,
  source_project TEXT,
  status task_status NOT NULL DEFAULT 'active',
  source task_source NOT NULL DEFAULT 'manual',
  source_id TEXT,
  connection_id UUID REFERENCES integrations ON DELETE SET NULL,
  bucket_id UUID REFERENCES buckets ON DELETE SET NULL,
  section section_type NOT NULL DEFAULT 'sooner',
  today_lane today_lane_type,
  estimate_minutes INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, source, source_id)
);

-- Integration connections (synced across devices, including API keys)
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles ON DELETE CASCADE,
  type integration_type NOT NULL,
  api_key TEXT,
  label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  default_bucket_id UUID REFERENCES buckets ON DELETE SET NULL,
  default_section section_type DEFAULT 'sooner',
  auto_import BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-import routing rules
CREATE TABLE import_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles ON DELETE CASCADE,
  integration_id UUID REFERENCES integrations ON DELETE CASCADE,
  integration_type integration_type,
  source_filter JSONB NOT NULL,
  target_bucket_id UUID REFERENCES buckets ON DELETE SET NULL,
  target_section section_type NOT NULL DEFAULT 'sooner',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Focus sessions (parent container for time entries)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  device_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Time entries: splits within a session when user switches tasks
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  device_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_buckets_user ON buckets (user_id, position);
CREATE INDEX idx_tasks_user_bucket_section ON tasks (user_id, bucket_id, section) WHERE status = 'active';
CREATE INDEX idx_tasks_user_section ON tasks (user_id, section) WHERE status = 'active';
CREATE INDEX idx_tasks_user_today_lane ON tasks (user_id, today_lane) WHERE status = 'active' AND section = 'today';
CREATE INDEX idx_tasks_user_source ON tasks (user_id, source) WHERE status = 'active';
CREATE INDEX idx_tasks_connection_id ON tasks (connection_id) WHERE connection_id IS NOT NULL;
CREATE INDEX idx_sessions_user_active ON sessions (user_id) WHERE is_active = TRUE;
CREATE INDEX idx_time_entries_session ON time_entries (session_id);
CREATE INDEX idx_time_entries_user_date ON time_entries (user_id, started_at);
CREATE INDEX idx_import_rules_integration ON import_rules (integration_id) WHERE is_active = TRUE;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only access their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Buckets: users can only CRUD their own buckets
CREATE POLICY "Users can view own buckets"
  ON buckets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own buckets"
  ON buckets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own buckets"
  ON buckets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own buckets"
  ON buckets FOR DELETE USING (auth.uid() = user_id);

-- Tasks: users can only CRUD their own tasks
CREATE POLICY "Users can view own tasks"
  ON tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tasks"
  ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tasks"
  ON tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tasks"
  ON tasks FOR DELETE USING (auth.uid() = user_id);

-- Integrations: users can only CRUD their own
CREATE POLICY "Users can view own integrations"
  ON integrations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own integrations"
  ON integrations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own integrations"
  ON integrations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own integrations"
  ON integrations FOR DELETE USING (auth.uid() = user_id);

-- Import rules: users can only CRUD their own
CREATE POLICY "Users can view own import_rules"
  ON import_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own import_rules"
  ON import_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own import_rules"
  ON import_rules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own import_rules"
  ON import_rules FOR DELETE USING (auth.uid() = user_id);

-- Sessions: users can only CRUD their own
CREATE POLICY "Users can view own sessions"
  ON sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions"
  ON sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions"
  ON sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions"
  ON sessions FOR DELETE USING (auth.uid() = user_id);

-- Time entries: users can only CRUD their own
CREATE POLICY "Users can view own time_entries"
  ON time_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own time_entries"
  ON time_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own time_entries"
  ON time_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own time_entries"
  ON time_entries FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-create profile row + default "Inbox" bucket when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  new_profile_id UUID;
BEGIN
  new_profile_id := NEW.id;

  -- Create profile
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    new_profile_id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email)
  );

  -- Create default "Inbox" bucket
  INSERT INTO public.buckets (user_id, name, position, is_default)
  VALUES (new_profile_id, 'Inbox', 0, TRUE);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at timestamp on row changes
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON buckets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON import_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- REALTIME: Enable for synced tables
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE buckets;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE time_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE integrations;
ALTER PUBLICATION supabase_realtime ADD TABLE import_rules;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- ============================================================================
-- BACKFILL: Create profile for any existing auth users (created before this schema)
-- ============================================================================

INSERT INTO profiles (id, display_name)
SELECT id, COALESCE(raw_user_meta_data ->> 'display_name', email)
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;
