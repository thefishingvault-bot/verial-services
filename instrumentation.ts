// This file is used to initialize Sentry on the server side.
// It is called by Next.js when the server starts.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");

    Sentry.init({
      dsn: process.env.SENTRY_DSN,

      // Add the Vercel AI SDK integration for agent monitoring
      integrations: [
        Sentry.vercelAIIntegration({
          recordInputs: true,
          recordOutputs: true,
        }),
      ],

      // Tracing must be enabled for agent monitoring to work
      tracesSampleRate: 1.0,

      // Send default PII to capture user information
      sendDefaultPii: true,

      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    
    Sentry.init({
      dsn: process.env.SENTRY_DSN,

      // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
      tracesSampleRate: 1,

      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    });
  }
}

