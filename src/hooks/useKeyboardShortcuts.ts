import { useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { isInputFocused } from "@/lib/shortcuts"
import { useTaskStore } from "@/stores/useTaskStore"
import type { SectionType } from "@/types/database"

/**
 * Global keyboard shortcut handler.
 *
 * Manages task navigation (arrow keys), section moves (1/2/3),
 * multi-select (Shift+arrow), open detail (Enter), and action shortcuts (n/e/d/?/Escape).
 */
export function useKeyboardShortcuts() {
  const {
    selectedTaskId,
    selectedTaskIds,
    hoveredTaskId,
    toggleSelectTask,
    selectRange,
    clearSelection,
    moveToSection,
    completeTask,
  } = useTaskStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept when typing in inputs
      if (isInputFocused()) return

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

      switch (e.key) {
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
          if (selectedTaskIds.size === 0 && !selectedTaskId) return
          const ids = selectedTaskIds.size > 0 ? [...selectedTaskIds] : [selectedTaskId!]
          for (const id of ids) void moveToSection(id, "today" as SectionType)
          break
        }
        case "2": {
          if (selectedTaskIds.size === 0 && !selectedTaskId) return
          const ids = selectedTaskIds.size > 0 ? [...selectedTaskIds] : [selectedTaskId!]
          for (const id of ids) void moveToSection(id, "sooner" as SectionType)
          break
        }
        case "3": {
          if (selectedTaskIds.size === 0 && !selectedTaskId) return
          const ids = selectedTaskIds.size > 0 ? [...selectedTaskIds] : [selectedTaskId!]
          for (const id of ids) void moveToSection(id, "later" as SectionType)
          break
        }

        // Complete task(s)
        case "d": {
          if (selectedTaskIds.size === 0 && !selectedTaskId) return
          const ids = selectedTaskIds.size > 0 ? [...selectedTaskIds] : [selectedTaskId!]
          for (const id of ids) void completeTask(id)
          break
        }

        // Open task detail page
        case "Enter": {
          if (!selectedTaskId) return
          e.preventDefault()
          navigate(`/task/${selectedTaskId}`, { state: { from: location.pathname } })
          break
        }

        // New task — focus the first visible add-task input
        case "n": {
          e.preventDefault()
          const input = document.querySelector<HTMLInputElement>('input[placeholder*="Add"]')
          if (input) input.focus()
          break
        }

        // Show shortcut help
        case "?": {
          window.dispatchEvent(new CustomEvent("flowpin:show-shortcuts"))
          break
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedTaskId, selectedTaskIds, hoveredTaskId, toggleSelectTask, selectRange, clearSelection, moveToSection, completeTask, navigate, location.pathname])
}
