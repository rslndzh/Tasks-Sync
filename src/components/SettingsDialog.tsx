import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AccountTab } from "@/components/settings/AccountTab"
import { GeneralTab } from "@/components/settings/GeneralTab"
import { IntegrationsTab } from "@/components/settings/IntegrationsTab"
import { ShortcutsTab } from "@/components/settings/ShortcutsTab"

/**
 * Full-width Settings dialog (like Linear/Notion settings).
 * Accessible via sidebar gear icon or Cmd+,.
 */
export function SettingsDialog() {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("account")

  // Listen for custom event and keyboard shortcut
  useEffect(() => {
    function handleShow(e?: Event) {
      // Support opening to specific tab via detail
      const customEvent = e as CustomEvent<{ tab?: string }> | undefined
      if (customEvent?.detail?.tab) {
        setActiveTab(customEvent.detail.tab)
      }
      setOpen(true)
    }

    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault()
        setOpen(true)
      }
    }

    function handleClose() {
      setOpen(false)
    }

    window.addEventListener("flowpin:show-settings", handleShow)
    window.addEventListener("flowpin:close-settings", handleClose)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("flowpin:show-settings", handleShow)
      window.removeEventListener("flowpin:close-settings", handleClose)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          orientation="vertical"
          className="flex min-h-0 flex-1 flex-row"
        >
          {/* Left side nav — full height, never scrolls */}
          <div className="flex w-40 shrink-0 flex-col border-r border-border bg-muted/30">
            <DialogHeader className="px-4 pt-5 pb-4">
              <DialogTitle className="text-lg">Settings</DialogTitle>
            </DialogHeader>

            <TabsList className="flex flex-1 flex-col items-stretch justify-start gap-0.5 rounded-none bg-transparent px-2 pb-2">
              <TabsTrigger
                value="account"
                className="h-auto flex-none justify-start rounded-md px-3 py-2 text-sm data-[state=active]:bg-accent"
              >
                Account
              </TabsTrigger>
              <TabsTrigger
                value="general"
                className="h-auto flex-none justify-start rounded-md px-3 py-2 text-sm data-[state=active]:bg-accent"
              >
                General
              </TabsTrigger>
              <TabsTrigger
                value="integrations"
                className="h-auto flex-none justify-start rounded-md px-3 py-2 text-sm data-[state=active]:bg-accent"
              >
                Integrations
              </TabsTrigger>
              <TabsTrigger
                value="shortcuts"
                className="h-auto flex-none justify-start rounded-md px-3 py-2 text-sm data-[state=active]:bg-accent"
              >
                Shortcuts
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab content — this is the scrollable area */}
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-6">
            <TabsContent value="account" className="mt-0">
              <AccountTab />
            </TabsContent>
            <TabsContent value="general" className="mt-0">
              <GeneralTab />
            </TabsContent>
            <TabsContent value="integrations" className="mt-0">
              <IntegrationsTab />
            </TabsContent>
            <TabsContent value="shortcuts" className="mt-0">
              <ShortcutsTab />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
