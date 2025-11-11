// This file configures the Sentry client-side SDK.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  // We removed Session Replay to fix console errors
});

