import { useEffect } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTodaySectionsStore } from "@/stores/useTodaySectionsStore"

/**
 * General settings tab — display name, default import section, theme toggle (future).
 */
export function GeneralTab() {
  const enabled = useTodaySectionsStore((s) => s.enabled)
  const load = useTodaySectionsStore((s) => s.load)
  const setEnabled = useTodaySectionsStore((s) => s.setEnabled)

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">General</h3>
        <p className="text-xs text-muted-foreground">
          Preferences that shape your Flowpin experience.
        </p>
      </div>

      {/* Default import section */}
      <div className="space-y-2">
        <Label htmlFor="default-section">Default import section</Label>
        <p className="text-xs text-muted-foreground">
          When you import a task from an integration, which section should it land in?
        </p>
        <Select defaultValue="sooner">
          <SelectTrigger id="default-section" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="sooner">Sooner</SelectItem>
            <SelectItem value="later">Later</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Today view split */}
      <div className="space-y-2">
        <Label htmlFor="today-now-next" className="block">
          Today sections
        </Label>
        <p className="text-xs text-muted-foreground">
          Split Today into two lanes: Now and Next.
        </p>
        <label htmlFor="today-now-next" className="flex items-center gap-2 text-sm">
          <input
            id="today-now-next"
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              void setEnabled(e.target.checked)
            }}
            className="size-4 rounded border-border"
          />
          <span>Enable Now/Next in Today</span>
        </label>
      </div>

      {/* Theme toggle — future */}
      <div className="space-y-2">
        <Label>Theme</Label>
        <p className="text-xs text-muted-foreground">
          Coming soon — we&apos;re picking colors.
        </p>
      </div>
    </div>
  )
}
