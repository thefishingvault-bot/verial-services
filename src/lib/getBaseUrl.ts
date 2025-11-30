/**
 * Get the base URL for the application
 * Used for constructing absolute URLs in server-side code
 */
export function getBaseUrl() {
  // Check for explicit APP_URL first
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Check for Vercel URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Fallback for local development
  return "http://localhost:3000";
}