import { useAuthStore } from "@/stores/useAuthStore"

/**
 * Get the current user ID for data operations.
 * Returns the Supabase user UUID when signed in, or "local" for anonymous users.
 *
 * Plain function (not a hook) so Zustand stores can call it synchronously.
 */
export function getCurrentUserId(): string {
  return useAuthStore.getState().user?.id ?? "local"
}

/**
 * Whether the user is signed in with a Supabase account.
 * When true, sync operations (queue, pull, realtime) are active.
 */
export function isAuthenticated(): boolean {
  return useAuthStore.getState().user !== null
}
