import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { providerTimeOffs, providers } from "@/db/schema";
import { assertProviderCanTransactFromProvider } from "@/lib/provider-access";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const provider = await db.query.providers.findFirst({ where: eq(providers.userId, userId) });
    if (!provider) return new NextResponse("Provider not found", { status: 404 });

    const access = assertProviderCanTransactFromProvider(provider);
    if (!access.ok) return access.response;

    const { id } = await params;

    const [removed] = await db
      .delete(providerTimeOffs)
      .where(and(eq(providerTimeOffs.id, id), eq(providerTimeOffs.providerId, provider.id)))
      .returning();

    if (!removed) return new NextResponse("Not found", { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API_TIME_OFF_DELETE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
