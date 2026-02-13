import { useEffect } from "react"
import { Link, useLocation } from "react-router-dom"
import { FolderClosed, Plus } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useBucketStore } from "@/stores/useBucketStore"
import { useTaskStore } from "@/stores/useTaskStore"

interface MobileBucketsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Bottom sheet listing all buckets for mobile navigation.
 * Tapping a bucket navigates to it and closes the sheet.
 */
export function MobileBucketsSheet({ open, onOpenChange }: MobileBucketsSheetProps) {
  const { buckets } = useBucketStore()
  const tasks = useTaskStore((s) => s.tasks)
  const location = useLocation()

  // Close sheet on navigation
  useEffect(() => {
    if (open) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const nonDefaultBuckets = buckets.filter((b) => !b.is_default)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[70svh] rounded-t-2xl px-4 pb-8">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-left text-base">Buckets</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-1 overflow-y-auto">
          {nonDefaultBuckets.map((bucket) => {
            const count = tasks.filter((t) => t.bucket_id === bucket.id).length
            const isActive = location.pathname === `/bucket/${bucket.id}`

            return (
              <Link
                key={bucket.id}
                to={`/bucket/${bucket.id}`}
                className={`flex items-center justify-between rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent/50"
                }`}
              >
                <span className="flex items-center gap-3">
                  <FolderClosed
                    className="size-5"
                    style={bucket.color ? { color: bucket.color } : undefined}
                  />
                  {bucket.name}
                </span>
                {count > 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                )}
              </Link>
            )
          })}

          {nonDefaultBuckets.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No buckets yet. Create your first one!
            </p>
          )}

          {/* New bucket trigger */}
          <button
            type="button"
            onClick={() => {
              onOpenChange(false)
              // Small delay to let sheet close, then open the dialog
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("flowpin:create-bucket"))
              }, 200)
            }}
            className="mt-2 flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <Plus className="size-5" />
            New Bucket
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
