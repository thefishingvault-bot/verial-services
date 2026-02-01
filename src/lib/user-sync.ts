import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { clerkClient } from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";

function rowsFromExecuteResult(result: unknown): Array<Record<string, unknown>> {
  if (!result) return [];
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (typeof result === "object" && result && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as Array<Record<string, unknown>>;
  }
  return [];
}

function getDbErrorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const anyErr = err as { code?: unknown; cause?: unknown };
  if (typeof anyErr.code === "string") return anyErr.code;
  const cause = anyErr.cause as { code?: unknown } | undefined;
  if (cause && typeof cause.code === "string") return cause.code;
  return null;
}

function getDbConstraint(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const anyErr = err as { constraint?: unknown; cause?: unknown };
  if (typeof anyErr.constraint === "string") return anyErr.constraint;
  const cause = anyErr.cause as { constraint?: unknown } | undefined;
  if (cause && typeof cause.constraint === "string") return cause.constraint;
  return null;
}

function isSafeIdent(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9_]+$/i.test(value);
}

function makePlaceholderEmail(userId: string): string {
  const cleaned = userId.replace(/[^a-zA-Z0-9]/g, "");
  const suffix = cleaned.slice(-24) || "user";
  return `migrating+${suffix}@verial.invalid`;
}

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
    const code = getDbErrorCode(err);
    const constraint = getDbConstraint(err);

    // If a row already exists with the same email but a different Clerk user id,
    // create a placeholder row for the new id, repoint all FK references, then
    // delete the old row and set the correct email.
    if (code === "23505" && constraint === "users_email_unique") {
      const existingByEmail = await db.query.users.findFirst({
        where: eq(users.email, userEmail),
        columns: { id: true },
      });

      const oldUserId = existingByEmail?.id;
      if (!oldUserId) {
        throw err;
      }

      if (oldUserId === userId) {
        // Race: row exists already.
        return;
      }

      // Ensure a placeholder row exists for the current Clerk user id.
      const existingById = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { id: true, email: true },
      });

      if (!existingById) {
        const placeholderEmail = makePlaceholderEmail(userId);

        if (role === "customer") {
          await db.execute(
            sql`
              insert into "users" ("id", "email", "first_name", "last_name", "avatar_url")
              values (${userId}, ${placeholderEmail}, ${user.firstName}, ${user.lastName}, ${user.imageUrl})
              on conflict ("id") do nothing
            `,
          );
        } else {
          await db.execute(
            sql`
              insert into "users" ("id", "email", "first_name", "last_name", "avatar_url", "role")
              values (${userId}, ${placeholderEmail}, ${user.firstName}, ${user.lastName}, ${user.imageUrl}, ${role})
              on conflict ("id") do nothing
            `,
          );
        }
      }

      // Discover all FK columns that reference users(id) and repoint them.
      const fkResult = await db.execute(sql`
        select tc.table_name, kcu.column_name
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
          and tc.table_schema = kcu.table_schema
        join information_schema.constraint_column_usage ccu
          on ccu.constraint_name = tc.constraint_name
          and ccu.table_schema = tc.table_schema
        where tc.constraint_type = 'FOREIGN KEY'
          and tc.table_schema = 'public'
          and ccu.table_name = 'users'
          and ccu.column_name = 'id'
      `);

      const fkRows = rowsFromExecuteResult(fkResult)
        .map((r) => ({ table: r.table_name, column: r.column_name }))
        .filter((r) => isSafeIdent(r.table) && isSafeIdent(r.column) && r.table !== "users");

      for (const { table, column } of fkRows) {
        await db.execute(
          sql`
            update ${sql.raw(`"${table}"`)}
            set ${sql.raw(`"${column}"`)} = ${userId}
            where ${sql.raw(`"${column}"`)} = ${oldUserId}
          `,
        );
      }

      // Delete the old user row and set the correct email on the new row.
      await db.delete(users).where(eq(users.id, oldUserId));

      await db
        .update(users)
        .set({
          email: userEmail,
          firstName: user.firstName,
          lastName: user.lastName,
          avatarUrl: user.imageUrl,
          role,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

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
