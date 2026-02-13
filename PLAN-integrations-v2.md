# Integrations V2 — Settings, Right-Rail Inboxes, Multi-Connection, Todoist & Attio

**Overall Progress:** `100%`

## TLDR
Refactor integrations to support multiple connections per provider (Linear multi-workspace), add Todoist + Attio (tasks only) integrations, move integration inboxes to a Sunsama-style switchable right rail, and split settings/config into a dedicated Settings dialog.

## Critical Decisions
- **Multi-connection model** — Replace single `IntegrationKey` with `IntegrationConnection` (array), keyed by UUID. This supports multiple Linear workspaces, multiple Todoist accounts, etc.
- **Right rail = icon bar + panel** — The right 300px becomes a thin icon strip (~40px) + expandable panel (~260px). Icons: timer/calendar, Linear, Todoist, Attio. Clicking toggles the panel. Calendar rail is just one of the panels.
- **Settings as dialog, not route** — Settings opens as a full-width modal (like Linear/Notion), accessible from anywhere via sidebar gear icon or `Cmd+,`. No `/app/settings` route needed.
- **IntegrationsPage becomes SettingsDialog** — The current `/app/integrations` route is replaced by the dialog. The route is removed.
- **Attio = tasks only** — Pull tasks from Attio task lists, not records/deals. Same import/triage flow as Linear and Todoist.
- **Todoist = REST API v2** — Auth via API token (personal), fetch tasks, map to Flowpin shape. Simpler than Linear's GraphQL.
- **Normalized inbox items** — All integration panels use a shared `InboxItem` type so the import flow is identical regardless of source.

## Tasks:

- [x] 🟩 **Step 1: Multi-Connection Data Model**
  - Files: `src/types/local.ts`, `src/types/database.ts`, `src/lib/db.ts`
  - [x] 🟩 Replace `IntegrationKey` with `IntegrationConnection` type
  - [x] 🟩 Add `"todoist"` to `IntegrationType` and `TaskSource` enums
  - [x] 🟩 Bump Dexie to version 4: add `connections` table with schema `"id, type, isActive"`
  - [x] 🟩 Add migration to preserve existing Linear key as first connection

- [x] 🟩 **Step 2: Refactor useIntegrationStore → useConnectionStore**
  - Files: `src/stores/useConnectionStore.ts` (new), `src/integrations/linear-mapper.ts` (new)
  - [x] 🟩 State shape: `connections: IntegrationConnection[]`, per-connection sync state map
  - [x] 🟩 Actions: `addConnection(type, apiKey, label)`, `removeConnection(id)`, `updateConnection(id, updates)`
  - [x] 🟩 Actions: `syncConnection(id)`, `syncAll()`
  - [x] 🟩 Normalized inbox: `inboxItems: Map<connectionId, InboxItem[]>`
  - [x] 🟩 `importItem(connectionId, item, bucketId, section)` — works for any provider
  - [x] 🟩 Selectors: `getConnectionsByType(type)`, `getInboxCount(connectionId)`, `getTotalInboxCount()`
  - [x] 🟩 Update `App.tsx` to load connections on mount (replace `loadIntegrationKeys`)

- [x] 🟩 **Step 3: Normalized InboxItem Type**
  - Files: `src/types/inbox.ts` (new), `src/integrations/linear-mapper.ts` (new)
  - [x] 🟩 Define `InboxItem` with `{ id, connectionId, sourceType, sourceId, title, subtitle, metadata, url }`
  - [x] 🟩 Define `mapLinearIssueToInboxItem` (Todoist + Attio mappers in Steps 4 & 5)
  - [x] 🟩 Define `mapInboxItemToLocalTask(item, userId, bucketId, section)` — shared import logic

- [x] 🟩 **Step 4: Todoist API Client**
  - Files: `src/integrations/todoist.ts`, `src/types/todoist.ts`
  - [x] 🟩 Types: `TodoistTask`, `TodoistProject`, `TodoistUser`, `TodoistApiError`
  - [x] 🟩 `validateApiToken(token)` — `GET /api/v1/tasks?limit=1`
  - [x] 🟩 `fetchProjects(token)` — `GET /api/v1/projects` with pagination
  - [x] 🟩 `fetchActiveTasks(token, projectId?)` — `GET /api/v1/tasks` with pagination
  - [x] 🟩 `mapTodoistTaskToInboxItem(task, connectionId)` mapper
  - [x] 🟩 Error handling: `TodoistApiError` with same pattern
  - [x] 🟩 Wired Todoist sync into `useConnectionStore`

- [x] 🟩 **Step 5: Attio API Client (Tasks Only)**
  - Files: `src/integrations/attio.ts`, `src/types/attio.ts`
  - [x] 🟩 Types: `AttioTask`, `AttioList`, `AttioApiError`
  - [x] 🟩 `validateApiKey(key)` — `GET /v2/tasks?limit=1`
  - [x] 🟩 `fetchTasks(key)` — `GET /v2/tasks` with offset pagination, `is_completed=false`
  - [x] 🟩 `mapAttioTaskToInboxItem(task, connectionId)` mapper
  - [x] 🟩 Error handling: `AttioApiError` with same pattern
  - [x] 🟩 Wired Attio sync into `useConnectionStore`

- [x] 🟩 **Step 6: Right-Rail Redesign — Icon Bar + Switchable Panel**
  - Files: `src/components/RightRail.tsx`, `src/components/RightRailIconBar.tsx`, `src/components/Layout.tsx`
  - [x] 🟩 `RightRailIconBar` — vertical icon strip with Clock + connected provider icons
  - [x] 🟩 `RightRail` — manages active panel state, renders icon bar + panel content
  - [x] 🟩 Toggle panel open/closed by clicking active icon
  - [x] 🟩 Badge counts + error indicators on icons
  - [x] 🟩 Replaced hardcoded `<CalendarRail />` with `<RightRail />`
  - [x] 🟩 Persist active panel selection in `AppState.rightRailPanel`

- [x] 🟩 **Step 7: Integration Inbox Panel (Shared Component)**
  - Files: `src/components/IntegrationInboxPanel.tsx`, `src/components/InboxItemCard.tsx`
  - [x] 🟩 `IntegrationInboxPanel` — reusable panel with sync/import controls
  - [x] 🟩 Header: connection label, last sync time, sync + import-all buttons
  - [x] 🟩 `InboxItemCard` — title, subtitle, expand for bucket+section picker
  - [x] 🟩 Import action calls store, refreshes tasks, removes from inbox
  - [x] 🟩 Empty/syncing/error states with playful microcopy

- [x] 🟩 **Step 8: Settings Dialog**
  - Files: `src/components/SettingsDialog.tsx`, `src/components/settings/*`
  - [x] 🟩 Full-width dialog triggered by gear icon or `Cmd+,`
  - [x] 🟩 Left tab nav: General, Integrations, Import Rules, Shortcuts
  - [x] 🟩 **General tab**: default import section, theme placeholder
  - [x] 🟩 **Integrations tab**: card per provider with multi-connection support
  - [x] 🟩 **Import Rules tab**: multi-provider rules with polymorphic source filter
  - [x] 🟩 **Shortcuts tab**: keyboard reference
  - [x] 🟩 Gear icon in sidebar replaces Integrations link

- [x] 🟩 **Step 9: Update Linear Integration for Multi-Connection**
  - [x] 🟩 Linear API functions already parameterized — no changes needed
  - [x] 🟩 LinearSetup functionality replaced by IntegrationsTab ProviderCard
  - [x] 🟩 Multiple Linear connections supported via useConnectionStore
  - [x] 🟩 Cross-connection dedup by `source_id` in syncConnection

- [x] 🟩 **Step 10: Update Import Rules for Multi-Provider**
  - [x] 🟩 `ImportRule.integration_type` now `IntegrationType` (linear | todoist | attio)
  - [x] 🟩 Polymorphic `ImportRuleSourceFilter` with teamId/projectId/listId
  - [x] 🟩 `ImportRulesTab` in settings replaces old `ImportRuleEditor` with multi-provider support
  - [x] 🟩 `import-engine.ts` uses `findMatchingRule` for any provider type
  - [x] 🟩 Disconnected connection badge in rules UI

- [x] 🟩 **Step 11: Remove Old IntegrationsPage + Clean Up**
  - [x] 🟩 Removed `/app/integrations` route from `App.tsx`
  - [x] 🟩 Replaced "Integrations" sidebar link with "Settings" gear icon
  - [x] 🟩 Deleted `IntegrationsPage.tsx`
  - [x] 🟩 Added `loadRules` to App mount
  - [x] 🟩 Verified no live code references dead files

- [x] 🟩 **Step 12: Auto-Sync on App Open + Background Sync**
  - Files: `src/hooks/useAutoSync.ts`
  - [x] 🟩 On app open: sync all active connections sequentially
  - [x] 🟩 Background polling: every 5 minutes while app is open
  - [x] 🟩 Sync status indicator in right rail icon bar (spinning icon while syncing)
  - [x] 🟩 Error amber dot on icons with connection errors
  - [x] 🟩 Skips sync when offline
