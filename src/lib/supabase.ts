import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ""
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""

/**
 * Whether Supabase is configured. When false, the app runs in
 * local-only mode (Dexie reads, no remote sync, no auth).
 */
export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabaseAnonKey.length > 0

/**
 * Supabase client — only created when env vars are present.
 * When Supabase isn't configured, this is `null`.
 * Always check `isSupabaseConfigured` before using.
 */
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null

/**
 * Get the Supabase client or throw if not configured.
 * Use in places where auth is mandatory.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.")
  }
  return supabase
}
