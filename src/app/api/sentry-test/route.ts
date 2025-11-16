import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

// This route is for testing Sentry error capturing.
// It will only be active when a SENTRY_DSN is configured.
export async function GET() {
  try {
    // Intentionally throw an error
    throw new Error(`Sentry Test Error - ${new Date().toISOString()}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API_SENTRY_TEST] Caught test error: ${message}`);
    Sentry.captureException(error); // <-- EXPLICITLY CAPTURE

    // Return a 500 status to the client
    return new NextResponse(`Error captured: ${message}`, { status: 500 });
  }
}

