import { NextRequest, NextResponse } from "next/server";
import { getSimilarServices } from "@/lib/similar-services";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, context: { params: Promise<{ serviceId: string }> }) {
  try {
    const { serviceId } = await context.params;
    if (!serviceId) {
      return new NextResponse("serviceId is required", { status: 400 });
    }

    const items = await getSimilarServices(serviceId);
    if (items == null) {
      return new NextResponse("Service not found", { status: 404 });
    }

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[API_SIMILAR_SERVICES]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
