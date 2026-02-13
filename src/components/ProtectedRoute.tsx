import { Navigate } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthStore } from "@/stores/useAuthStore"

/**
 * Route guard that redirects to /login if not authenticated.
 * Shows a loading skeleton while auth state is being resolved
 * (prevents flash of login page on refresh).
 *
 * When Supabase isn't configured, allows through (dev mode).
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, isLoading, isConfigured } = useAuthStore()

  // Dev mode: Supabase not configured, let everything through
  if (!isConfigured) {
    return <>{children}</>
  }

  // Still resolving auth state — show skeleton to prevent flash
  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    )
  }

  // Not logged in — redirect to login
  if (!session) {
    return <Navigate to="/login" replace />
  }

  // Logged in but onboarding not complete — redirect to onboarding
  if (profile && !profile.onboarding_completed) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
