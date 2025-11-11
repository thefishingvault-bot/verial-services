// This file is used to initialize Sentry on the server.
// It must be in the /src directory.

import * as Sentry from "@sentry/nextjs";

export function register() {
  // Only run Sentry init if a DSN is provided
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 1.0,
      // ... add any other server-side Sentry config here
    });
    console.log('[Instrumentation] Sentry server-side SDK initialized.');
  } else {
    console.warn('[Instrumentation] SENTRY_DSN not found. Sentry server-side SDK not initialized.');
  }
}

