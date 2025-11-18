import { db } from "@/lib/db";
import { providerTimeOffs } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";

// DELETE: Delete a specific time-off
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const provider = await db.query.providers.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
    });

    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    const { id } = await params;
    const timeOffId = id;

    if (!timeOffId) {
      return new NextResponse("Missing timeOffId", { status: 400 });
    }

    const [deleted] = await db
      .delete(providerTimeOffs)
      .where(
        and(
          eq(providerTimeOffs.id, timeOffId),
          eq(providerTimeOffs.providerId, provider.id)
        )
      )
      .returning();

    if (!deleted) {
      return new NextResponse("Time-off not found or access denied", { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API_TIMEOFF_DELETE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

