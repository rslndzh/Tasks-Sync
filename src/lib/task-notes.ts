/**
 * True when a task's rich-text notes contain visible content.
 * Handles empty Tiptap HTML like "<p></p>" and whitespace-only markup.
 */
export function hasTaskNotes(description: string | null | undefined): boolean {
  if (!description) return false

  const text = description
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()

  return text.length > 0
}

