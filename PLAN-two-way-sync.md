# Two-Way Integration Sync

**Overall Progress:** `100%`

## TLDR
Complete a task in Flowpin and it closes in Todoist/Linear/Attio; complete it there and it closes here — true bidirectional sync across all three providers.

## Critical Decisions
- **`connection_id` on tasks**: Full migration now (types, Dexie v6, Supabase column) so we reliably map task → connection → API key, even with multiple connections of the same type.
- **Archive = Flowpin-only**: Archiving/deleting a task in Flowpin does NOT close it in the source. The user can re-import it later.
- **Title edits stay local**: Editing a task title in Flowpin does not push back to the source (for now).
- **Inbound detection by absence**: If a previously imported `source_id` disappears from the active fetch, it was completed externally → mark completed locally.
- **Optimistic writeback with rollback**: Complete/uncomplete locally immediately for snappy UX, then fire the source API call. If it fails, roll the task back to its previous state and show an error toast.
- **Loop prevention**: Inbound completion skips outbound writeback to avoid infinite loops.

## Tasks:

- [ ] 🟥 **Step 1: `connection_id` migration — types & local schema**
  - Files: `src/types/local.ts`, `src/types/database.ts`, `src/types/inbox.ts`, `src/stores/useTaskStore.ts`, `src/stores/useIntegrationStore.ts`, `src/lib/db.ts`
  - [ ] 🟥 Add `connection_id: string | null` to `LocalTask` interface
  - [ ] 🟥 Add `connection_id` to `database.ts` tasks Row/Insert/Update types
  - [ ] 🟥 Update `mapInboxItemToLocalTask` to accept and store `connectionId`
  - [ ] 🟥 Update `addTask` in useTaskStore to set `connection_id: null`
  - [ ] 🟥 Update `importIssueToTask` in useIntegrationStore to set `connection_id: null` (legacy path)
  - [ ] 🟥 Bump Dexie to v6 — add `connection_id` to tasks store definition
  - Edge cases: Existing tasks get `connection_id = null`. For single-connection-per-type users, runtime lookup by `task.source` works as fallback.

- [ ] 🟥 **Step 2: `connection_id` migration — Supabase**
  - Files: `supabase/migrations/004_task_connection_id.sql`, `scripts/setup-db.sql`
  - [ ] 🟥 Create migration: `ALTER TABLE tasks ADD COLUMN connection_id UUID REFERENCES integrations ON DELETE SET NULL`
  - [ ] 🟥 Add index: `CREATE INDEX idx_tasks_connection_id ON tasks (connection_id) WHERE connection_id IS NOT NULL`
  - [ ] 🟥 Update `scripts/setup-db.sql` to include `connection_id` in the tasks table definition
  - Edge cases: Existing rows get `NULL`. No data loss.

- [ ] 🟥 **Step 3: Provider write helpers**
  - Files: `src/integrations/todoist.ts`, `src/integrations/linear.ts`, `src/integrations/attio.ts`
  - [ ] 🟥 **Todoist**: Add `todoistPost` helper. Add `closeTodoistTask(token, taskId)` → `POST /tasks/{id}/close` and `reopenTodoistTask(token, taskId)` → `POST /tasks/{id}/reopen`
  - [ ] 🟥 **Linear**: Add `updateLinearIssueState(apiKey, issueId, stateId)` using `issueUpdate` GraphQL mutation. Add `fetchTeamDoneState(apiKey, teamId)` to query the team's workflow states and find the "Done" type state.
  - [ ] 🟥 **Attio**: Add `attioPatch` helper. Add `closeAttioTask(apiKey, taskId)` and `reopenAttioTask(apiKey, taskId)` → `PATCH /tasks/{task_id}` with `is_completed` boolean.
  - Edge cases: All calls are fire-and-forget with try/catch. Rate limits and auth errors are handled gracefully (logged, not thrown).

- [ ] 🟥 **Step 4: Outbound writeback — optimistic with rollback**
  - Files: `src/lib/writeback.ts` (new), `src/stores/useTaskStore.ts`
  - [ ] 🟥 Create `src/lib/writeback.ts` with `writebackCompletion(task, completed: boolean)`:
    - Looks up connection via `task.connection_id` (fallback: first connection matching `task.source`)
    - Dispatches to the correct provider close/reopen function
    - Returns `{ ok: true }` or `{ ok: false, error: string }`
  - [ ] 🟥 In `completeTask`: for integration tasks → complete locally (optimistic), then `await writebackCompletion`. On failure → rollback via `uncompleteTask` (with `_skipWriteback`) + show error toast.
  - [ ] 🟥 In `uncompleteTask`: for integration tasks → uncomplete locally (optimistic), then `await writebackCompletion`. On failure → rollback via `completeTask` (with `_skipWriteback`) + show error toast.
  - [ ] 🟥 Add `_skipWriteback` option to both functions for loop prevention (inbound sync + rollback)
  - Edge cases: Offline = optimistic update + rollback + error toast. Deleted connection = skip writeback, complete locally only. Manual tasks = no writeback.

- [ ] 🟥 **Step 5: Linear "Done" state caching**
  - Files: `src/integrations/linear.ts`, `src/stores/useConnectionStore.ts`
  - [ ] 🟥 Add `fetchWorkflowStates(apiKey, teamId)` → query `team.states` to get all workflow states
  - [ ] 🟥 During `syncLinearConnection`, fetch and cache `doneStateId` per team in `connection.metadata.teamDoneStates` (map of teamId → stateId)
  - [ ] 🟥 `updateLinearIssueState` uses the cached `doneStateId` from the task's team metadata
  - Edge cases: If no Done state found for a team, skip writeback for tasks from that team (log warning).

- [ ] 🟥 **Step 6: Inbound completion detection**
  - Files: `src/stores/useConnectionStore.ts`
  - [ ] 🟥 In `syncConnection`, after fetching items and before the dedup filter:
    1. Build `fetchedSourceIds` set from all fetched items
    2. Query `db.tasks` for active tasks with matching `source` (and optionally `connection_id`)
    3. Find tasks whose `source_id` is NOT in `fetchedSourceIds`
    4. Call internal `completeTask` for each (with `_skipWriteback` flag to prevent loop)
  - [ ] 🟥 After completing externally-closed tasks, refresh the task store
  - Edge cases: Partial API failure → don't mark anything as completed if the fetch errored. Task reassigned/moved → treated as completed (acceptable trade-off). Task deleted in source → same behavior.

- [ ] 🟥 **Step 7: Build, test, push**
  - [ ] 🟥 TypeScript build passes (`npm run build`)
  - [ ] 🟥 Commit and push
  - [ ] 🟥 User runs Supabase migration
