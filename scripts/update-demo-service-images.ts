/*
  Fill missing service cover images with realistic placeholders.

  Safety: refuses to run unless SEED_DEMO_OK=1.

  Usage:
    pnpm services:images:demo

  Notes:
  - Updates any service missing cover_image_url (NULL/empty).
  - Does not overwrite existing cover_image_url values.
*/

import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, isNull, or } from "drizzle-orm";
import * as schema from "../src/db/schema";

dotenv.config({ path: ".env.local" });
dotenv.config();

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} environment variable is not set`);
  return v;
}

function redactDatabaseUrl(databaseUrl: string) {
  try {
    const u = new URL(databaseUrl);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return databaseUrl.replace(/:\/\/([^:]+):([^@]+)@/g, "://$1:***@");
  }
}

function assertSafeToRun() {
  if (process.env.SEED_DEMO_OK !== "1") {
    throw new Error("Refusing to run: set SEED_DEMO_OK=1 to enable demo maintenance scripts.");
  }

  if (process.env.VERCEL_ENV === "production" && process.env.SEED_DEMO_ALLOW_PROD !== "1") {
    throw new Error(
      "Refusing to run in VERCEL_ENV=production. If you really intend this, set SEED_DEMO_ALLOW_PROD=1 as well.",
    );
  }
}

function placeholderUrl(serviceId: string, category: string | null) {
  const seed = encodeURIComponent(`verial-${category ?? "other"}-${serviceId}`);
  return `https://picsum.photos/seed/${seed}/1200/800`;
}

async function main() {
  assertSafeToRun();
  const databaseUrl = requireEnv("DATABASE_URL");

  console.log(`[update-service-images] Target DB: ${redactDatabaseUrl(databaseUrl)}`);

  const client = neon(databaseUrl);
  const db = drizzle(client, { schema });

  const servicesToUpdate = await db
    .select({
      id: schema.services.id,
      category: schema.services.category,
      coverImageUrl: schema.services.coverImageUrl,
    })
    .from(schema.services)
    .where(or(isNull(schema.services.coverImageUrl), eq(schema.services.coverImageUrl, "")));

  if (servicesToUpdate.length === 0) {
    console.log("No services found needing image updates.");
    return;
  }

  const now = new Date();
  let updated = 0;

  // Keep it simple and gentle on Neon: small concurrency.
  const concurrency = 10;
  for (let i = 0; i < servicesToUpdate.length; i += concurrency) {
    const batch = servicesToUpdate.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (s) => {
        const url = placeholderUrl(s.id, s.category ?? null);
        await db
          .update(schema.services)
          .set({ coverImageUrl: url, updatedAt: now })
          .where(eq(schema.services.id, s.id));
        updated++;
      }),
    );
  }

  console.log(`Updated ${updated} services with placeholder cover images.`);
  console.log("Example URL:", placeholderUrl(servicesToUpdate[0]!.id, servicesToUpdate[0]!.category ?? null));
}

main().catch((err) => {
  console.error("\n[update-demo-service-images] ERROR");
  console.error(err);
  process.exit(1);
});
