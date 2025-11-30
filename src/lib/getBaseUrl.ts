/**
 * Get the base URL for the application
 * Used for constructing absolute URLs in server-side code
 */
export function getBaseUrl() {
  // Prefer explicitly configured public app URL (staging/prod aliases)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // In the browser, fall back to window.location.origin
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  // Local dev fallback
  return "http://localhost:3000";
}