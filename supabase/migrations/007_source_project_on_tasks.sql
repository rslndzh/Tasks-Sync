-- Add provider project/list/workspace label for imported tasks.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source_project TEXT;
