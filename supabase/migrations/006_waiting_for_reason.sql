-- Add waiting_for_reason column to tasks for "Waiting For" workflow.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS waiting_for_reason TEXT;

