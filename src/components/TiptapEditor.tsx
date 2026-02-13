import { useCallback, useEffect, useRef } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import Typography from "@tiptap/extension-typography"
import Highlight from "@tiptap/extension-highlight"
import { SlashCommand } from "@/components/SlashCommand"
import { cn } from "@/lib/utils"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Code,
  CodeSquare,
  Highlighter,
  Link as LinkIcon,
  List,
  ListOrdered,
  ListChecks,
  Heading2,
  Heading3,
  Quote,
  Strikethrough,
  Minus,
} from "lucide-react"

interface TiptapEditorProps {
  content: string | null
  onChange: (html: string) => void
  placeholder?: string
  className?: string
}

/**
 * Seamless WYSIWYG editor for task notes.
 * No visible border or toolbar — formatting via bubble menu (text selection)
 * and slash command menu (type "/" at start of line).
 *
 * Extensions (via StarterKit v3): headings, bold, italic, underline, strike,
 * inline code, code blocks, bullet/ordered lists, blockquotes, links (auto-detected),
 * horizontal rules, gapcursor, dropcursor, history.
 *
 * Additional: task lists, highlight, typography (smart quotes/dashes), slash commands.
 *
 * Auto-saves via debounced onChange (500ms after typing stops).
 */
export function TiptapEditor({
  content,
  onChange,
  placeholder = "Type '/' for commands…",
  className,
}: TiptapEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      // StarterKit v3 includes: bold, italic, strike, underline, code, codeBlock,
      // heading, bulletList, orderedList, blockquote, horizontalRule, hardBreak,
      // history, dropcursor, gapcursor, paragraph, text, document, link
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: {
          HTMLAttributes: { class: "tiptap-code-block" },
        },
        code: {
          HTMLAttributes: { class: "tiptap-inline-code" },
        },
        horizontalRule: {
          HTMLAttributes: { class: "tiptap-hr" },
        },
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          HTMLAttributes: {
            class: "text-primary underline underline-offset-2 cursor-pointer",
          },
        },
      }),
      Placeholder.configure({ placeholder }),
      TaskList.configure({
        HTMLAttributes: { class: "tiptap-task-list" },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: { class: "tiptap-task-item" },
      }),
      // Smart typography — auto-converts quotes, dashes, fractions
      Typography,
      // Highlight mark — ==text== or bubble menu
      Highlight.configure({
        HTMLAttributes: { class: "tiptap-highlight" },
      }),
      // Slash command menu — type "/" to see block insertion options
      SlashCommand,
    ],
    content: content ?? "",
    editorProps: {
      attributes: {
        class: cn(
          "tiptap-editor prose prose-sm dark:prose-invert max-w-none",
          "focus:outline-none min-h-[80px]",
        ),
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onChange(ed.getHTML())
      }, 500)
    },
  })

  // Sync external content changes (e.g. switching between tasks)
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    const incoming = content ?? ""
    if (incoming !== current && incoming !== "<p></p>") {
      editor.commands.setContent(incoming)
    }
  }, [content, editor])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const setLink = useCallback(() => {
    if (!editor) return
    const previousUrl = editor.getAttributes("link").href as string | undefined
    const url = window.prompt("URL", previousUrl ?? "https://")
    if (url === null) return
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }, [editor])

  if (!editor) return null

  return (
    <div className={cn("relative", className)}>
      {/* Bubble menu — appears on text selection with formatting options */}
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg"
      >
        <BubbleButton
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </BubbleButton>
        <Separator />
        <BubbleButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (Cmd+B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (Cmd+I)"
        >
          <Italic className="h-3.5 w-3.5" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline (Cmd+U)"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("highlight")}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          title="Highlight"
        >
          <Highlighter className="h-3.5 w-3.5" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Inline code"
        >
          <Code className="h-3.5 w-3.5" />
        </BubbleButton>
        <Separator />
        <BubbleButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          <List className="h-3.5 w-3.5" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          title="Checklist"
        >
          <ListChecks className="h-3.5 w-3.5" />
        </BubbleButton>
        <Separator />
        <BubbleButton
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Quote"
        >
          <Quote className="h-3.5 w-3.5" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code block"
        >
          <CodeSquare className="h-3.5 w-3.5" />
        </BubbleButton>
        <BubbleButton
          active={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule"
        >
          <Minus className="h-3.5 w-3.5" />
        </BubbleButton>
        <Separator />
        <BubbleButton
          active={editor.isActive("link")}
          onClick={setLink}
          title="Link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </BubbleButton>
      </BubbleMenu>

      <EditorContent editor={editor} />
    </div>
  )
}

function Separator() {
  return <div className="mx-0.5 h-4 w-px bg-border" />
}

function BubbleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "rounded p-1.5 transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  )
}
