import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Check, ExternalLink, Loader2, X } from "lucide-react"
import { useIntegrationStore } from "@/stores/useIntegrationStore"
import { LinearApiError } from "@/types/linear"

interface LinearSetupProps {
  /** Called after successful connection */
  onConnected?: () => void
  /** Show as compact card (for integrations page) vs full setup (onboarding) */
  compact?: boolean
}

export function LinearSetup({ onConnected, compact }: LinearSetupProps) {
  const {
    isLinearConnected,
    linearUser,
    linearTeams,
    connectLinear,
    disconnectLinear,
  } = useIntegrationStore()

  const [apiKey, setApiKey] = useState("")
  const [isValidating, setIsValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleConnect() {
    const trimmed = apiKey.trim()
    if (!trimmed) return

    setIsValidating(true)
    setError(null)

    try {
      await connectLinear(trimmed)
      setSuccess(true)
      setApiKey("")
      onConnected?.()
    } catch (err) {
      if (err instanceof LinearApiError) {
        setError(err.message)
      } else {
        setError("Something went wrong. Please try again.")
      }
    } finally {
      setIsValidating(false)
    }
  }

  // Already connected — show status
  if (isLinearConnected && linearUser) {
    return (
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded bg-primary/10">
              <Check className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">
                Linear connected as {linearUser.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {linearTeams.length} team{linearTeams.length !== 1 ? "s" : ""} accessible
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void disconnectLinear()}
            className="text-destructive"
          >
            Disconnect
          </Button>
        </div>
        {linearTeams.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {linearTeams.map((team) => (
              <Badge key={team.id} variant="secondary" className="text-xs">
                {team.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Just connected successfully
  if (success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center dark:border-green-900 dark:bg-green-950">
        <Check className="mx-auto mb-2 size-8 text-green-600" />
        <p className="text-sm font-medium text-green-800 dark:text-green-200">
          We&apos;re in. Let&apos;s see what you&apos;ve got going on.
        </p>
      </div>
    )
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact && (
        <div>
          <h3 className="text-lg font-semibold">Connect Linear</h3>
          <p className="text-sm text-muted-foreground">
            Paste your personal API key to pull in tasks from Linear.
            We don&apos;t see your password — keys live only on this device.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="linear-key">
          API Key or Personal Access Token
        </Label>
        <div className="flex gap-2">
          <Input
            id="linear-key"
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleConnect()
            }}
            placeholder="lin_api_..."
            className="flex-1"
          />
          <Button
            onClick={() => void handleConnect()}
            disabled={!apiKey.trim() || isValidating}
          >
            {isValidating ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : null}
            {isValidating ? "Checking..." : "Connect"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <X className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <a
        href="https://linear.app/settings/account/security"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground"
      >
        How to create a personal API key
        <ExternalLink className="size-3" />
      </a>
    </div>
  )
}
