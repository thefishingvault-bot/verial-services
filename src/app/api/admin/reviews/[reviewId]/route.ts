import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { reviews } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  await requireAdmin(userId);

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
