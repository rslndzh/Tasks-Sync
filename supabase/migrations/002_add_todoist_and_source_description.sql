-- Add todoist support to enums and source_description column to tasks
-- UP: Extends enums for Todoist integration, adds source_description for storing
-- original provider descriptions separately from user notes.

-- Add 'todoist' to task_source enum (manual, linear, attio → + todoist)
ALTER TYPE task_source ADD VALUE IF NOT EXISTS 'todoist';

-- Add 'todoist' to integration_type enum (linear, attio → + todoist)
ALTER TYPE integration_type ADD VALUE IF NOT EXISTS 'todoist';

-- Add source_description column to tasks table
-- Stores the original description from the integration provider (read-only).
-- User's own notes live in the existing `description` column.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_description TEXT;
