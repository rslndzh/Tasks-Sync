/**
 * Detect which platform Flowpin is running on.
 * Returns 'web' for now — extended to 'desktop' | 'mobile' when
 * Electron and Capacitor wrappers are added post-MVP.
 */
export function usePlatform(): "web" | "desktop" | "mobile" {
  // Future: detect Electron via window.electron or Capacitor via Capacitor.isNativePlatform()
  return "web"
}
