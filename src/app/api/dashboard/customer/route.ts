import { NextResponse } from "next/server";
import { getCustomerDashboardData } from "@/lib/dashboard/customer-dashboard";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await getCustomerDashboardData();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    if (message === "Unauthorized") {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    console.error("[API_DASHBOARD_CUSTOMER]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
