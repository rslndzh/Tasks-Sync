import { useState, useEffect, useCallback, useRef } from "react"
import { CalendarRail } from "@/components/CalendarRail"
import { RightRailIconBar } from "@/components/RightRailIconBar"
import { IntegrationInboxPanel } from "@/components/IntegrationInboxPanel"
import { useConnectionStore } from "@/stores/useConnectionStore"
import { db } from "@/lib/db"
import type { AppState } from "@/types/local"

const MIN_WIDTH = 200
const MAX_WIDTH = 500
const DEFAULT_WIDTH = 280
const STORAGE_KEY = "flowpin:rightRailWidth"

/**
 * Right-side rail: icon bar (~40px) + resizable panel.
 * Supports: Calendar timeline, per-connection inbox panels.
 */
export function RightRail() {
  const [activePanel, setActivePanel] = useState<string | null>("calendar")
  const [panelWidth, setPanelWidth] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(stored))) : DEFAULT_WIDTH
  })
  const connections = useConnectionStore((s) => s.connections)
  const isResizing = useRef(false)

  // Restore persisted panel selection
  useEffect(() => {
    void db.appState.get("state").then((state) => {
      if (state?.rightRailPanel !== undefined) {
        setActivePanel(state.rightRailPanel)
      }
    })
  }, [])

  const handlePanelChange = useCallback((panel: string | null) => {
    setActivePanel(panel)
    void db.appState.get("state").then((state) => {
      if (state) {
        void db.appState.update("state", { rightRailPanel: panel } as Partial<AppState>)
      }
    })
  }, [])

  // Drag-to-resize handler
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = panelWidth

    function onMouseMove(ev: MouseEvent) {
      if (!isResizing.current) return
      // Dragging left = wider panel (because panel is on the right)
      const delta = startX - ev.clientX
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta))
      setPanelWidth(newWidth)
    }

    function onMouseUp() {
      isResizing.current = false
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      // Persist width
      localStorage.setItem(STORAGE_KEY, String(panelWidth))
    }

    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }, [panelWidth])

  // Persist width when it changes (debounced via the mouseUp handler above,
  // but also save on unmount for safety)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(panelWidth))
  }, [panelWidth])

  // Resolve which panel content to show
  const renderPanel = () => {
    if (!activePanel) return null

    if (activePanel === "calendar") {
      return <CalendarRail />
    }

    if (activePanel.startsWith("provider:")) {
      const type = activePanel.replace("provider:", "")
      const conns = connections.filter((c) => c.type === type && c.isActive)
      if (conns.length === 0) return null

      return (
        <div className="flex flex-col gap-4">
          {conns.map((conn) => (
            <IntegrationInboxPanel key={conn.id} connectionId={conn.id} />
          ))}
        </div>
      )
    }

    const conn = connections.find((c) => c.id === activePanel)
    if (conn) {
      return <IntegrationInboxPanel connectionId={conn.id} />
    }

    return null
  }

  return (
    <div className="hidden lg:flex">
      {/* Expanded panel with resize handle */}
      {activePanel && (
        <aside className="relative flex shrink-0" style={{ width: panelWidth }}>
          {/* Drag handle on the left edge */}
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={handleMouseDown}
            className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize border-l border-border transition-colors hover:border-primary hover:bg-primary/10 active:border-primary active:bg-primary/20"
          />
          <div className="flex-1 overflow-y-auto p-3">
            {renderPanel()}
          </div>
        </aside>
      )}

      {/* Icon bar — always visible */}
      <RightRailIconBar activePanel={activePanel} onPanelChange={handlePanelChange} />
    </div>
  )
}
