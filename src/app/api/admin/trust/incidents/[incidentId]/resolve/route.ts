import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trustIncidents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ incidentId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;
    const { userId } = admin;

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
        resolvedBy: userId!,
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