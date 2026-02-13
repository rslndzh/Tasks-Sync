import type { AuthError } from "@supabase/supabase-js"

/**
 * Convert Supabase auth errors into friendly, Flowpin-toned messages.
 * No technical jargon — keep it warm and helpful.
 */
export function friendlyAuthError(error: AuthError): string {
  const msg = error.message.toLowerCase()

  if (msg.includes("email not confirmed")) {
    return "Check your email — we sent you a confirmation link."
  }
  if (msg.includes("invalid login credentials")) {
    return "Hmm, that doesn't match. Double-check your email and password?"
  }
  if (msg.includes("user already registered")) {
    return "That email's already taken. Try signing in instead?"
  }
  if (msg.includes("email rate limit")) {
    return "Too many attempts. Take a breather and try again in a minute."
  }
  if (msg.includes("password") && msg.includes("short")) {
    return "Password needs to be at least 6 characters. A little longer, please."
  }
  if (msg.includes("network")) {
    return "You're offline. No worries — try again when you're back."
  }

  // Fallback — still friendly
  return "Something went sideways. Try again?"
}
