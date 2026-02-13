import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * General settings tab — display name, default import section, theme toggle (future).
 */
export function GeneralTab() {
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
