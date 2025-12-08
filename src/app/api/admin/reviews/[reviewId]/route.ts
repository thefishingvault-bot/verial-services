import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.isAdmin) return admin.response;
  const { userId } = admin;

  const { reviewId } = await params;
  const { action, reason } = await req.json();

  if (!reviewId || (action !== "hide" && action !== "unhide")) {
    return new NextResponse("Invalid payload", { status: 400 });
  }

  const isHidden = action === "hide";
  const update = {
    isHidden,
    hiddenReason: isHidden ? (reason?.toString() || "Hidden by admin") : null,
    hiddenBy: isHidden ? userId : null,
    hiddenAt: isHidden ? new Date() : null,
  } as const;

  const [updated] = await db
    .update(reviews)
    .set(update)
    .where(eq(reviews.id, reviewId))
    .returning();

  if (!updated) return new NextResponse("Review not found", { status: 404 });

  return NextResponse.json(updated);
}
