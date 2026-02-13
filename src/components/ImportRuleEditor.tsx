import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowRight, Plus, Power, Trash2 } from "lucide-react"
import { useImportRuleStore } from "@/stores/useImportRuleStore"
import { useIntegrationStore } from "@/stores/useIntegrationStore"
import { useBucketStore } from "@/stores/useBucketStore"
import type { SectionType } from "@/types/database"

/**
 * Import rule editor — create and manage auto-routing rules.
 * Displayed on the Integrations page.
 */
export function ImportRuleEditor() {
  const { rules, addRule, updateRule, deleteRule } = useImportRuleStore()
  const { linearTeams, isLinearConnected } = useIntegrationStore()
  const { buckets } = useBucketStore()

  const [isAdding, setIsAdding] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState("")
  const [selectedBucketId, setSelectedBucketId] = useState("")
  const [selectedSection, setSelectedSection] = useState<SectionType>("sooner")

  if (!isLinearConnected) return null

  async function handleCreate() {
    const team = linearTeams.find((t) => t.id === selectedTeamId)
    if (!team || !selectedBucketId) return

    await addRule(team.id, team.name, selectedBucketId, selectedSection)
    setIsAdding(false)
    setSelectedTeamId("")
    setSelectedBucketId("")
    setSelectedSection("sooner")
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Auto-Import Rules</h3>
          <p className="text-xs text-muted-foreground">
            Route tasks from Linear teams straight into your buckets.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
        >
          <Plus className="mr-1 size-3" />
          Add Rule
        </Button>
      </div>

      {/* Existing rules */}
      {rules.length > 0 ? (
        <div className="mb-3 flex flex-col gap-1.5">
          {rules.map((rule) => {
            const bucket = buckets.find((b) => b.id === rule.target_bucket_id)
            return (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-md border border-border p-2.5"
              >
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-xs">
                    {rule.source_filter.teamName}
                  </Badge>
                  <ArrowRight className="size-3 text-muted-foreground" />
                  <Badge variant="secondary" className="text-xs">
                    {bucket?.name ?? "Unknown"}
                  </Badge>
                  <span className="text-xs capitalize text-muted-foreground">
                    / {rule.target_section}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() =>
                      void updateRule(rule.id, { is_active: !rule.is_active })
                    }
                    title={rule.is_active ? "Disable" : "Enable"}
                  >
                    <Power
                      className={`size-3 ${rule.is_active ? "text-primary" : "text-muted-foreground"}`}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive"
                    onClick={() => void deleteRule(rule.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      ) : !isAdding ? (
        <p className="mb-3 text-sm text-muted-foreground">
          No rules yet. Tasks from Linear land in the inbox for manual triage.
        </p>
      ) : null}

      {/* Add rule form */}
      {isAdding && (
        <div className="space-y-3 rounded-md border border-dashed border-border p-3">
          <div className="flex items-center gap-2">
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Linear team..." />
              </SelectTrigger>
              <SelectContent>
                {linearTeams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />

            <Select value={selectedBucketId} onValueChange={setSelectedBucketId}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Bucket..." />
              </SelectTrigger>
              <SelectContent>
                {buckets.map((bucket) => (
                  <SelectItem key={bucket.id} value={bucket.id}>
                    {bucket.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedSection}
              onValueChange={(v) => setSelectedSection(v as SectionType)}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="sooner">Sooner</SelectItem>
                <SelectItem value="later">Later</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => void handleCreate()}
              disabled={!selectedTeamId || !selectedBucketId}
            >
              Create Rule
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAdding(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
