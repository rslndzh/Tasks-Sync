import { WifiOff } from "lucide-react"
import { useOnlineStatus } from "@/hooks/useOnlineStatus"

/**
 * Slim banner that appears when the app is offline.
 * Reassures the user that everything still works locally.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus()

  if (isOnline) return null

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
      <WifiOff className="size-3" />
      <span>You&apos;re offline. Everything still works — we&apos;ll sync when you&apos;re back.</span>
    </div>
  )
}
