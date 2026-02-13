import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useAuthStore } from "@/stores/useAuthStore"
import { friendlyAuthError } from "@/lib/auth-errors"
import { db } from "@/lib/db"

export function LoginPage() {
  const navigate = useNavigate()
  const { signIn, signInWithMagicLink } = useAuthStore()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localTaskCount, setLocalTaskCount] = useState(0)

  // Check for existing local tasks to show contextual message
  useEffect(() => {
    void db.tasks.where("user_id").equals("local").count().then(setLocalTaskCount)
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const { error } = await signIn(email, password)
    setIsSubmitting(false)

    if (error) {
      setError(friendlyAuthError(error))
    } else {
      navigate("/")
    }
  }

  async function handleMagicLink() {
    if (!email) {
      setError("Pop in your email first.")
      return
    }
    setError(null)
    setIsSubmitting(true)

    const { error } = await signInWithMagicLink(email)
    setIsSubmitting(false)

    if (error) {
      setError(friendlyAuthError(error))
    } else {
      setMagicLinkSent(true)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Hey! Ready to flow?</CardTitle>
          <CardDescription>
            {localTaskCount > 0
              ? `You have ${localTaskCount} task${localTaskCount !== 1 ? "s" : ""} on this device. Sign in to sync them.`
              : "Sign in to sync your tasks across devices."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {magicLinkSent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Check your email — we sent you a magic link. Click it and you&apos;re in.
              </p>
              <Button variant="ghost" onClick={() => setMagicLinkSent(false)}>
                Back to login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>

              <div className="relative">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  or
                </span>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleMagicLink}
                disabled={isSubmitting}
              >
                Email me a login link
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                New here?{" "}
                <Link to="/signup" className="font-medium text-foreground underline underline-offset-4">
                  Create an account
                </Link>
              </p>

              <p className="text-center text-sm text-muted-foreground">
                <Link to="/" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
                  Continue without an account
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
