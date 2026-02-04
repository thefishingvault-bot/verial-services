import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureUserExistsInDb } from "@/lib/user-sync";
import { users } from "@/db/schema";

function isUndefinedColumnError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { code?: unknown; cause?: unknown; message?: unknown };
  if (anyErr.code === "42703") return true;
  const anyCause = anyErr.cause as { code?: unknown; message?: unknown } | undefined;
  if (anyCause?.code === "42703") return true;
  const msg = typeof anyErr.message === "string" ? anyErr.message : "";
  const causeMsg = typeof anyCause?.message === "string" ? anyCause.message : "";
  return (msg + "\n" + causeMsg).includes("does not exist") && (msg + "\n" + causeMsg).includes("column");
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

  await ensureUserExistsInDb(userId, "customer");

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { profileCompleted: true },
    });

    if (!user?.profileCompleted) {
      redirect("/onboarding");
    }
  } catch (err) {
    // If the DB hasn't had recent migrations applied yet (common on test/staging),
    // fail open rather than bouncing signed-in users to /waitlist.
    if (isUndefinedColumnError(err)) {
      console.error("[DASHBOARD_LAYOUT_SCHEMA_MISMATCH]", err);
      return <>{children}</>;
    }
    throw err;
  }

  return <>{children}</>;
}
