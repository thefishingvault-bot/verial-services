import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { riskRules } from "@/db/schema";
import { nanoid } from "nanoid";
import { requireAdmin } from "@/lib/admin-auth";
import { TrustRuleSchema, invalidResponse, parseBody } from "@/lib/validation/admin";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;
    const { userId } = admin;

    const parsed = await parseBody(TrustRuleSchema, request);
    if (!parsed.ok) return invalidResponse(parsed.error);

    const { name, incidentType, severity, trustScorePenalty, autoSuspend, suspendDurationDays } = parsed.data;

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
      createdBy: userId!,
    });

    // Redirect back to the rules page
    return NextResponse.redirect(new URL("/dashboard/admin/trust/rules", request.url));
  } catch (error) {
    console.error("Error creating risk rule:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}