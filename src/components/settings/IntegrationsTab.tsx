import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Check, ChevronDown, ChevronRight, ExternalLink, Loader2, Plus, Trash2, X } from "lucide-react"
import { useConnectionStore } from "@/stores/useConnectionStore"
import { useBucketStore } from "@/stores/useBucketStore"
import { useImportRuleStore } from "@/stores/useImportRuleStore"
import type { IntegrationType, SectionType } from "@/types/database"
import { PROVIDER_ICON_MAP } from "@/components/icons/ProviderIcons"
import type { IntegrationConnection } from "@/types/local"
import { validateApiKey as validateLinearKey, fetchTeams, LINEAR_STATE_TYPES, DEFAULT_LINEAR_STATE_FILTER } from "@/integrations/linear"
import type { LinearStateType } from "@/integrations/linear"
import { validateApiToken as validateTodoistToken } from "@/integrations/todoist"
import { validateApiKey as validateAttioKey } from "@/integrations/attio"
import { LinearApiError } from "@/types/linear"
import { TodoistApiError } from "@/types/todoist"
import { AttioApiError } from "@/types/attio"
import type { LinearTeam, LinearUser } from "@/types/linear"
import type { TodoistProject } from "@/types/todoist"

// ============================================================================
// Provider config
// ============================================================================

interface ProviderConfig {
  type: IntegrationType
  label: string
  description: string
  keyPlaceholder: string
  helpUrl: string
  helpText: string
}

const PROVIDERS: ProviderConfig[] = [
  {
    type: "linear",
    label: "Linear",
    description: "Import tasks from your Linear workspaces. Supports multiple workspaces.",
    keyPlaceholder: "lin_api_...",
    helpUrl: "https://linear.app/settings/account/security",
    helpText: "Create a personal API key",
  },
  {
    type: "todoist",
    label: "Todoist",
    description: "Pull in tasks from your Todoist projects.",
    keyPlaceholder: "Your API token...",
    helpUrl: "https://todoist.com/prefs/integrations",
    helpText: "Find your API token",
  },
  {
    type: "attio",
    label: "Attio",
    description: "Sync tasks from your Attio workspace.",
    keyPlaceholder: "Your API key...",
    helpUrl: "https://app.attio.com/settings/developers",
    helpText: "Create an API key",
  },
]

// ============================================================================
// Integrations tab
// ============================================================================

/**
 * Integrations settings tab — one card per provider, multiple connections supported.
 */
export function IntegrationsTab() {
  const connections = useConnectionStore((s) => s.connections)
  const addConnection = useConnectionStore((s) => s.addConnection)
  const removeConnection = useConnectionStore((s) => s.removeConnection)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">Integrations</h3>
        <p className="text-xs text-muted-foreground">
          Connect your tools to pull tasks into Flowpin. Keys live only on this device.
        </p>
      </div>

      {PROVIDERS.map((provider) => {
        const conns = connections.filter((c) => c.type === provider.type)
        return (
          <ProviderCard
            key={provider.type}
            provider={provider}
            connections={conns}
            onAdd={addConnection}
            onRemove={removeConnection}
          />
        )
      })}
    </div>
  )
}

// ============================================================================
// Provider card
// ============================================================================

interface ProviderCardProps {
  provider: ProviderConfig
  connections: IntegrationConnection[]
  onAdd: (type: IntegrationType, apiKey: string, label: string) => Promise<IntegrationConnection>
  onRemove: (id: string) => Promise<void>
}

function ProviderCard({ provider, connections, onAdd, onRemove }: ProviderCardProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [label, setLabel] = useState("")
  const [isValidating, setIsValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    const trimmedKey = apiKey.trim()
    if (!trimmedKey) return

    setIsValidating(true)
    setError(null)

    try {
      // Validate the key based on provider type
      let connLabel = label.trim() || provider.label

      if (provider.type === "linear") {
        const user: LinearUser = await validateLinearKey(trimmedKey)
        const teams: LinearTeam[] = await fetchTeams(trimmedKey)
        connLabel = label.trim() || `Linear (${user.name})`
        const conn = await onAdd(provider.type, trimmedKey, connLabel)
        // Update metadata with user/teams
        void useConnectionStore.getState().updateConnection(conn.id, {
          metadata: { user, teams },
        })
      } else if (provider.type === "todoist") {
        await validateTodoistToken(trimmedKey)
        connLabel = label.trim() || "Todoist"
        await onAdd(provider.type, trimmedKey, connLabel)
      } else if (provider.type === "attio") {
        await validateAttioKey(trimmedKey)
        connLabel = label.trim() || "Attio"
        await onAdd(provider.type, trimmedKey, connLabel)
      }

      // Reset form
      setApiKey("")
      setLabel("")
      setIsAdding(false)
    } catch (err) {
      if (err instanceof LinearApiError || err instanceof TodoistApiError || err instanceof AttioApiError) {
        setError(err.message)
      } else {
        setError("Something went sideways. Please try again.")
      }
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <div className="rounded-lg border border-border p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {(() => {
            const Icon = PROVIDER_ICON_MAP[provider.type]
            return <Icon className="size-6 shrink-0" />
          })()}
          <div>
            <h4 className="text-sm font-semibold">{provider.label}</h4>
            <p className="text-xs text-muted-foreground">{provider.description}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
        >
          <Plus className="mr-1 size-3" />
          Add
        </Button>
      </div>

      {/* Existing connections */}
      {connections.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {connections.map((conn) => (
            <ConnectionRow
              key={conn.id}
              connection={conn}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}

      {/* Add form */}
      {isAdding && (
        <div className="space-y-3 rounded-md border border-dashed border-border p-3">
          <div className="space-y-2">
            <Label>Connection label (optional)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`${provider.label} (Work)`}
              className="h-8"
            />
          </div>
          <div className="space-y-2">
            <Label>API Key / Token</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleConnect()
              }}
              placeholder={provider.keyPlaceholder}
              className="h-8"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              <X className="mt-0.5 size-3 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <a
              href={provider.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground underline hover:text-foreground"
            >
              {provider.helpText}
              <ExternalLink className="size-2.5" />
            </a>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={() => void handleConnect()} disabled={!apiKey.trim() || isValidating}>
                {isValidating ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                {isValidating ? "Validating..." : "Connect"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Connection row — with expandable mapping settings
// ============================================================================

function ConnectionRow({ connection, onRemove }: { connection: IntegrationConnection; onRemove: (id: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false)
  const updateConnection = useConnectionStore((s) => s.updateConnection)
  const { buckets } = useBucketStore()
  const { addRule, updateRule, deleteRule, getRuleForSource } = useImportRuleStore()

  const metadata = connection.metadata as Record<string, unknown>
  const user = metadata?.user as { name?: string; email?: string } | undefined
  const teams = metadata?.teams as LinearTeam[] | undefined

  // Resolve which sources this connection exposes (teams for Linear, projects for Todoist)
  const sources = getConnectionSources(connection)
  const mappedCount = sources.filter((s) => getRuleForSource(s.id, connection.type)).length

  function handleAutoImportToggle() {
    void updateConnection(connection.id, { autoImport: !connection.autoImport })
  }

  function handleBucketChange(bucketId: string) {
    void updateConnection(connection.id, { defaultBucketId: bucketId || null })
  }

  function handleSectionChange(section: string) {
    void updateConnection(connection.id, { defaultSection: (section || null) as SectionType | null })
  }

  return (
    <div className="rounded-md border border-border">
      {/* Main row */}
      <div className="flex items-center justify-between p-2.5">
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          )}
          <div className="flex size-6 items-center justify-center rounded bg-primary/10">
            <Check className="size-3 text-primary" />
          </div>
          <div>
            <p className="text-xs font-medium">{connection.label}</p>
            {user?.email && (
              <p className="text-[10px] text-muted-foreground">{user.email}</p>
            )}
          </div>
        </button>

        <div className="flex items-center gap-2">
          {connection.autoImport && (
            <Badge variant="outline" className="text-[10px]">Auto-import</Badge>
          )}
          {mappedCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {mappedCount} mapped
            </Badge>
          )}
          {teams && teams.length > 0 && !expanded && (
            <div className="flex gap-1">
              {teams.slice(0, 2).map((team) => (
                <Badge key={team.id} variant="secondary" className="text-[10px]">
                  {team.name}
                </Badge>
              ))}
              {teams.length > 2 && (
                <Badge variant="secondary" className="text-[10px]">
                  +{teams.length - 2}
                </Badge>
              )}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-destructive hover:text-destructive"
            onClick={() => void onRemove(connection.id)}
            aria-label="Disconnect"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {/* Expanded settings */}
      {expanded && (
        <div className="border-t border-border bg-muted/30 px-3 py-3 space-y-4">
          {/* Default mapping */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Default Mapping
            </p>
            <p className="mb-3 text-[10px] text-muted-foreground">
              Catch-all for tasks that don&apos;t match any specific rule below.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors ${
                  connection.autoImport
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                onClick={handleAutoImportToggle}
              >
                <div className={`size-2 rounded-full ${connection.autoImport ? "bg-primary" : "bg-muted-foreground/40"}`} />
                Auto-import {connection.autoImport ? "on" : "off"}
              </button>

              <Select
                value={connection.defaultBucketId ?? ""}
                onValueChange={handleBucketChange}
              >
                <SelectTrigger className="h-7 w-[140px] text-[11px]">
                  <SelectValue placeholder="Bucket..." />
                </SelectTrigger>
                <SelectContent>
                  {buckets.map((bucket) => (
                    <SelectItem key={bucket.id} value={bucket.id} className="text-xs">
                      {bucket.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={connection.defaultSection ?? "sooner"}
                onValueChange={handleSectionChange}
              >
                <SelectTrigger className="h-7 w-[100px] text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today" className="text-xs">Today</SelectItem>
                  <SelectItem value="sooner" className="text-xs">Sooner</SelectItem>
                  <SelectItem value="later" className="text-xs">Later</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Linear-specific: status type filter */}
          {connection.type === "linear" && (
            <LinearStateFilter connection={connection} />
          )}

          {/* Per-source mapping (teams / projects) */}
          {sources.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {connection.type === "linear" ? "Team" : "Project"} Routing
              </p>
              <p className="mb-3 text-[10px] text-muted-foreground">
                Route tasks from specific {connection.type === "linear" ? "teams" : "projects"} into
                a bucket. These take priority over the default mapping above.
              </p>

              <div className="flex flex-col gap-1.5">
                {sources.map((source) => (
                  <SourceMappingRow
                    key={source.id}
                    sourceId={source.id}
                    sourceName={source.name}
                    connectionType={connection.type}
                    buckets={buckets}
                    existingRule={getRuleForSource(source.id, connection.type)}
                    onCreateRule={addRule}
                    onUpdateRule={updateRule}
                    onDeleteRule={deleteRule}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Hint when no sources are available yet */}
          {sources.length === 0 && connection.type !== "attio" && (
            <p className="text-[10px] text-muted-foreground italic">
              Sync this connection first to see available {connection.type === "linear" ? "teams" : "projects"} for routing.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Source mapping row — one per team/project
// ============================================================================

interface SourceMappingRowProps {
  sourceId: string
  sourceName: string
  connectionType: IntegrationType
  buckets: { id: string; name: string }[]
  existingRule: ReturnType<typeof useImportRuleStore.getState>["rules"][0] | undefined
  onCreateRule: (
    sourceId: string,
    sourceName: string,
    targetBucketId: string,
    targetSection: SectionType,
    integrationType: IntegrationType,
  ) => Promise<unknown>
  onUpdateRule: (id: string, updates: { target_bucket_id?: string; target_section?: SectionType; is_active?: boolean }) => Promise<void>
  onDeleteRule: (id: string) => Promise<void>
}

function SourceMappingRow({
  sourceId,
  sourceName,
  connectionType,
  buckets,
  existingRule,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
}: SourceMappingRowProps) {

  async function handleBucketChange(bucketId: string) {
    if (!bucketId) {
      // Clearing the mapping — remove the rule
      if (existingRule) await onDeleteRule(existingRule.id)
      return
    }
    if (existingRule) {
      await onUpdateRule(existingRule.id, { target_bucket_id: bucketId })
    } else {
      await onCreateRule(sourceId, sourceName, bucketId, "sooner", connectionType)
    }
  }

  async function handleSectionChange(section: string) {
    if (existingRule) {
      await onUpdateRule(existingRule.id, { target_section: section as SectionType })
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Source name */}
      <span className="min-w-[100px] shrink-0 truncate text-[11px] font-medium">
        {sourceName}
      </span>

      <span className="text-[10px] text-muted-foreground">→</span>

      {/* Bucket */}
      <Select
        value={existingRule?.target_bucket_id ?? "__none__"}
        onValueChange={(v) => void handleBucketChange(v === "__none__" ? "" : v)}
      >
        <SelectTrigger className="h-6 w-[120px] text-[10px]">
          <SelectValue placeholder="No mapping" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__" className="text-[10px] text-muted-foreground">
            No mapping
          </SelectItem>
          {buckets.map((bucket) => (
            <SelectItem key={bucket.id} value={bucket.id} className="text-[10px]">
              {bucket.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Section — only show when a bucket is selected */}
      {existingRule && (
        <Select
          value={existingRule.target_section}
          onValueChange={(v) => void handleSectionChange(v)}
        >
          <SelectTrigger className="h-6 w-[80px] text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today" className="text-[10px]">Today</SelectItem>
            <SelectItem value="sooner" className="text-[10px]">Sooner</SelectItem>
            <SelectItem value="later" className="text-[10px]">Later</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

// ============================================================================
// Linear state filter — toggle chips for which status types to pull
// ============================================================================

const STATE_LABELS: Record<LinearStateType, string> = {
  triage: "Triage",
  backlog: "Backlog",
  unstarted: "Todo",
  started: "In Progress",
}

function LinearStateFilter({ connection }: { connection: IntegrationConnection }) {
  const updateConnection = useConnectionStore((s) => s.updateConnection)
  const meta = connection.metadata as Record<string, unknown>
  const current = (meta.linearStateTypes as LinearStateType[] | undefined) ?? [...DEFAULT_LINEAR_STATE_FILTER]

  function toggleState(stateType: LinearStateType) {
    const isActive = current.includes(stateType)
    // Prevent deselecting all — keep at least one
    if (isActive && current.length <= 1) return
    const next = isActive
      ? current.filter((s) => s !== stateType)
      : [...current, stateType]
    void updateConnection(connection.id, {
      metadata: { ...connection.metadata, linearStateTypes: next },
    })
  }

  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Pull issues with status
      </p>
      <p className="mb-3 text-[10px] text-muted-foreground">
        Only issues matching these statuses will appear in your inbox.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {LINEAR_STATE_TYPES.map((stateType) => {
          const isActive = current.includes(stateType)
          return (
            <button
              key={stateType}
              type="button"
              onClick={() => toggleState(stateType)}
              className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors ${
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className={`size-1.5 rounded-full ${isActive ? "bg-primary" : "bg-muted-foreground/40"}`} />
              {STATE_LABELS[stateType]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Helper — extract sources (teams/projects) from connection metadata
// ============================================================================

interface SourceOption {
  id: string
  name: string
}

function getConnectionSources(connection: IntegrationConnection): SourceOption[] {
  const metadata = connection.metadata as Record<string, unknown>

  if (connection.type === "linear") {
    const teams = (metadata?.teams ?? []) as LinearTeam[]
    return teams.map((t) => ({ id: t.id, name: t.name }))
  }

  if (connection.type === "todoist") {
    const projects = (metadata?.projects ?? []) as TodoistProject[]
    return projects.map((p) => ({ id: p.id, name: p.name }))
  }

  // Attio has no sub-source filtering for now
  return []
}
