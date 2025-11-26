import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { trustIncidents } from "@/db/schema";
import { eq } from "drizzle-orm";

// TODO: Replace with actual role check utility if needed
type ClerkUser = { publicMetadata?: { role?: string } };
function isAdmin(user: ClerkUser | null | undefined): boolean {
  return user?.publicMetadata?.role === "admin";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ incidentId: string }> }
) {
  try {
    const user = await currentUser();
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { incidentId } = await params;

    // Check if incident exists and is not already resolved
    const incident = await db
      .select()
      .from(trustIncidents)
      .where(eq(trustIncidents.id, incidentId))
      .limit(1);

    if (incident.length === 0) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    if (incident[0].resolved) {
      return NextResponse.json({ error: "Incident is already resolved" }, { status: 400 });
    }

    // Resolve the incident
    await db
      .update(trustIncidents)
      .set({
        resolved: true,
        resolvedBy: user!.id,
        resolvedAt: new Date(),
      })
      .where(eq(trustIncidents.id, incidentId));

    // Redirect back to the trust incidents page
    return NextResponse.redirect(new URL("/dashboard/admin/trust", request.url));
  } catch (error) {
    console.error("Error resolving trust incident:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}