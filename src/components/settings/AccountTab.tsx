import { useNavigate } from "react-router-dom"
import { Cloud, LogOut, Loader2, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useAuthStore } from "@/stores/useAuthStore"
import { useSyncStore } from "@/stores/useSyncStore"
import { useTaskStore } from "@/stores/useTaskStore"
import { syncNow } from "@/lib/sync"
import { isSupabaseConfigured } from "@/lib/supabase"

/** Format a relative time string like "just now", "2m ago", "1h ago" */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/**
 * Account tab in Settings — shows sync status and auth controls.
 *
 * Anonymous: prompts to sign in for cross-device sync.
 * Authenticated: shows account info, live sync status, and manual sync button.
 */
export function AccountTab() {
  const navigate = useNavigate()
  const { user, profile, isMigrating } = useAuthStore()
  const taskCount = useTaskStore((s) => s.tasks.length)
  const signOut = useAuthStore((s) => s.signOut)
  const { status, lastSyncedAt, error, pendingCount } = useSyncStore()

  function navigateAndClose(path: string) {
    window.dispatchEvent(new CustomEvent("flowpin:close-settings"))
    navigate(path)
  }

  function handleSync() {
    void syncNow()
  }

  // Anonymous state — prompt to sign in
  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold">Account</h3>
          <p className="text-sm text-muted-foreground">
            Sign in to sync your tasks across devices.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-5">
          <div className="flex items-start gap-3">
            <Cloud className="mt-0.5 size-5 text-primary" />
            <div className="space-y-2">
              <p className="text-sm font-medium">Your data lives on this device</p>
              <p className="text-xs text-muted-foreground">
                Everything works perfectly offline. Create an account whenever you want
                to sync across your phone, laptop, and desktop.
              </p>
              {taskCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  You have <span className="font-medium text-foreground">{taskCount} task{taskCount !== 1 ? "s" : ""}</span> — they&apos;ll
                  be synced automatically when you sign in.
                </p>
              )}
            </div>
          </div>

          <Separator className="my-4" />

          <div className="flex gap-2">
            <Button
              onClick={() => navigateAndClose("/signup")}
              size="sm"
            >
              Create account
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateAndClose("/login")}
            >
              Sign in
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Authenticated state
  const isSyncing = status === "syncing" || isMigrating
  const isConfigured = isSupabaseConfigured

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Account</h3>
        <p className="text-sm text-muted-foreground">
          Your data syncs across all your devices.
        </p>
      </div>

      {/* Sync status card */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isSyncing ? (
              <Loader2 className="size-5 animate-spin text-primary" />
            ) : status === "error" ? (
              <AlertCircle className="size-5 text-destructive" />
            ) : status === "synced" ? (
              <CheckCircle2 className="size-5 text-green-500" />
            ) : (
              <Cloud className="size-5 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium">
                {isMigrating
                  ? "Moving your data to the cloud..."
                  : isSyncing
                    ? "Syncing..."
                    : status === "error"
                      ? "Sync issue"
                      : status === "synced"
                        ? "All synced up"
                        : "Not synced yet"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isMigrating
                  ? "Hang tight — this only happens once."
                  : isSyncing
                    ? "Pushing your latest changes..."
                    : lastSyncedAt
                      ? `Last synced ${timeAgo(lastSyncedAt)}`
                      : "Your data is stored locally on this device."}
              </p>
            </div>
          </div>

          {/* Manual sync button */}
          {isConfigured && !isMigrating && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              disabled={isSyncing}
              onClick={handleSync}
              title="Sync now"
            >
              <RefreshCw className={`size-4 ${isSyncing ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* Pending queue count */}
        {pendingCount > 0 && !isSyncing && (
          <p className="text-xs text-muted-foreground">
            {pendingCount} change{pendingCount !== 1 ? "s" : ""} waiting to sync.
          </p>
        )}
      </div>

      {/* Account info */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Email</span>
          <span className="text-sm font-medium">{user.email}</span>
        </div>
        {profile?.display_name && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Name</span>
            <span className="text-sm font-medium">{profile.display_name}</span>
          </div>
        )}
      </div>

      <Separator />

      <Button
        variant="outline"
        size="sm"
        onClick={() => void signOut()}
        className="gap-1.5 text-muted-foreground"
      >
        <LogOut className="size-3.5" />
        Sign out
      </Button>
    </div>
  )
}
