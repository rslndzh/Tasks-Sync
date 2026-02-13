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
    tasks,
    selectedTaskId,
    selectedTaskIds,
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

      const activeTasks = tasks
      const currentIndex = activeTasks.findIndex((t) => t.id === selectedTaskId)
      const orderedIds = activeTasks.map((t) => t.id)

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
          if (activeTasks.length === 0) return
          const prev = currentIndex <= 0 ? activeTasks.length - 1 : currentIndex - 1
          const prevId = activeTasks[prev].id

          if (e.shiftKey && selectedTaskId) {
            // Extend selection — selectRange already updates selectedTaskId
            selectRange(selectedTaskId, prevId, orderedIds)
          } else {
            toggleSelectTask(prevId, false)
          }
          break
        }
        case "ArrowDown":
        case "j": {
          e.preventDefault()
          if (activeTasks.length === 0) return
          const next = currentIndex >= activeTasks.length - 1 ? 0 : currentIndex + 1
          const nextId = activeTasks[next].id

          if (e.shiftKey && selectedTaskId) {
            selectRange(selectedTaskId, nextId, orderedIds)
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
  }, [tasks, selectedTaskId, selectedTaskIds, toggleSelectTask, selectRange, clearSelection, moveToSection, completeTask, navigate, location.pathname])
}
