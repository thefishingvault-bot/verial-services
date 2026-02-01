import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureUserExistsInDb } from "@/lib/user-sync";
import { users } from "@/db/schema";

function isUndefinedColumnError(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: unknown }).code === "42703";
}

export const runtime = "nodejs";

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  await ensureUserExistsInDb(userId, "user");

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { usernameLower: true },
    });

    if (!user?.usernameLower) {
      redirect("/onboarding");
    }
  } catch (err) {
    // If the DB hasn't had the username migration applied yet, fail gracefully.
    if (isUndefinedColumnError(err)) {
      redirect("/waitlist");
    }
    throw err;
  }

  return <>{children}</>;
}
