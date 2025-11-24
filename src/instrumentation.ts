import * as Sentry from "@sentry/nextjs";

// This file is used to initialize Sentry on the server.
// It must be in the /src directory.

export function register() {
  // Node.js runtime (Route Handlers, RSC, etc.)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.SENTRY_DSN) {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 1.0,
      });
    }
  }

  // Edge runtime (edge routes, middleware/proxy)
  if (process.env.NEXT_RUNTIME === "edge") {
    if (process.env.SENTRY_DSN) {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 1.0,
      });
    }
  }
}

// Capture server-side request/rendering errors from App Router
export const onRequestError = Sentry.captureRequestError;

