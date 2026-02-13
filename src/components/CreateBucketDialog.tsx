import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus } from "lucide-react"
import { useBucketStore } from "@/stores/useBucketStore"

const BUCKET_COLORS = [
  { name: "Default", value: null },
  { name: "Blue", value: "#3b82f6" },
  { name: "Green", value: "#22c55e" },
  { name: "Orange", value: "#f97316" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
  { name: "Yellow", value: "#eab308" },
]

export function CreateBucketDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [color, setColor] = useState<string | null>(null)
  const { addBucket } = useBucketStore()

  // Allow opening from custom event (mobile bottom nav)
  useEffect(() => {
    const handleShow = () => setOpen(true)
    window.addEventListener("flowpin:create-bucket", handleShow)
    return () => window.removeEventListener("flowpin:create-bucket", handleShow)
  }, [])

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return

    await addBucket(trimmed, undefined, color ?? undefined)
    setName("")
    setColor(null)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault()
      void handleCreate()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 justify-start gap-2 px-3 text-muted-foreground"
        >
          <Plus className="size-4" />
          New Bucket
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create a new bucket</DialogTitle>
          <DialogDescription>
            Buckets are your lists. Each one has Today, Sooner, and Later sections.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="bucket-name">Name</Label>
            <Input
              id="bucket-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Work, Side Project, Personal..."
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Color (optional)</Label>
            <div className="flex gap-2">
              {BUCKET_COLORS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setColor(c.value)}
                  className={`size-7 rounded-full border-2 transition-transform ${
                    color === c.value ? "scale-110 border-foreground" : "border-transparent hover:scale-105"
                  }`}
                  style={{
                    backgroundColor: c.value ?? "var(--muted)",
                  }}
                  aria-label={c.name}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={!name.trim()}>
            Create Bucket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
