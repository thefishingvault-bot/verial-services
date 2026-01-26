import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, ilike, and, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { waitlistSignups } from "@/db/schema";
import { AdminWaitlistSearchSchema, parseSearchParams } from "@/lib/validation/admin-loader-schemas";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AdminWaitlistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  if (!admin.isAdmin) redirect("/dashboard");

  const params = parseSearchParams(AdminWaitlistSearchSchema, await searchParams);

  const whereConditions = [];

  if (params.role !== "all") {
    whereConditions.push(eq(waitlistSignups.role, params.role));
  }

  if (params.email) {
    whereConditions.push(ilike(waitlistSignups.emailLower, `%${params.email.toLowerCase()}%`));
  }

  if (params.location) {
    whereConditions.push(ilike(waitlistSignups.suburbCityNorm, `%${params.location.toLowerCase()}%`));
  }

  if (params.category) {
    whereConditions.push(ilike(waitlistSignups.categoryNorm, `%${params.category.toLowerCase()}%`));
  }

  const where = whereConditions.length ? and(...whereConditions) : undefined;

  const rows = await db
    .select({
      id: waitlistSignups.id,
      createdAt: waitlistSignups.createdAt,
      role: waitlistSignups.role,
      email: waitlistSignups.email,
      suburbCity: waitlistSignups.suburbCity,
      categoryText: waitlistSignups.categoryText,
      yearsExperience: waitlistSignups.yearsExperience,
      referralCode: waitlistSignups.referralCode,
      referredById: waitlistSignups.referredById,
      referralCount: sql<number>`(select count(*) from waitlist_signups w2 where w2.referred_by_id = ${waitlistSignups.id})`,
    })
    .from(waitlistSignups)
    .where(where)
    .orderBy(desc(waitlistSignups.createdAt))
    .limit(500);

  const referredByIds = Array.from(new Set(rows.map((r) => r.referredById).filter(Boolean) as string[]));
  const referredByRows = referredByIds.length
    ? await db
        .select({ id: waitlistSignups.id, email: waitlistSignups.email })
        .from(waitlistSignups)
        .where(inArray(waitlistSignups.id, referredByIds))
    : [];

  const referredByEmailById = new Map(referredByRows.map((r) => [r.id, r.email] as const));

  const query = new URLSearchParams();
  if (params.role !== "all") query.set("role", params.role);
  if (params.email) query.set("email", params.email);
  if (params.location) query.set("location", params.location);
  if (params.category) query.set("category", params.category);

  const exportHref = `/api/admin/waitlist/export?${query.toString()}`;
  const exportEmailsHref = `/api/admin/waitlist/export?${query.toString()}${query.toString() ? "&" : ""}emailsOnly=1`;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Waitlist</h1>
          <p className="text-sm text-muted-foreground">Public waitlist signups and referral tracking.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={exportHref}>Export CSV</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={exportEmailsHref}>Emails only</Link>
          </Button>
        </div>
      </div>

      <form className="grid gap-3 rounded-lg border bg-background p-4 sm:grid-cols-4" method="GET">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Role</label>
          <select
            name="role"
            defaultValue={params.role}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">All</option>
            <option value="provider">Provider</option>
            <option value="customer">Customer</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Email</label>
          <Input name="email" defaultValue={params.email} className="h-9" placeholder="Search email…" />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Suburb/City</label>
          <Input name="location" defaultValue={params.location} className="h-9" placeholder="Search location…" />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Category</label>
          <Input name="category" defaultValue={params.category} className="h-9" placeholder="Search category…" />
        </div>

        <div className="sm:col-span-4 flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          <Button asChild type="button" variant="ghost" size="sm">
            <Link href="/dashboard/admin/waitlist">Reset</Link>
          </Button>
        </div>
      </form>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Suburb/City</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Years</TableHead>
              <TableHead>Referral code</TableHead>
              <TableHead>Referred by</TableHead>
              <TableHead className="text-right">Referrals</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {r.createdAt?.toISOString?.().slice(0, 10) ?? ""}
                  </TableCell>
                  <TableCell className="capitalize">{r.role}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{r.email}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{r.suburbCity}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{r.categoryText ?? ""}</TableCell>
                  <TableCell>{r.yearsExperience ?? ""}</TableCell>
                  <TableCell className="font-mono text-xs">{r.referralCode}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                    {r.referredById ? referredByEmailById.get(r.referredById) ?? r.referredById : ""}
                  </TableCell>
                  <TableCell className="text-right">{Number(r.referralCount ?? 0)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">Showing up to 500 results. Use export for larger pulls.</p>
    </div>
  );
}
