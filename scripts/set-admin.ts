// scripts/set-admin.ts
import "dotenv/config";
import { db } from "../src/lib/db";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const adminId = "user_35jYoGGGOsVNENP3IVmWKTcX6Aj"; // your Clerk user id

  const updated = await db
    .update(users)
    .set({ role: "admin" })
    .where(eq(users.id, adminId));

  console.log("Updated rows:", updated.rowCount ?? updated);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});