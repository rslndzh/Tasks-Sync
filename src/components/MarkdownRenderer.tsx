import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import type { Components } from "react-markdown"

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * Custom component overrides for better rendering of checkboxes,
 * code blocks, and links inside markdown content.
 */
const components: Components = {
  // Open links in new tab
  a: ({ href, children, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
}

/**
 * Read-only markdown renderer for integration source descriptions.
 * Supports GFM (tables, strikethrough, task lists, autolinks, code blocks).
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn("md-renderer prose prose-sm dark:prose-invert max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
