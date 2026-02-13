import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { FolderClosed, Inbox, Layers, Settings, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBucketStore } from "@/stores/useBucketStore"
import { useTaskStore } from "@/stores/useTaskStore"
import { useConnectionStore } from "@/stores/useConnectionStore"
import { MobileBucketsSheet } from "@/components/MobileBucketsSheet"
import { MobileIntegrationsSheet } from "@/components/MobileIntegrationsSheet"

interface NavItem {
  id: string
  label: string
  icon: typeof Sun
  badge?: number
}

/**
 * Fixed bottom tab bar for mobile (< md).
 * Provides access to Today, Inbox, Buckets, Integrations, and Settings.
 */
export function BottomNav() {
  const location = useLocation()
  const { buckets } = useBucketStore()
  const tasks = useTaskStore((s) => s.tasks)
  const getTotalInboxCount = useConnectionStore((s) => s.getTotalInboxCount)

  const [bucketsOpen, setBucketsOpen] = useState(false)
  const [integrationsOpen, setIntegrationsOpen] = useState(false)

  const defaultBucket = buckets.find((b) => b.is_default)
  const inboxCount = defaultBucket ? tasks.filter((t) => t.bucket_id === defaultBucket.id).length : 0
  const triageCount = getTotalInboxCount()

  const isToday = location.pathname === "/"
  const isInbox = defaultBucket ? location.pathname === `/bucket/${defaultBucket.id}` : false
  const isBucket = location.pathname.startsWith("/bucket/") && !isInbox

  const items: NavItem[] = [
    { id: "today", label: "Today", icon: Sun },
    { id: "inbox", label: "Inbox", icon: Inbox, badge: inboxCount || undefined },
    { id: "buckets", label: "Buckets", icon: FolderClosed },
    { id: "integrations", label: "Triage", icon: Layers, badge: triageCount || undefined },
    { id: "settings", label: "Settings", icon: Settings },
  ]

  function isActive(id: string) {
    if (id === "today") return isToday
    if (id === "inbox") return isInbox
    if (id === "buckets") return isBucket || bucketsOpen
    if (id === "integrations") return integrationsOpen
    return false
  }

  function handleTap(id: string) {
    if (id === "buckets") {
      setBucketsOpen(true)
    } else if (id === "integrations") {
      setIntegrationsOpen(true)
    } else if (id === "settings") {
      window.dispatchEvent(new CustomEvent("flowpin:show-settings"))
    }
    // "today" and "inbox" are handled as Links, not here
  }

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map((item) => {
          const active = isActive(item.id)
          const Icon = item.icon

          // Today and Inbox are direct links
          if (item.id === "today") {
            return (
              <Link
                key={item.id}
                to="/"
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            )
          }

          if (item.id === "inbox" && defaultBucket) {
            return (
              <Link
                key={item.id}
                to={`/bucket/${defaultBucket.id}`}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {item.label}
                {item.badge != null && item.badge > 0 && (
                  <span className="absolute right-1/4 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </Link>
            )
          }

          // Buckets, Integrations, Settings are button taps
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleTap(item.id)}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {item.label}
              {item.badge != null && item.badge > 0 && (
                <span className="absolute right-1/4 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Mobile sheets */}
      <MobileBucketsSheet open={bucketsOpen} onOpenChange={setBucketsOpen} />
      <MobileIntegrationsSheet open={integrationsOpen} onOpenChange={setIntegrationsOpen} />
    </>
  )
}
