import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { waitlistSignups } from "@/db/schema";
import { AdminWaitlistSearchSchema, parseSearchParams } from "@/lib/validation/admin-loader-schemas";

export const runtime = "nodejs";

function escapeCsv(value: unknown) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[\r\n",]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.isAdmin) return admin.response;

    const url = new URL(request.url);
    const params = parseSearchParams(
      AdminWaitlistSearchSchema,
      Object.fromEntries(url.searchParams.entries()),
    );

    const roleFilter = params.role;
    const emailSearch = params.email;
    const locationSearch = params.location;
    const categorySearch = params.category;

    const whereConditions = [];

    if (roleFilter !== "all") {
      whereConditions.push(eq(waitlistSignups.role, roleFilter));
    }

    if (emailSearch) {
      whereConditions.push(ilike(waitlistSignups.emailLower, `%${emailSearch.toLowerCase()}%`));
    }

    if (locationSearch) {
      whereConditions.push(ilike(waitlistSignups.suburbCityNorm, `%${locationSearch.toLowerCase()}%`));
    }

    if (categorySearch) {
      whereConditions.push(ilike(waitlistSignups.categoryNorm, `%${categorySearch.toLowerCase()}%`));
    }

    const where = whereConditions.length ? and(...whereConditions) : undefined;

    const rows = await db
      .select({
        createdAt: waitlistSignups.createdAt,
        role: waitlistSignups.role,
        email: waitlistSignups.email,
        suburbCity: waitlistSignups.suburbCity,
        categoryText: waitlistSignups.categoryText,
        yearsExperience: waitlistSignups.yearsExperience,
        referralCode: waitlistSignups.referralCode,
        referredById: waitlistSignups.referredById,
      })
      .from(waitlistSignups)
      .where(where)
      .orderBy(desc(waitlistSignups.createdAt))
      .limit(5000);

    const emailsOnly = url.searchParams.get("emailsOnly");

    if (emailsOnly && emailsOnly !== "0" && emailsOnly !== "false") {
      const header = ["email"];
      const lines = [header.join(",")];
      for (const r of rows) {
        lines.push([r.email].map(escapeCsv).join(","));
      }
      const csv = lines.join("\n");
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="waitlist_emails_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    // Map referredById -> email
    const refIds = Array.from(new Set(rows.map((r) => r.referredById).filter(Boolean) as string[]));
    const referrers = refIds.length
      ? await db
          .select({ id: waitlistSignups.id, email: waitlistSignups.email })
          .from(waitlistSignups)
          .where(inArray(waitlistSignups.id, refIds))
      : [];

    const refEmailById = new Map(referrers.map((r) => [r.id, r.email] as const));

    const header = [
      "created_at",
      "role",
      "email",
      "suburb_city",
      "category_text",
      "years_experience",
      "referral_code",
      "referred_by_email",
    ];

    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.createdAt?.toISOString?.() ?? "",
          r.role,
          r.email,
          r.suburbCity,
          r.categoryText ?? "",
          r.yearsExperience ?? "",
          r.referralCode,
          r.referredById ? refEmailById.get(r.referredById) ?? "" : "",
        ]
          .map(escapeCsv)
          .join(","),
      );
    }

    const csv = lines.join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="waitlist_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting waitlist:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
