import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { riskRules } from "@/db/schema";
import { nanoid } from "nanoid";

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireAdmin(user.id);

    const body = await request.json();
    const { name, incidentType, severity, trustScorePenalty, autoSuspend, suspendDurationDays } = body;

    // Validate required fields
    if (!name || !incidentType || !severity) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate severity
    if (!["low", "medium", "high", "critical"].includes(severity)) {
      return NextResponse.json({ error: "Invalid severity level" }, { status: 400 });
    }

    // Create the rule
    const ruleId = `rrule_${nanoid()}`;
    await db.insert(riskRules).values({
      id: ruleId,
      name,
      incidentType,
      severity,
      trustScorePenalty: trustScorePenalty || 0,
      autoSuspend: autoSuspend || false,
      suspendDurationDays: suspendDurationDays || null,
      enabled: true,
      createdBy: user.id,
    });

    // Redirect back to the rules page
    return NextResponse.redirect(new URL("/dashboard/admin/trust/rules", request.url));
  } catch (error) {
    console.error("Error creating risk rule:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}