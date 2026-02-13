import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useAuthStore } from "@/stores/useAuthStore"
import { ArrowRight, Keyboard, Plug, Sparkles } from "lucide-react"

const TOTAL_STEPS = 3

export function OnboardingPage() {
  const navigate = useNavigate()
  const { completeOnboarding } = useAuthStore()
  const [step, setStep] = useState(1)

  async function handleFinish() {
    await completeOnboarding()
    navigate("/")
  }

  function handleSkipAll() {
    void handleFinish()
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {/* Step indicator */}
          <div className="mb-2 flex justify-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className={`h-1.5 w-8 rounded-full transition-colors ${
                  i + 1 <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>

          {step === 1 && (
            <>
              <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="size-6 text-primary" />
              </div>
              <CardTitle className="text-2xl font-bold">Hey! Ready to flow?</CardTitle>
              <CardDescription>
                Organize work into Buckets — like lists or projects. Inside each one,
                triage tasks into Today, Sooner, or Later.
              </CardDescription>
            </>
          )}

          {step === 2 && (
            <>
              <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Plug className="size-6 text-primary" />
              </div>
              <CardTitle className="text-2xl font-bold">Connect your tools</CardTitle>
              <CardDescription>
                Pull in tasks from Linear so they&apos;re ready to triage.
              </CardDescription>
            </>
          )}

          {step === 3 && (
            <>
              <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Keyboard className="size-6 text-primary" />
              </div>
              <CardTitle className="text-2xl font-bold">You&apos;re a keyboard person?</CardTitle>
              <CardDescription>
                Good. Everything&apos;s one shortcut away.
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {step === 1 && (
            <div className="space-y-3">
              {/* Buckets concept */}
              <div className="rounded-lg border border-border p-3">
                <p className="mb-1 text-sm font-medium">Buckets = your lists</p>
                <p className="text-xs text-muted-foreground">
                  Create buckets for Work, Side Projects, Personal — whatever you want.
                  You start with an Inbox.
                </p>
              </div>

              {/* Sections inside buckets */}
              <p className="px-1 text-xs font-medium text-muted-foreground">Inside each bucket:</p>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Badge variant="secondary" className="shrink-0">Today</Badge>
                <span className="text-sm text-muted-foreground">What you&apos;re tackling right now</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Badge variant="secondary" className="shrink-0">Sooner</Badge>
                <span className="text-sm text-muted-foreground">Coming up next — not today, not never</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Badge variant="secondary" className="shrink-0">Later</Badge>
                <span className="text-sm text-muted-foreground">No shame. Later is a valid strategy.</span>
              </div>

              {/* Global Today */}
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">The Today view</span> pulls every
                  &quot;Today&quot; task from all your buckets into one focused list. Start sessions from there.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              {/* Linear — placeholder, real form comes in Phase 4 */}
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Linear</p>
                    <p className="text-sm text-muted-foreground">Import tasks with your API key</p>
                  </div>
                  <Badge variant="outline">Phase 4</Badge>
                </div>
              </div>

              <div className="rounded-lg border border-dashed border-border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-muted-foreground">Attio</p>
                    <p className="text-sm text-muted-foreground">Coming soon</p>
                  </div>
                  <Badge variant="outline">Soon</Badge>
                </div>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                You can set this up later from Integrations. No pressure.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="space-y-2 text-sm">
                  <ShortcutRow keys={["N"]} description="New task" />
                  <ShortcutRow keys={["1", "2", "3"]} description="Move to Today / Sooner / Later" />
                  <ShortcutRow keys={["S"]} description="Start focus session" />
                  <ShortcutRow keys={["Esc"]} description="Stop session" />
                  <Separator className="my-2" />
                  <ShortcutRow keys={["↑", "↓"]} description="Navigate tasks" />
                  <ShortcutRow keys={["Enter"]} description="Complete task" />
                  <ShortcutRow keys={["?"]} description="Show all shortcuts" />
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Pro tip: press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">?</kbd> anytime to see the full cheatsheet.
              </p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={handleSkipAll}>
              Skip all
            </Button>

            {step < TOTAL_STEPS ? (
              <Button onClick={() => setStep(step + 1)}>
                Next
                <ArrowRight className="ml-1 size-4" />
              </Button>
            ) : (
              <Button onClick={handleFinish}>
                Let&apos;s flow
                <ArrowRight className="ml-1 size-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ShortcutRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{description}</span>
      <div className="flex gap-1">
        {keys.map((key) => (
          <kbd
            key={key}
            className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  )
}
