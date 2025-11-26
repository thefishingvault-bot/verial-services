import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { riskRules } from "@/db/schema";
import { eq } from "drizzle-orm";

// TODO: Replace with actual role check utility if needed
type ClerkUser = { publicMetadata?: { role?: string } };
function isAdmin(user: ClerkUser | null | undefined): boolean {
  return user?.publicMetadata?.role === "admin";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  try {
    const user = await currentUser();
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ruleId } = await params;

    // Get current rule status
    const rule = await db
      .select({ enabled: riskRules.enabled })
      .from(riskRules)
      .where(eq(riskRules.id, ruleId))
      .limit(1);

    if (rule.length === 0) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    // Toggle the enabled status
    await db
      .update(riskRules)
      .set({
        enabled: !rule[0].enabled,
        updatedAt: new Date(),
      })
      .where(eq(riskRules.id, ruleId));

    // Redirect back to the rules page
    return NextResponse.redirect(new URL("/dashboard/admin/trust/rules", request.url));
  } catch (error) {
    console.error("Error toggling risk rule:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}