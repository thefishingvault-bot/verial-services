import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  // All Session Replay config has been removed to fix
  // 'Multiple Sentry Session Replay instances' error.
});

