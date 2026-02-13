import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { Extension } from "@tiptap/core"
import { ReactRenderer } from "@tiptap/react"
import Suggestion from "@tiptap/suggestion"
import tippy from "tippy.js"
import { cn } from "@/lib/utils"
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  CodeSquare,
  Minus,
  Type,
  Highlighter,
} from "lucide-react"
import type { Editor, Range } from "@tiptap/core"
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion"
import type { Instance as TippyInstance } from "tippy.js"

// ─── Slash menu item definitions ───

interface SlashMenuItem {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  command: (props: { editor: Editor; range: Range }) => void
}

const SLASH_ITEMS: SlashMenuItem[] = [
  {
    title: "Text",
    description: "Plain paragraph",
    icon: Type,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run()
    },
  },
  {
    title: "Heading 1",
    description: "Large heading",
    icon: Heading1,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run()
    },
  },
  {
    title: "Heading 2",
    description: "Medium heading",
    icon: Heading2,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run()
    },
  },
  {
    title: "Heading 3",
    description: "Small heading",
    icon: Heading3,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run()
    },
  },
  {
    title: "Bullet List",
    description: "Unordered list",
    icon: List,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: "Numbered List",
    description: "Ordered list",
    icon: ListOrdered,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: "Checklist",
    description: "Task list with checkboxes",
    icon: ListChecks,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
  },
  {
    title: "Quote",
    description: "Blockquote",
    icon: Quote,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: "Code Block",
    description: "Fenced code block",
    icon: CodeSquare,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: "Highlight",
    description: "Highlighted text",
    icon: Highlighter,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHighlight().run()
    },
  },
  {
    title: "Divider",
    description: "Horizontal rule",
    icon: Minus,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
]

function filterItems(query: string): SlashMenuItem[] {
  return SLASH_ITEMS.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()),
  )
}

// ─── Slash menu popup component ───

interface SlashCommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

interface SlashCommandListProps {
  items: SlashMenuItem[]
  command: (item: SlashMenuItem) => void
}

const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const containerRef = useRef<HTMLDivElement>(null)

    // Reset selection when items change
    useEffect(() => {
      setSelectedIndex(0)
    }, [items])

    // Scroll selected item into view
    useLayoutEffect(() => {
      const container = containerRef.current
      if (!container) return
      const selected = container.children[selectedIndex] as HTMLElement | undefined
      selected?.scrollIntoView({ block: "nearest" })
    }, [selectedIndex])

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index]
        if (item) command(item)
      },
      [items, command],
    )

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length)
          return true
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev + 1) % items.length)
          return true
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex)
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div className="slash-menu rounded-lg border border-border bg-popover p-2 shadow-lg">
          <p className="px-2 py-1 text-xs text-muted-foreground">No results</p>
        </div>
      )
    }

    return (
      <div
        ref={containerRef}
        className="slash-menu max-h-[280px] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
      >
        {items.map((item, index) => {
          const Icon = item.icon
          return (
            <button
              key={item.title}
              type="button"
              onClick={() => selectItem(index)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-accent/50",
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-tight">{item.title}</p>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    )
  },
)

SlashCommandList.displayName = "SlashCommandList"

// ─── Suggestion render adapter — bridges Tiptap suggestion with React ───

function createSuggestionRenderer() {
  let reactRenderer: ReactRenderer<SlashCommandListRef> | null = null
  let popup: TippyInstance | null = null

  return {
    onStart(props: SuggestionProps<SlashMenuItem>) {
      reactRenderer = new ReactRenderer(SlashCommandList, {
        props: { items: props.items, command: props.command },
        editor: props.editor,
      })

      const getReferenceClientRect = props.clientRect as (() => DOMRect) | undefined
      if (!getReferenceClientRect) return

      popup = tippy(document.body, {
        getReferenceClientRect,
        appendTo: () => document.body,
        content: reactRenderer.element,
        showOnCreate: true,
        interactive: true,
        trigger: "manual",
        placement: "bottom-start",
        offset: [0, 4],
        animation: false,
        theme: "slash-menu",
      })
    },

    onUpdate(props: SuggestionProps<SlashMenuItem>) {
      reactRenderer?.updateProps({
        items: props.items,
        command: props.command,
      })

      const getReferenceClientRect = props.clientRect as (() => DOMRect) | undefined
      if (getReferenceClientRect) {
        popup?.setProps({ getReferenceClientRect })
      }
    },

    onKeyDown(props: { event: KeyboardEvent }) {
      if (props.event.key === "Escape") {
        popup?.hide()
        return true
      }
      return reactRenderer?.ref?.onKeyDown(props) ?? false
    },

    onExit() {
      popup?.destroy()
      reactRenderer?.destroy()
      popup = null
      reactRenderer = null
    },
  }
}

// ─── The extension itself ───

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashMenuItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) => filterItems(query),
        command: ({ editor, range, props: item }) => {
          item.command({ editor, range })
        },
        render: createSuggestionRenderer as SuggestionOptions<SlashMenuItem>["render"],
      }),
    ]
  },
})
