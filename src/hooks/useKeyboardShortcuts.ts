import { useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { isInputFocused } from "@/lib/shortcuts"
import { getTaskAppUrl, getTaskSourceUrl } from "@/lib/task-links"
import { openEstimateDialog } from "@/lib/estimate-dialog"
import { useTaskStore } from "@/stores/useTaskStore"
import { useSessionStore } from "@/stores/useSessionStore"
import type { SectionType } from "@/types/database"

/**
 * Global keyboard shortcut handler.
 *
 * Manages task navigation (arrow keys), section moves (1/2/3),
 * multi-select (Shift+arrow), open detail (Enter), and task actions.
 */
export function useKeyboardShortcuts() {
  const {
    tasks,
    selectedTaskId,
    selectedTaskIds,
    hoveredTaskId,
    toggleSelectTask,
    selectRange,
    clearSelection,
    moveToSection,
    completeTask,
    archiveTask,
  } = useTaskStore()
  const { isRunning, activeTaskId, startSession, switchTask } = useSessionStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    async function copyText(text: string): Promise<void> {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        // Ignore clipboard failures silently for keyboard shortcuts.
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept when typing in inputs
      if (isInputFocused()) return

      // Let open context menus consume keyboard events.
      if (document.querySelector("[data-slot='context-menu-content']")) return

      const orderedIds = Array.from(document.querySelectorAll<HTMLElement>("[data-task-id]"))
        .map((node) => node.dataset.taskId ?? "")
        .filter(Boolean)
      const visibleIdSet = new Set(orderedIds)
      const selectedVisibleId = selectedTaskId && visibleIdSet.has(selectedTaskId)
        ? selectedTaskId
        : [...selectedTaskIds].find((id) => visibleIdSet.has(id)) ?? null
      const hoveredVisibleId = hoveredTaskId && visibleIdSet.has(hoveredTaskId) ? hoveredTaskId : null
      const baseId = selectedVisibleId ?? hoveredVisibleId
      const currentIndex = baseId ? orderedIds.indexOf(baseId) : -1
      const normalizedKey = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const currentTask = baseId ? tasks.find((t) => t.id === baseId) : undefined
      const sourceUrl = currentTask ? getTaskSourceUrl(currentTask) : null
      const ids = selectedTaskIds.size > 0 ? [...selectedTaskIds] : (baseId ? [baseId] : [])

      // Select all visible tasks.
      if ((e.metaKey || e.ctrlKey) && normalizedKey === "a") {
        if (orderedIds.length === 0) return
        e.preventDefault()
        clearSelection()
        selectRange(orderedIds[0], orderedIds[orderedIds.length - 1], orderedIds)
        return
      }

      switch (normalizedKey) {
        // Clear selection
        case "Escape": {
          if (selectedTaskId || selectedTaskIds.size > 0) {
            e.preventDefault()
            clearSelection()
          }
          break
        }

        // Navigate tasks — plain arrow moves focus, Shift+arrow extends multi-select
        case "ArrowUp":
        case "k": {
          e.preventDefault()
          if (orderedIds.length === 0) return
          const prev = currentIndex <= 0 ? 0 : currentIndex - 1
          const prevId = orderedIds[prev]

          if (e.shiftKey && (baseId ?? prevId)) {
            // Extend selection from focused/hovered anchor using visible list order.
            selectRange(baseId ?? prevId, prevId, orderedIds)
          } else {
            toggleSelectTask(prevId, false)
          }
          break
        }
        case "ArrowDown":
        case "j": {
          e.preventDefault()
          if (orderedIds.length === 0) return
          const next = currentIndex === -1
            ? 0
            : (currentIndex >= orderedIds.length - 1 ? orderedIds.length - 1 : currentIndex + 1)
          const nextId = orderedIds[next]

          if (e.shiftKey && (baseId ?? nextId)) {
            selectRange(baseId ?? nextId, nextId, orderedIds)
          } else {
            toggleSelectTask(nextId, false)
          }
          break
        }

        // Section moves — apply to all selected tasks
        case "1": {
          if (ids.length === 0) return
          for (const id of ids) void moveToSection(id, "today" as SectionType)
          break
        }
        case "2": {
          if (ids.length === 0) return
          for (const id of ids) void moveToSection(id, "sooner" as SectionType)
          break
        }
        case "3": {
          if (ids.length === 0) return
          for (const id of ids) void moveToSection(id, "later" as SectionType)
          break
        }
        // Remove from Today
        case "r": {
          if (ids.length === 0) return
          const todayIds = ids.filter((id) => tasks.find((t) => t.id === id)?.section === "today")
          for (const id of todayIds) void moveToSection(id, "sooner" as SectionType)
          break
        }
        // Set estimate (minutes) for selected task(s)
        case "e": {
          if (ids.length === 0) return
          e.preventDefault()
          openEstimateDialog(ids)
          break
        }

        // Complete task(s)
        case "d": {
          if (ids.length === 0) return
          for (const id of ids) void completeTask(id)
          break
        }

        // Archive selected task(s)
        case "a": {
          if (ids.length === 0) return
          for (const id of ids) void archiveTask(id)
          break
        }

        // Start/switch focus
        case "f": {
          if (!baseId) return
          e.preventDefault()
          if (!isRunning) {
            void startSession(baseId)
          } else if (activeTaskId !== baseId) {
            void switchTask(baseId)
          }
          break
        }

        // Open source app
        case "o": {
          if (!sourceUrl) return
          e.preventDefault()
          window.open(sourceUrl, "_blank", "noopener,noreferrer")
          break
        }

        // Copy title
        case "t": {
          if (!currentTask) return
          e.preventDefault()
          void copyText(currentTask.title)
          break
        }

        // Copy task link
        case "y": {
          if (!baseId) return
          e.preventDefault()
          void copyText(getTaskAppUrl(baseId))
          break
        }
        // Open context menu for move-to-bucket flow
        case "b": {
          if (!baseId) return
          e.preventDefault()
          const escapedId = typeof CSS !== "undefined" && typeof CSS.escape === "function"
            ? CSS.escape(baseId)
            : baseId
          const row = document.querySelector<HTMLElement>(`[data-task-id="${escapedId}"]`)
          if (!row) return
          const rect = row.getBoundingClientRect()
          row.dispatchEvent(new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: rect.left + Math.min(72, Math.max(8, rect.width - 8)),
            clientY: rect.top + rect.height / 2,
          }))
          break
        }

        // Open task detail page
        case "Enter": {
          if (!baseId) return
          e.preventDefault()
          navigate(`/task/${baseId}`, { state: { from: location.pathname } })
          break
        }

        // Show shortcut help
        case "?": {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent("flowpin:show-shortcuts"))
          break
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    tasks,
    selectedTaskId,
    selectedTaskIds,
    hoveredTaskId,
    toggleSelectTask,
    selectRange,
    clearSelection,
    moveToSection,
    completeTask,
    archiveTask,
    isRunning,
    activeTaskId,
    startSession,
    switchTask,
    navigate,
    location.pathname,
  ])
}
