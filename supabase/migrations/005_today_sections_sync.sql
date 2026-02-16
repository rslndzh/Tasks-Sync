-- Sync support for Today Now/Next sections.
-- Adds:
-- 1) user-level toggle on profiles
-- 2) per-task lane on tasks

DO $$
BEGIN
  CREATE TYPE today_lane_type AS ENUM ('now', 'next');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS today_sections_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS today_lane today_lane_type;

-- Existing Today tasks default to "now" for deterministic behavior.
UPDATE tasks
SET today_lane = 'now'
WHERE section = 'today'
  AND status = 'active'
  AND today_lane IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_user_today_lane
  ON tasks (user_id, today_lane)
  WHERE status = 'active' AND section = 'today';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
  END IF;
END
$$;
