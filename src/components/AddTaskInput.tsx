import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Plus } from "lucide-react"
import { useTaskStore } from "@/stores/useTaskStore"
import type { SectionType } from "@/types/database"

interface AddTaskInputProps {
  bucketId: string
  section?: SectionType
  placeholder?: string
  /** Auto-focus on mount */
  autoFocus?: boolean
  /** Called when input blurs while empty — lets parent hide the input */
  onBlurEmpty?: () => void
}

/**
 * Quick-add input for creating tasks.
 * Press Enter to add, Escape to blur.
 */
export function AddTaskInput({
  bucketId,
  section = "sooner",
  placeholder = "Add a task...",
  autoFocus,
  onBlurEmpty,
}: AddTaskInputProps) {
  const [value, setValue] = useState("")
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { addTask } = useTaskStore()

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  async function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed) return

    await addTask(trimmed, bucketId, section)
    setValue("")
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault()
      void handleSubmit()
    } else if (e.key === "Escape") {
      setValue("")
      inputRef.current?.blur()
    }
  }

  function handleBlur() {
    setIsFocused(false)
    if (!value.trim() && onBlurEmpty) {
      onBlurEmpty()
    }
  }

  return (
    <div className="relative">
      {!isFocused && !value && (
        <Plus className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      )}
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`h-8 text-sm ${!isFocused && !value ? "pl-8" : ""}`}
      />
    </div>
  )
}
