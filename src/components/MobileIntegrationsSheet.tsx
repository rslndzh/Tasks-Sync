import { useEffect, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useConnectionStore } from "@/stores/useConnectionStore"
import { IntegrationInboxPanel } from "@/components/IntegrationInboxPanel"
import { PROVIDER_ICON_MAP } from "@/components/icons/ProviderIcons"
import { cn } from "@/lib/utils"

interface MobileIntegrationsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TRIAGE_OPEN_CLASS = "flowpin-triage-open"

/**
 * Bottom sheet for triaging integration inbox items on mobile.
 * Shows connection tabs at the top and the inbox panel below.
 */
export function MobileIntegrationsSheet({ open, onOpenChange }: MobileIntegrationsSheetProps) {
  const connections = useConnectionStore((s) => s.connections)
  const inboxItems = useConnectionStore((s) => s.inboxItems)

  const activeConnections = connections.filter((c) => c.isActive)
  const [activeTab, setActiveTab] = useState<string | null>(activeConnections[0]?.id ?? null)

  useEffect(() => {
    if (typeof document === "undefined") return
    document.body.classList.toggle(TRIAGE_OPEN_CLASS, open)
    return () => {
      document.body.classList.remove(TRIAGE_OPEN_CLASS)
    }
  }, [open])

  // Ensure the active tab is valid
  const resolvedTab = activeConnections.find((c) => c.id === activeTab) ? activeTab : activeConnections[0]?.id ?? null

  if (activeConnections.length === 0) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="flowpin-triage-sheet max-h-[70svh] rounded-t-2xl px-4 pb-8">
          <SheetHeader className="pb-3">
            <SheetTitle className="text-left text-base">Integrations</SheetTitle>
          </SheetHeader>
          <p className="py-8 text-center text-sm text-muted-foreground">
            No integrations connected yet. Head to Settings to add one.
          </p>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flowpin-triage-sheet flex max-h-[80svh] flex-col rounded-t-2xl px-0 pb-8">
        <SheetHeader className="px-4 pb-2">
          <SheetTitle className="text-left text-base">Triage Inbox</SheetTitle>
        </SheetHeader>

        {/* Connection tabs */}
        {activeConnections.length > 1 && (
          <div className="flex gap-1 border-b border-border px-4 pb-2">
            {activeConnections.map((conn) => {
              const Icon = PROVIDER_ICON_MAP[conn.type]
              const count = inboxItems.get(conn.id)?.length ?? 0
              const isActive = resolvedTab === conn.id

              return (
                <button
                  key={conn.id}
                  type="button"
                  onClick={() => setActiveTab(conn.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {conn.label}
                  {count > 0 && (
                    <span className="ml-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-primary">
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto px-4 pt-2">
          {resolvedTab && (
            <IntegrationInboxPanel connectionId={resolvedTab} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
