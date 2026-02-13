-- =============================================================================
-- Migration 003: Add columns to sync integration connections across devices
-- =============================================================================
-- The integrations table now stores API keys and connection settings so that
-- a user signing in on a new device gets their integrations automatically.

ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS api_key TEXT,
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS default_bucket_id UUID REFERENCES buckets ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_section section_type DEFAULT 'sooner',
  ADD COLUMN IF NOT EXISTS auto_import BOOLEAN DEFAULT FALSE;

-- import_rules: add integration_type for local schema compatibility,
-- and make integration_id nullable (local rules use type, not id)
ALTER TABLE import_rules
  ADD COLUMN IF NOT EXISTS integration_type integration_type,
  ALTER COLUMN integration_id DROP NOT NULL;

-- Enable realtime for integrations and import_rules
ALTER PUBLICATION supabase_realtime ADD TABLE integrations;
ALTER PUBLICATION supabase_realtime ADD TABLE import_rules;
