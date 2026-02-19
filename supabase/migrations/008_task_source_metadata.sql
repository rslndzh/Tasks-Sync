-- Add flexible integration metadata bag for tasks.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source_metadata JSONB;

-- Backfill standardized metadata keys from legacy columns.
UPDATE tasks
SET source_metadata = CASE
  WHEN jsonb_strip_nulls(
    COALESCE(source_metadata, '{}'::jsonb) ||
    jsonb_build_object(
      'project', source_project,
      'description', source_description
    )
  ) = '{}'::jsonb
  THEN NULL
  ELSE jsonb_strip_nulls(
    COALESCE(source_metadata, '{}'::jsonb) ||
    jsonb_build_object(
      'project', source_project,
      'description', source_description
    )
  )
END
WHERE source_metadata IS NULL
   OR source_project IS NOT NULL
   OR source_description IS NOT NULL;
