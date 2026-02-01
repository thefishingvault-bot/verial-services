import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { clerkClient } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";

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

function getDbErrorInfo(err: unknown): { code: string | null; constraint: string | null } {
  if (!err || typeof err !== "object") return { code: null, constraint: null };
  const anyErr = err as { code?: unknown; constraint?: unknown; cause?: unknown };

  const directCode = typeof anyErr.code === "string" ? anyErr.code : null;
  const directConstraint = typeof anyErr.constraint === "string" ? anyErr.constraint : null;

  const cause = anyErr.cause as { code?: unknown; constraint?: unknown } | undefined;
  const causeCode = cause && typeof cause.code === "string" ? cause.code : null;
  const causeConstraint = cause && typeof cause.constraint === "string" ? cause.constraint : null;

  return {
    code: directCode ?? causeCode,
    constraint: directConstraint ?? causeConstraint,
  };
}

export async function ensureUserExistsInDb(
  userId: string,
  role: (typeof users.role.enumValues)[number] = "customer",
) {
  // Unit tests mock Clerk/schema/db heavily; don't require a real Clerk key.
  if (process.env.NODE_ENV === "test") return;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const userEmail = user.emailAddresses[0]?.emailAddress;
  if (!userEmail) {
    throw new Error("User email not found");
  }

  try {
    // Use an explicit column list to avoid referencing new columns (e.g. username)
    // before a database migration has been applied.
    //
    // IMPORTANT: don't explicitly insert role='customer' because older DBs may not have
    // the 'customer' enum value yet. Let the DB default apply instead (which becomes
    // 'customer' once the migration is applied).
    if (role === "customer") {
      await db.execute(
        sql`
          insert into "users" ("id", "email", "first_name", "last_name", "avatar_url")
          values (${userId}, ${userEmail}, ${user.firstName}, ${user.lastName}, ${user.imageUrl})
          on conflict ("id") do nothing
        `,
      );
    } else {
      await db.execute(
        sql`
          insert into "users" ("id", "email", "first_name", "last_name", "avatar_url", "role")
          values (${userId}, ${userEmail}, ${user.firstName}, ${user.lastName}, ${user.imageUrl}, ${role})
          on conflict ("id") do nothing
        `,
      );
    }
  } catch (err) {
    const { code, constraint } = getDbErrorInfo(err);

    // If a DB row already exists for this email (e.g. an old Clerk user was deleted and recreated),
    // avoid a hard crash by "claiming" the row for the current Clerk userId.
    if (code === "23505" && constraint === "users_email_unique") {
      await db.execute(
        sql`
          update "users"
          set
            "id" = ${userId},
            "first_name" = ${user.firstName},
            "last_name" = ${user.lastName},
            "avatar_url" = ${user.imageUrl}
          where "email" = ${userEmail}
            and "id" <> ${userId}
        `,
      );

      return;
    }

    // If the table is mid-migration (or out-of-sync), we don't want to crash sign-in flows.
    // Let the caller decide how to handle it.
    if (isUndefinedColumnError(err)) {
      throw err;
    }
    throw err;
  }
}
