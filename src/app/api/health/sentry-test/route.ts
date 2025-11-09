import { NextResponse } from "next/server";

// This route is for testing Sentry error capturing.
// It will only be active when a SENTRY_DSN is configured.
export async function GET(req: Request) {
  try {
    // Intentionally throw an error
    throw new Error(`Sentry Test Error - ${new Date().toISOString()}`);
  } catch (error: any) {
    console.error(`[API_SENTRY_TEST] Caught test error: ${error.message}`);
    // The Sentry SDK will automatically capture this error.

    // Return a 500 status to the client
    return new NextResponse(`Error captured: ${error.message}`, { status: 500 });
  }
}

