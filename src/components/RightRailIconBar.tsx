import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { useConnectionStore } from "@/stores/useConnectionStore"
import type { IntegrationType } from "@/types/database"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PROVIDER_ICON_MAP } from "@/components/icons/ProviderIcons"

const PROVIDER_LABELS: Record<IntegrationType, string> = {
  linear: "Linear",
  todoist: "Todoist",
  attio: "Attio",
}

interface RightRailIconBarProps {
  activePanel: string | null
  onPanelChange: (panel: string | null) => void
}

/**
 * Vertical icon bar on the far right edge.
 * Shows calendar toggle + one icon per connected integration.
 * Active panel gets a left accent bar + highlighted background.
 */
export function RightRailIconBar({ activePanel, onPanelChange }: RightRailIconBarProps) {
  const connections = useConnectionStore((s) => s.connections)
  const getInboxCount = useConnectionStore((s) => s.getInboxCount)
  const getSyncState = useConnectionStore((s) => s.getSyncState)

  // Collect unique connected provider types + their connections
  const connectedProviders = new Map<IntegrationType, typeof connections>()
  for (const conn of connections) {
    if (!conn.isActive) continue
    const existing = connectedProviders.get(conn.type) ?? []
    connectedProviders.set(conn.type, [...existing, conn])
  }

  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-0.5 border-l border-border bg-muted/30 py-3">
      {/* Calendar/Timer — always visible */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onPanelChange(activePanel === "calendar" ? null : "calendar")}
            className={cn(
              "relative flex size-8 items-center justify-center rounded-md transition-all duration-150",
              activePanel === "calendar"
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            aria-label="Calendar timeline"
          >
            {/* Active indicator bar */}
            {activePanel === "calendar" && (
              <span className="absolute -left-[5px] top-1 h-6 w-[3px] rounded-r-full bg-primary" />
            )}
            <Clock className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">Timeline</TooltipContent>
      </Tooltip>

      {/* Divider between calendar and integrations */}
      {connectedProviders.size > 0 && (
        <div className="my-1 h-px w-5 bg-border/60" />
      )}

      {/* Integration icons — one per provider type */}
      {Array.from(connectedProviders.entries()).map(([type, conns]) => {
        const ProviderIcon = PROVIDER_ICON_MAP[type]
        const label = PROVIDER_LABELS[type]

        const totalInbox = conns.reduce((sum, c) => sum + getInboxCount(c.id), 0)
        const hasError = conns.some((c) => getSyncState(c.id).error !== null)
        const isSyncing = conns.some((c) => getSyncState(c.id).isSyncing)

        const panelId = conns.length === 1 ? conns[0].id : `provider:${type}`
        const isActive = activePanel === panelId || conns.some((c) => activePanel === c.id)

        return (
          <Tooltip key={type}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onPanelChange(isActive ? null : panelId)}
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-md transition-all duration-150",
                  isActive
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                aria-label={`${label} inbox`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute -left-[5px] top-1 h-6 w-[3px] rounded-r-full bg-primary" />
                )}

                <ProviderIcon className={cn("size-4", isSyncing && "animate-pulse")} />

                {/* Badge count — red for items needing attention */}
                {totalInbox > 0 && (
                  <span
                    className={cn(
                      "absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none",
                      "bg-primary text-primary-foreground",
                      "h-[18px]",
                    )}
                  >
                    {totalInbox > 99 ? "99+" : totalInbox}
                  </span>
                )}

                {/* Error indicator */}
                {hasError && !isSyncing && (
                  <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-muted/30 bg-amber-500" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {label}{totalInbox > 0 ? ` · ${totalInbox} to triage` : ""}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
