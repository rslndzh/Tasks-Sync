import { create } from "zustand"
import type { Session, User, AuthError } from "@supabase/supabase-js"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { hasLocalData, migrateLocalData, pushAllToSupabase } from "@/lib/sync"
import type { Database } from "@/types/database"

type Profile = Database["public"]["Tables"]["profiles"]["Row"]

interface AuthState {
  /** Supabase session (null if not logged in) */
  session: Session | null
  /** Supabase user */
  user: User | null
  /** Flowpin profile from profiles table */
  profile: Profile | null
  /** True while auth state is being resolved on app launch */
  isLoading: boolean
  /** True if Supabase env vars are configured */
  isConfigured: boolean
  /** True while local data is being migrated to the account */
  isMigrating: boolean

  // Actions
  initialize: () => Promise<void>
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  fetchProfile: () => Promise<void>
  completeOnboarding: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  isConfigured: isSupabaseConfigured,
  isMigrating: false,

  initialize: async () => {
    if (!supabase) {
      set({ isLoading: false })
      return
    }

    // Get current session
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session?.user) {
      // Check for unmigrated local data BEFORE setting user —
      // this prevents useSupabaseSync from running before migration finishes.
      // (e.g., signed up, confirmed email externally, then reloaded)
      const hasLocal = await hasLocalData()
      if (hasLocal) {
        set({ isMigrating: true })
        try {
          await migrateLocalData(session.user.id)
          await pushAllToSupabase(session.user.id)
        } catch {
          // Migration failed — data stays local, user can retry
        }
        set({ isMigrating: false })
      }

      // NOW set the user so stores and sync hook pick up the migrated data
      set({ session, user: session.user })
      await get().fetchProfile()
    }

    set({ isLoading: false })

    // Listen for auth changes (login, logout, token refresh)
    supabase.auth.onAuthStateChange(async (event, session) => {
      const previousUser = get().user
      set({ session, user: session?.user ?? null })

      if (session?.user) {
        await get().fetchProfile()

        // Migrate local data on first sign-in (anonymous → authenticated)
        const isNewLogin = !previousUser && session.user
        if (isNewLogin && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
          const hasLocal = await hasLocalData()
          if (hasLocal) {
            set({ isMigrating: true })
            try {
              await migrateLocalData(session.user.id)
              await pushAllToSupabase(session.user.id)
            } catch {
              // Migration failed — data stays local, user can retry
            }
            set({ isMigrating: false })
          }
        }
      } else {
        set({ profile: null })
      }
    })
  },

  signUp: async (email, password) => {
    if (!supabase) return { error: { message: "Cloud sync isn't available right now. Try again later.", name: "AuthError", status: 0 } as unknown as import("@supabase/supabase-js").AuthError }
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (!error && data.session) {
      // Auto-confirmed — set user immediately
      set({ session: data.session, user: data.user })
    }
    return { error }
  },

  signIn: async (email, password) => {
    if (!supabase) return { error: { message: "Cloud sync isn't available right now. Try again later.", name: "AuthError", status: 0 } as unknown as import("@supabase/supabase-js").AuthError }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error && data.session) {
      // Set user immediately instead of waiting for onAuthStateChange
      set({ session: data.session, user: data.user })
      if (data.user) {
        await get().fetchProfile()
      }
    }
    return { error }
  },

  signInWithMagicLink: async (email) => {
    if (!supabase) return { error: { message: "Cloud sync isn't available right now. Try again later.", name: "AuthError", status: 0 } as unknown as import("@supabase/supabase-js").AuthError }
    const { error } = await supabase.auth.signInWithOtp({ email })
    return { error }
  },

  signOut: async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    // Keep local data — user might want to continue using locally
    set({ session: null, user: null, profile: null })
  },

  fetchProfile: async () => {
    if (!supabase) return
    const user = get().user
    if (!user) return

    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single()

    if (data) {
      set({ profile: data })
    }
  },

  completeOnboarding: async () => {
    const user = get().user
    if (!user) return

    if (supabase) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("profiles").update({ onboarding_completed: true }).eq("id", user.id)
    }

    set((state) => ({
      profile: state.profile ? { ...state.profile, onboarding_completed: true } : null,
    }))
  },
}))
