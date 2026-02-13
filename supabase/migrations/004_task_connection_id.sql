-- Add connection_id to tasks for two-way sync (maps task → integration connection → API key)
ALTER TABLE tasks ADD COLUMN connection_id UUID REFERENCES integrations ON DELETE SET NULL;

-- Partial index for efficient lookups on integration tasks
CREATE INDEX idx_tasks_connection_id ON tasks (connection_id) WHERE connection_id IS NOT NULL;
