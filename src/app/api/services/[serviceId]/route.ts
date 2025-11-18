import { db } from "@/lib/db";
import { services, providers } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";

export async function DELETE(
  req: Request,
  { params }: { params: { serviceId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { serviceId } = params;

    const provider = await db.query.providers.findFirst({
      where: eq(providers.userId, userId),
    });

    if (!provider) {
      return new NextResponse("Provider not found", { status: 404 });
    }

    const [deleted] = await db
      .delete(services)
      .where(
        and(
          eq(services.id, serviceId),
          eq(services.providerId, provider.id),
        ),
      )
      .returning();

    if (!deleted) {
      return new NextResponse("Service not found or access denied", { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API_SERVICE_DELETE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

