/*
  Demo seed script for the Verial TEST environment.
  Safety: refuses to run unless SEED_DEMO_OK=1.

  Usage:
    pnpm seed:demo
    pnpm seed:demo:wipe
*/

import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, like, or, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

// Load env like the app does (.env.local first).
dotenv.config({ path: ".env.local" });
dotenv.config();

const DEMO_PREFIX = "demo_";

type Args = {
  wipe: boolean;
};

function parseArgs(argv: string[]): Args {
  return {
    wipe: argv.includes("--wipe"),
  };
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} environment variable is not set`);
  return v;
}

function redactDatabaseUrl(databaseUrl: string) {
  try {
    const u = new URL(databaseUrl);
    // redact password if present
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    // Best-effort fallback (don't leak creds)
    return databaseUrl.replace(/:\/\/([^:]+):([^@]+)@/g, "://$1:***@");
  }
}

function assertSafeToRun() {
  if (process.env.SEED_DEMO_OK !== "1") {
    throw new Error("Refusing to run: set SEED_DEMO_OK=1 to enable demo seeding.");
  }

  // Extra safety: refuse in production env unless explicitly allowed.
  if (process.env.VERCEL_ENV === "production" && process.env.SEED_DEMO_ALLOW_PROD !== "1") {
    throw new Error(
      "Refusing to run in VERCEL_ENV=production. If you really intend this, set SEED_DEMO_ALLOW_PROD=1 as well.",
    );
  }
}

function pad(n: number, width: number) {
  return String(n).padStart(width, "0");
}

function normalize(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s\-]/g, "")
    .replace(/\s/g, "-");
}

function hash32(input: string) {
  // FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(rng: () => number, items: T[]) {
  return items[Math.floor(rng() * items.length)]!;
}

function shuffle<T>(rng: () => number, items: T[]) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function cents(nzd: number) {
  return Math.round(nzd * 100);
}

const AUCKLAND_SUBURBS = [
  "Ponsonby",
  "Grey Lynn",
  "Mt Eden",
  "Epsom",
  "Parnell",
  "Newmarket",
  "Remuera",
  "Kingsland",
  "Devonport",
  "Takapuna",
  "Milford",
  "Glenfield",
  "Albany",
  "Henderson",
  "New Lynn",
  "Avondale",
  "Mount Roskill",
  "Onehunga",
  "Sylvia Park",
  "Pakuranga",
  "Botany",
  "Howick",
  "Manukau",
  "Papatoetoe",
  "Mangere",
  "Otahuhu",
  "Papakura",
  "Takanini",
  "Pukekohe",
  "Beachlands",
  "Half Moon Bay",
  "West Harbour",
  "Te Atatu",
  "Point Chevalier",
  "Herne Bay",
  "St Heliers",
  "Mission Bay",
  "Sandringham",
  "Balmoral",
  "Ellerslie",
  "Stonefields",
] as const;

const BUSINESS_NAMES = [
  "North Shore Cleaning Co",
  "Kiwi IT Support",
  "Rapid Lawn & Garden",
  "Spark Plumbing",
  "Harbour Home Detailing",
  "Auckland Handyman Hub",
  "FreshStart Carpet Care",
  "Brightline Electrical",
  "Citywide Builders",
  "Zen Accounting",
  "Weekend Gardener",
  "QuickFix Plumbing",
  "Shine & Go Cleaning",
  "GreenThumb Gardens",
  "Mobile Mechanic NZ",
  "Cloud Kiwi Tech",
  "Pro Paint & Patch",
  "Metro Moving Help",
  "Coastal Pressure Wash",
  "Silver Fern Repairs",
] as const;

const SERVICE_TEMPLATES: Array<{
  category: typeof schema.serviceCategoryEnum.enumValues[number];
  titles: string[];
  description: string;
}> = [
  {
    category: "cleaning",
    titles: ["Home Cleaning", "End of Tenancy Clean", "Deep Clean", "Office Cleaning", "Bathroom + Kitchen Refresh"],
    description:
      "Reliable, detail-focused cleaning with transparent pricing. Supplies provided on request. Friendly local team and flexible times.",
  },
  {
    category: "plumbing",
    titles: ["Leak Fix", "Tap & Toilet Repairs", "Hot Water Troubleshooting", "Blocked Drain", "New Fixture Install"],
    description:
      "Fast diagnosis and tidy workmanship. We’ll explain options clearly and keep you updated. Ideal for small fixes or bigger jobs.",
  },
  {
    category: "gardening",
    titles: ["Lawn Mow + Edge", "Hedge Trim", "Garden Tidy", "Weed Control", "Green Waste Removal"],
    description:
      "Keep your outdoor space looking sharp. We bring our own gear, clean up properly, and can set up regular maintenance.",
  },
  {
    category: "it_support",
    titles: ["Wi‑Fi Setup", "PC Tune‑Up", "Printer Help", "Home Office Setup", "Small Business IT Support"],
    description:
      "Calm, practical tech support. We can help with devices, Wi‑Fi, setup, and troubleshooting — remote or on‑site.",
  },
  {
    category: "detailing",
    titles: ["Interior Detail", "Exterior Wash + Wax", "Mini Detail", "Pet Hair Removal", "Headlight Restoration"],
    description:
      "Bring your vehicle back to life with a careful clean. Mobile options available. Great for resale, events, or regular upkeep.",
  },
  {
    category: "accounting",
    titles: ["GST Return Help", "Bookkeeping Cleanup", "Small Business Accounts", "Tax Prep", "Xero Setup"],
    description:
      "Straightforward accounting help for individuals and small businesses. Clean records, clear advice, and on-time filing support.",
  },
];

const MESSAGE_SNIPPETS_USER = [
  "Hi! Are you available this week?",
  "Could you please confirm the time?",
  "Thanks — can you bring the right tools/supplies?",
  "What’s the usual turnaround time?",
  "Sounds good. See you then.",
  "Is there anything you need from me beforehand?",
  "Can you share a quick estimate?",
];

const MESSAGE_SNIPPETS_PROVIDER = [
  "Yep, I can do that. What day suits you best?",
  "Confirmed — I’ll be there on time.",
  "No worries, I’ve got everything needed.",
  "For that job, pricing depends on scope — happy to quote.",
  "Thanks! I’ll send a reminder closer to the day.",
  "If you can send a couple of photos, that helps.",
  "All good — I’ll update you when I’m on the way.",
];

async function countRows(db: ReturnType<typeof makeDb>, table: unknown) {
  // Drizzle's `from()` is strongly typed; we only need the runtime table object here.
  // Cast to a known table type to preserve the select result shape.
  const res = await db
    .select({ count: sql<number>`count(*)` })
    .from(table as unknown as typeof schema.users);
  return Number(res[0]?.count ?? 0);
}

function makeDb() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const sqlClient = neon(databaseUrl);
  return drizzle(sqlClient, { schema, logger: false });
}

async function getMissingColumns(db: ReturnType<typeof makeDb>, tableName: string, requiredColumns: string[]) {
  // Query information_schema so we can fail fast when the DB is behind migrations.
  const requiredList = sql.join(
    requiredColumns.map((c) => sql`${c}`),
    sql`, `,
  );
  const dbWithExecute = db as unknown as { execute: (query: unknown) => Promise<unknown> };
  const executeResult = await dbWithExecute.execute(
    sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
        and column_name in (${requiredList})
    `,
  );

  const rowsUnknown = (executeResult as { rows?: unknown })?.rows;
  const rowsArray: unknown[] =
    Array.isArray(rowsUnknown)
      ? rowsUnknown
      : Array.isArray(executeResult)
        ? executeResult
        : [];

  const found = new Set<string>();
  for (const r of rowsArray) {
    if (typeof r === "object" && r !== null && "column_name" in r) {
      const columnName = (r as { column_name?: unknown }).column_name;
      if (typeof columnName === "string") found.add(columnName);
    }
  }

  return requiredColumns.filter((c) => !found.has(c));
}

async function assertDbSchemaCompatible(db: ReturnType<typeof makeDb>) {
  const missingUsers = await getMissingColumns(db, "users", [
    "id",
    "email",
    "role",
    "profile_completed",
    "early_provider_access",
    "username",
    "username_lower",
  ]);

  if (missingUsers.length > 0) {
    const msg = [
      "Target DATABASE_URL is missing expected columns on public.users.",
      `Missing: ${missingUsers.join(", ")}`,
      "This usually means the database is behind migrations (common on test/staging).",
      "\nFix:",
      "- Run `pnpm drizzle:migrate` with this same DATABASE_URL (or migrate your Neon branch).",
      "- Then re-run `pnpm seed:demo`.",
    ].join("\n");
    throw new Error(msg);
  }
}

async function withBestEffortTransaction<T>(
  db: ReturnType<typeof makeDb>,
  fn: (tx: ReturnType<typeof makeDb>) => Promise<T>,
): Promise<T> {
  const maybeDb = db as unknown as { transaction?: (cb: (tx: unknown) => Promise<T>) => Promise<T> };
  if (typeof maybeDb.transaction !== "function") return fn(db);

  try {
    return await maybeDb.transaction(async (tx) => fn(tx as ReturnType<typeof makeDb>));
  } catch (err) {
    // Some Neon HTTP setups/drivers can be finicky with transactions. Fallback is still safe because
    // IDs/emails are demo-prefixed and wipe mode exists.
    console.warn("[seed-demo] Transaction failed; falling back to non-transactional inserts.");
    console.warn(err);
    return await fn(db);
  }
}

function buildPricing(rng: () => number) {
  const pricingTypes = schema.servicePricingTypeEnum.enumValues;
  const pricingType = pick(rng, pricingTypes);

  if (pricingType === "quote") {
    return {
      pricingType,
      priceInCents: null as number | null,
      priceNote: "Free quote — we’ll confirm after a quick chat.",
    };
  }

  if (pricingType === "from") {
    const from = randInt(rng, 45, 160);
    return {
      pricingType,
      priceInCents: cents(from),
      priceNote: `From $${from} depending on scope.`,
    };
  }

  const fixed = randInt(rng, 70, 320);
  return {
    pricingType,
    priceInCents: cents(fixed),
    priceNote: "Fixed price for standard jobs.",
  };
}

function bookingStatusForIndex(i: number): typeof schema.bookingStatusEnum.enumValues[number] {
  const statuses = schema.bookingStatusEnum.enumValues;
  // Deterministic spread across statuses.
  return statuses[i % statuses.length]!;
}

function trustLevelForScore(score: number): typeof schema.trustLevelEnum.enumValues[number] {
  if (score >= 85) return "gold";
  if (score >= 60) return "silver";
  return "bronze";
}

function providerPlanForIndex(i: number): typeof schema.providerPlanEnum.enumValues[number] {
  const plans: Array<typeof schema.providerPlanEnum.enumValues[number]> = ["starter", "pro", "elite"];
  return plans[i % plans.length]!;
}

function moneySplit(gross: number) {
  // Very rough platform fee model for demo purposes.
  const platformFee = Math.max(99, Math.round(gross * 0.1));
  const gst = Math.round(platformFee * 0.15);
  const net = gross - platformFee;
  const customerServiceFee = Math.round(gross * 0.05);
  const customerTotal = gross + customerServiceFee;
  return { platformFee, gst, net, customerServiceFee, customerTotal };
}

function demoId(prefix: string, idx: number, width = 4) {
  return `${DEMO_PREFIX}${prefix}_${pad(idx, width)}`;
}

async function wipeDemoData(db: ReturnType<typeof makeDb>) {
  const pref = `${DEMO_PREFIX}%`;
  const demoSlugPref = `demo-%`;

  await withBestEffortTransaction(db, async (tx) => {
    // Delete in FK-safe order.
    await tx
      .delete(schema.waitlistSignups)
      .where(or(like(schema.waitlistSignups.id, pref), like(schema.waitlistSignups.email, pref)));

    await tx
      .delete(schema.serviceFavorites)
      .where(or(like(schema.serviceFavorites.userId, pref), like(schema.serviceFavorites.serviceId, pref)));

    await tx
      .delete(schema.favoriteProviders)
      .where(
        or(
          like(schema.favoriteProviders.id, pref),
          like(schema.favoriteProviders.userId, pref),
          like(schema.favoriteProviders.providerId, pref),
        ),
      );

    await tx
      .delete(schema.providerEarnings)
      .where(
        or(
          like(schema.providerEarnings.id, pref),
          like(schema.providerEarnings.bookingId, pref),
          like(schema.providerEarnings.providerId, pref),
        ),
      );

    await tx
      .delete(schema.reviews)
      .where(or(like(schema.reviews.id, pref), like(schema.reviews.bookingId, pref), like(schema.reviews.userId, pref)));

    await tx
      .delete(schema.notifications)
      .where(or(like(schema.notifications.id, pref), like(schema.notifications.userId, pref), like(schema.notifications.bookingId, pref)));

    await tx
      .delete(schema.messages)
      .where(
        or(
          like(schema.messages.serverMessageId, pref),
          like(schema.messages.id, pref),
          like(schema.messages.bookingId, pref),
          like(schema.messages.senderId, pref),
          like(schema.messages.recipientId, pref),
        ),
      );

    await tx
      .delete(schema.messageThreads)
      .where(or(like(schema.messageThreads.id, pref), like(schema.messageThreads.bookingId, pref)));

    // Extra safety: remove any demo cancellation/reschedule rows if they exist.
    await tx
      .delete(schema.bookingCancellations)
      .where(
        or(
          like(schema.bookingCancellations.id, pref),
          like(schema.bookingCancellations.bookingId, pref),
          like(schema.bookingCancellations.userId, pref),
        ),
      );

    await tx
      .delete(schema.bookingReschedules)
      .where(
        or(
          like(schema.bookingReschedules.id, pref),
          like(schema.bookingReschedules.bookingId, pref),
          like(schema.bookingReschedules.requesterId, pref),
        ),
      );

    await tx
      .delete(schema.bookings)
      .where(or(like(schema.bookings.id, pref), like(schema.bookings.userId, pref), like(schema.bookings.providerId, pref)));

    await tx
      .delete(schema.services)
      .where(or(like(schema.services.id, pref), like(schema.services.providerId, pref), like(schema.services.slug, demoSlugPref)));

    await tx
      .delete(schema.providerAvailabilities)
      .where(or(like(schema.providerAvailabilities.id, pref), like(schema.providerAvailabilities.providerId, pref)));

    await tx.delete(schema.providerSuburbs).where(like(schema.providerSuburbs.providerId, pref));

    await tx
      .delete(schema.providers)
      .where(or(like(schema.providers.id, pref), like(schema.providers.userId, pref), like(schema.providers.handle, "demo%")));

    await tx.delete(schema.users).where(or(like(schema.users.id, pref), like(schema.users.email, pref)));
  });
}

async function seedDemoData(db: ReturnType<typeof makeDb>) {
  const seedString = process.env.SEED_DEMO_SEED ?? "verial-demo-v1";
  const rng = mulberry32(hash32(seedString));

  // Refuse to seed over existing demo rows.
  const existingDemoUsers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(like(schema.users.id, `${DEMO_PREFIX}%`))
    .limit(1);
  if (existingDemoUsers.length > 0) {
    throw new Error(
      "Demo rows already exist (users.id starts with demo_). Run pnpm seed:demo:wipe first, then re-run pnpm seed:demo.",
    );
  }

  const region = "Auckland";
  const suburbs = AUCKLAND_SUBURBS.slice();

  const customers = Array.from({ length: 40 }).map((_, i) => {
    const idx = i + 1;
    const first = `Demo${idx}`;
    const last = pick(rng, ["Smith", "Patel", "Nguyen", "Brown", "Wilson", "Kaur", "Lee", "Taylor"]);
    const suburb = pick(rng, suburbs as unknown as string[]);
    const city = "Auckland";

    return {
      id: demoId("user", idx),
      email: `${DEMO_PREFIX}user_${pad(idx, 4)}@verial.test`,
      username: `${DEMO_PREFIX}user_${pad(idx, 4)}`,
      usernameLower: `${DEMO_PREFIX}user_${pad(idx, 4)}`,
      firstName: first,
      lastName: last,
      phone: `+64 21 ${randInt(rng, 1000000, 9999999)}`,
      addressLine1: `${randInt(rng, 1, 200)} ${pick(rng, ["Kauri", "Rimu", "Pohutukawa", "Totara", "Kowhai"])} Street`,
      suburb,
      city,
      region,
      postcode: String(randInt(rng, 1010, 2675)),
      role: "user" as const,
      profileCompleted: true,
      acceptedTermsAt: new Date(Date.now() - randInt(rng, 10, 120) * 86400000),
      acceptedPrivacyAt: new Date(Date.now() - randInt(rng, 10, 120) * 86400000),
      confirmed18PlusAt: new Date(Date.now() - randInt(rng, 10, 120) * 86400000),
      earlyProviderAccess: false,
      createdAt: new Date(Date.now() - randInt(rng, 30, 240) * 86400000),
      updatedAt: new Date(),
    };
  });

  const providerUsers = Array.from({ length: 18 }).map((_, i) => {
    const idx = i + 1;
    const first = pick(rng, ["Aroha", "James", "Liam", "Sophie", "Mateo", "Noah", "Amelia", "Zoe", "Arjun", "Olivia"]);
    const last = pick(rng, ["Thompson", "Chen", "Williams", "Singh", "Martin", "Ngata", "Anderson", "Jones"]);
    const suburb = pick(rng, suburbs as unknown as string[]);

    return {
      id: demoId("provuser", idx),
      email: `${DEMO_PREFIX}provider_${pad(idx, 3)}@verial.test`,
      username: `${DEMO_PREFIX}provider_${pad(idx, 3)}`,
      usernameLower: `${DEMO_PREFIX}provider_${pad(idx, 3)}`,
      firstName: first,
      lastName: last,
      phone: `+64 27 ${randInt(rng, 1000000, 9999999)}`,
      addressLine1: `${randInt(rng, 1, 200)} ${pick(rng, ["Kauri", "Rimu", "Pohutukawa", "Totara", "Kowhai"])} Street`,
      suburb,
      city: "Auckland",
      region,
      postcode: String(randInt(rng, 1010, 2675)),
      role: "provider" as const,
      profileCompleted: true,
      acceptedTermsAt: new Date(Date.now() - randInt(rng, 10, 120) * 86400000),
      acceptedPrivacyAt: new Date(Date.now() - randInt(rng, 10, 120) * 86400000),
      confirmed18PlusAt: new Date(Date.now() - randInt(rng, 10, 120) * 86400000),
      earlyProviderAccess: true,
      createdAt: new Date(Date.now() - randInt(rng, 30, 240) * 86400000),
      updatedAt: new Date(),
    };
  });

  return await withBestEffortTransaction(db, async (tx) => {
    await tx.insert(schema.users).values([...customers, ...providerUsers]);

    const providers = providerUsers.map((u, i) => {
    const idx = i + 1;
    const businessName = BUSINESS_NAMES[i % BUSINESS_NAMES.length]!;
    const handle = `${DEMO_PREFIX}${normalize(businessName).replace(/-/g, "_")}_${pad(idx, 2)}`.slice(0, 100);
    const baseSuburb = u.suburb ?? pick(rng, suburbs as unknown as string[]);
    const trustScore = randInt(rng, 30, 100);

    return {
      id: demoId("prov", idx),
      userId: u.id,
      handle,
      businessName,
      bio:
        "We’re a friendly local team focused on quality, clear communication, and tidy results. Happy to answer questions and provide options.",
      status: "approved" as const,
      isVerified: true,
      trustScore,
      trustLevel: trustLevelForScore(trustScore),
      baseSuburb,
      baseRegion: region,
      serviceRadiusKm: randInt(rng, 8, 25),
      stripeConnectId: `${DEMO_PREFIX}acct_${pad(idx, 4)}`,
      chargesEnabled: true,
      payoutsEnabled: true,
      chargesGst: true,
      plan: providerPlanForIndex(i),
      stripeSubscriptionUpdatedAt: new Date(),
      kycStatus: idx % 10 === 0 ? ("pending_review" as const) : ("verified" as const),
      kycVerifiedAt: new Date(Date.now() - randInt(rng, 5, 120) * 86400000),
      createdAt: new Date(Date.now() - randInt(rng, 30, 240) * 86400000),
      updatedAt: new Date(),
    };
    });

    // Update providerId on provider users (denormalized link).
    await tx.insert(schema.providers).values(providers);

    for (const p of providers) {
      await tx.update(schema.users).set({ providerId: p.id }).where(eq(schema.users.id, p.userId));
    }

  // Provider suburbs coverage
  const providerSuburbRows: Array<typeof schema.providerSuburbs.$inferInsert> = [];
  for (const p of providers) {
    const count = randInt(rng, 8, 15);
    const picked = shuffle(rng, suburbs as unknown as string[]).slice(0, count);
    for (const s of picked) {
      providerSuburbRows.push({
        providerId: p.id,
        region,
        suburb: s,
      });
    }
  }
    for (const batch of chunk(providerSuburbRows, 250)) {
      await tx.insert(schema.providerSuburbs).values(batch);
    }

  // Provider weekly availability
  const days = schema.dayOfWeekEnum.enumValues;
  const availabilityRows: Array<typeof schema.providerAvailabilities.$inferInsert> = [];
  for (const p of providers) {
    for (const [dayIdx, day] of days.entries()) {
      const startHour = day === "saturday" || day === "sunday" ? 9 : 8;
      const endHour = day === "saturday" || day === "sunday" ? 14 : 17;
      availabilityRows.push({
        id: `${DEMO_PREFIX}pavail_${p.id}_${dayIdx}`.slice(0, 255),
        providerId: p.id,
        dayOfWeek: day,
        startTime: `${pad(startHour, 2)}:00:00`,
        endTime: `${pad(endHour, 2)}:00:00`,
        isEnabled: true,
      });
    }
  }
    for (const batch of chunk(availabilityRows, 250)) {
      await tx.insert(schema.providerAvailabilities).values(batch);
    }

  // Services per provider
  const serviceRows: Array<typeof schema.services.$inferInsert> = [];
  const providerServicesByProviderId = new Map<string, string[]>();

  let serviceIdx = 0;
  for (const p of providers) {
    const perProvider = randInt(rng, 6, 10);
    const templates = shuffle(rng, SERVICE_TEMPLATES);
    const baseSuburb = p.baseSuburb ?? pick(rng, suburbs as unknown as string[]);

    for (let j = 0; j < perProvider; j++) {
      serviceIdx++;
      const tpl = templates[j % templates.length]!;
      const title = pick(rng, tpl.titles);
      const pricing = buildPricing(rng);

      const slug = `demo-${normalize(p.handle)}-${normalize(title)}-${pad(j + 1, 2)}-${pad(serviceIdx, 4)}`.slice(0, 255);

      const id = demoId("svc", serviceIdx);
      serviceRows.push({
        id,
        providerId: p.id,
        title,
        slug,
        description: tpl.description,
        category: tpl.category,
        coverImageUrl: `https://picsum.photos/seed/${encodeURIComponent(`verial-${tpl.category}-${id}`)}/1200/800`,
        pricingType: pricing.pricingType,
        priceInCents: pricing.priceInCents ?? undefined,
        priceNote: pricing.priceNote,
        isPublished: true,
        region,
        suburb: baseSuburb,
        chargesGst: true,
        createdAt: new Date(Date.now() - randInt(rng, 10, 180) * 86400000),
        updatedAt: new Date(),
      });

      const list = providerServicesByProviderId.get(p.id) ?? [];
      list.push(id);
      providerServicesByProviderId.set(p.id, list);
    }
  }

    for (const batch of chunk(serviceRows, 200)) {
      await tx.insert(schema.services).values(batch);
    }

  // Bookings
  const customersIds = customers.map((u) => u.id);
  const providerIdToUserId = new Map<string, string>();
  for (const p of providers) providerIdToUserId.set(p.id, p.userId);

  const bookingRows: Array<typeof schema.bookings.$inferInsert> = [];
  const threadRows: Array<typeof schema.messageThreads.$inferInsert> = [];
  const messageRows: Array<typeof schema.messages.$inferInsert> = [];
  const notificationRows: Array<typeof schema.notifications.$inferInsert> = [];
  const reviewRows: Array<typeof schema.reviews.$inferInsert> = [];
  const earningRows: Array<typeof schema.providerEarnings.$inferInsert> = [];

  let msgGlobal = 0;
  const now = Date.now();

    for (let i = 1; i <= 200; i++) {
    const bookingId = demoId("bk", i, 5);

    const provider = pick(rng, providers);
    const providerUserId = providerIdToUserId.get(provider.id)!;
    const serviceId = pick(rng, providerServicesByProviderId.get(provider.id) ?? serviceRows.map((s) => s.id));

    const userId = pick(rng, customersIds);
    const status = bookingStatusForIndex(i - 1);

    const scheduledOffsetDays = randInt(rng, -45, 30);
    const scheduledDate = new Date(now + scheduledOffsetDays * 86400000 + randInt(rng, 8, 17) * 3600000);

    const isQuoteish = status === "pending" || status === "accepted" || status === "declined";
    const basePrice = randInt(rng, 70, 350);
    const priceAtBooking = cents(basePrice);

    const providerQuotedPrice = isQuoteish && rng() < 0.35 ? cents(randInt(rng, 90, 420)) : undefined;
    const providerMessage = providerQuotedPrice
      ? `I can do this for around $${Math.round(providerQuotedPrice / 100)}. Let me know if that works.`
      : rng() < 0.3
        ? "Thanks for the request — I’ll confirm details shortly."
        : undefined;

    const paymentIntentId = status === "paid" || status === "completed" || status === "completed_by_provider" || status === "disputed" || status === "refunded"
      ? `${DEMO_PREFIX}pi_${bookingId}`
      : undefined;

    const suburb = pick(rng, suburbs as unknown as string[]);

    bookingRows.push({
      id: bookingId,
      userId,
      serviceId,
      providerId: provider.id,
      status,
      scheduledDate,
      priceAtBooking: providerQuotedPrice ?? priceAtBooking,
      region,
      suburb,
      paymentIntentId,
      providerQuotedPrice,
      providerMessage,
      providerDeclineReason: status === "declined" ? pick(rng, ["Unavailable this week", "Outside service area", "Job too large"]) : undefined,
      providerCancelReason: status === "canceled_provider" ? pick(rng, ["Emergency scheduling conflict", "Vehicle issue"]) : undefined,
      createdAt: new Date(now - randInt(rng, 1, 90) * 86400000),
      updatedAt: new Date(now - randInt(rng, 0, 20) * 86400000),
    });

    const threadId = `${DEMO_PREFIX}mthread_${bookingId}`.slice(0, 255);
    threadRows.push({
      id: threadId,
      bookingId,
      lastMessageAt: new Date(now - randInt(rng, 0, 20) * 86400000),
      createdAt: new Date(now - randInt(rng, 1, 90) * 86400000),
      updatedAt: new Date(),
      unreadCount: randInt(rng, 0, 4),
    });

    const messageCount = randInt(rng, 4, 10);
    const threadStart = new Date(scheduledDate.getTime() - randInt(rng, 1, 10) * 86400000);

    for (let m = 0; m < messageCount; m++) {
      msgGlobal++;
      const fromUser = m % 2 === 0;
      const senderId = fromUser ? userId : providerUserId;
      const recipientId = fromUser ? providerUserId : userId;
      const content = fromUser ? pick(rng, MESSAGE_SNIPPETS_USER) : pick(rng, MESSAGE_SNIPPETS_PROVIDER);

      const createdAt = new Date(threadStart.getTime() + m * randInt(rng, 5, 90) * 60000);

      messageRows.push({
        serverMessageId: `${DEMO_PREFIX}srvmsg_${pad(msgGlobal, 6)}`,
        id: `${DEMO_PREFIX}msg_${pad(msgGlobal, 6)}`,
        bookingId,
        threadId,
        senderId,
        recipientId,
        content,
        isSystem: false,
        createdAt,
        deliveredAt: createdAt,
        seenAt: rng() < 0.7 ? new Date(createdAt.getTime() + randInt(rng, 1, 120) * 60000) : undefined,
        readAt: rng() < 0.55 ? new Date(createdAt.getTime() + randInt(rng, 2, 240) * 60000) : undefined,
      });

      // Lightly spam notifications
      if (rng() < 0.35) {
        const notifId = `${DEMO_PREFIX}notif_${bookingId}_${pad(m + 1, 2)}`.slice(0, 255);
        notificationRows.push({
          id: notifId,
          userId: recipientId,
          type: "message",
          title: "New message",
          body: content,
          actionUrl: `/dashboard/bookings/${bookingId}`,
          message: "New message",
          href: `/dashboard/bookings/${bookingId}`,
          bookingId,
          providerId: provider.id,
          serviceId,
          isRead: rng() < 0.6,
          readAt: rng() < 0.6 ? new Date() : undefined,
          createdAt: createdAt,
        });
      }
    }

    // Reviews for completed bookings
    if (status === "completed") {
      const rating = randInt(rng, 3, 5);
      const comment =
        rating === 5
          ? pick(rng, [
              "Great communication and a really tidy job.",
              "Super professional — would book again.",
              "Arrived on time and exceeded expectations.",
            ])
          : pick(rng, [
              "Good job overall and friendly service.",
              "Happy with the result — a couple of minor delays but resolved.",
              "Solid work and fair pricing.",
            ]);

      reviewRows.push({
        id: `${DEMO_PREFIX}rev_${bookingId}`.slice(0, 255),
        userId,
        providerId: provider.id,
        bookingId,
        serviceId,
        rating,
        comment,
        createdAt: new Date(now - randInt(rng, 1, 60) * 86400000),
        isHidden: false,
      });
    }

    // Earnings for paid/completed bookings
    const qualifiesForEarnings =
      status === "paid" || status === "completed_by_provider" || status === "completed" || status === "disputed" || status === "refunded";

    if (qualifiesForEarnings) {
      const grossAmount = providerQuotedPrice ?? priceAtBooking;
      const split = moneySplit(grossAmount);
      const earningStatus: typeof schema.earningStatusEnum.enumValues[number] =
        status === "paid" || status === "completed_by_provider" ? "held" : status === "completed" ? "transferred" : status === "refunded" ? "refunded" : "held";

      earningRows.push({
        id: `${DEMO_PREFIX}earn_${bookingId}`.slice(0, 255),
        bookingId,
        providerId: provider.id,
        serviceId,
        grossAmount,
        platformFeeAmount: split.platformFee,
        gstAmount: split.gst,
        netAmount: split.net,
        currency: "nzd",
        customerServiceFeeAmount: split.customerServiceFee,
        customerTotalChargedAmount: split.customerTotal,
        status: earningStatus,
        stripePaymentIntentId: paymentIntentId,
        paidAt: new Date(now - randInt(rng, 1, 50) * 86400000),
        createdAt: new Date(now - randInt(rng, 1, 90) * 86400000),
        updatedAt: new Date(),
      });
    }
    }

  // Insert bookings + threads + messages
    for (const batch of chunk(bookingRows, 200)) {
      await tx.insert(schema.bookings).values(batch);
    }
    for (const batch of chunk(threadRows, 200)) {
      await tx.insert(schema.messageThreads).values(batch);
    }
    for (const batch of chunk(messageRows, 500)) {
      await tx.insert(schema.messages).values(batch);
    }

  // Notifications, reviews, earnings
    for (const batch of chunk(notificationRows, 400)) {
      await tx.insert(schema.notifications).values(batch);
    }
    for (const batch of chunk(reviewRows, 200)) {
      await tx.insert(schema.reviews).values(batch);
    }
    for (const batch of chunk(earningRows, 200)) {
      await tx.insert(schema.providerEarnings).values(batch);
    }

  // Favorites (providers + services)
  const favProvidersRows: Array<typeof schema.favoriteProviders.$inferInsert> = [];
  const serviceFavRows: Array<typeof schema.serviceFavorites.$inferInsert> = [];

  const providerIds = providers.map((p) => p.id);
  const serviceIds = serviceRows.map((s) => s.id);

  let favIdx = 0;
  for (const u of customers) {
    const n = randInt(rng, 2, 6);
    const favs = shuffle(rng, providerIds).slice(0, n);
    for (const pid of favs) {
      favIdx++;
      favProvidersRows.push({
        id: demoId("favprov", favIdx, 5),
        userId: u.id,
        providerId: pid,
        createdAt: new Date(now - randInt(rng, 1, 120) * 86400000),
      });
    }

    const m = randInt(rng, 3, 10);
    const sf = shuffle(rng, serviceIds).slice(0, m);
    for (const sid of sf) {
      serviceFavRows.push({
        userId: u.id,
        serviceId: sid,
        createdAt: new Date(now - randInt(rng, 1, 120) * 86400000),
      });
    }
  }

    for (const batch of chunk(favProvidersRows, 250)) {
      await tx.insert(schema.favoriteProviders).values(batch);
    }

  // serviceFavorites has a unique(userId, serviceId) constraint; we generated unique sets per user.
    for (const batch of chunk(serviceFavRows, 400)) {
      await tx.insert(schema.serviceFavorites).values(batch);
    }

  // Waitlist
  const waitlistRows: Array<typeof schema.waitlistSignups.$inferInsert> = [];
  for (let i = 1; i <= 120; i++) {
    const role: typeof schema.waitlistRoleEnum.enumValues[number] = i % 3 === 0 ? "provider" : "customer";
    const suburb = pick(rng, suburbs as unknown as string[]);
    const suburbCity = `${suburb}, Auckland`;
    const category = pick(rng, schema.serviceCategoryEnum.enumValues);
    const email = `${DEMO_PREFIX}waitlist_${pad(i, 4)}@verial.test`;
    const emailLower = email.toLowerCase();

    // Deterministic referral code that is unique per i.
    const referralCode = `demo${hash32(`${seedString}:${i}`)
      .toString(36)
      .slice(0, 10)}`.padEnd(10, "0");

    waitlistRows.push({
      id: demoId("wl", i, 5),
      role,
      email,
      emailLower,
      suburbCity,
      suburbCityNorm: normalize(suburbCity),
      categoryText: category.replace(/_/g, " "),
      categoryNorm: normalize(category),
      yearsExperience: role === "provider" ? randInt(rng, 1, 20) : undefined,
      referralCode,
      tags: role === "provider" ? ["demo", "provider"] : ["demo", "customer"],
      createdAt: new Date(now - randInt(rng, 1, 180) * 86400000),
    });
  }

    for (const batch of chunk(waitlistRows, 250)) {
      await tx.insert(schema.waitlistSignups).values(batch);
    }

  // Table counts
    const counts = {
      users: await countRows(tx, schema.users),
      providers: await countRows(tx, schema.providers),
      services: await countRows(tx, schema.services),
      bookings: await countRows(tx, schema.bookings),
      message_threads: await countRows(tx, schema.messageThreads),
      messages: await countRows(tx, schema.messages),
      notifications: await countRows(tx, schema.notifications),
      reviews: await countRows(tx, schema.reviews),
      provider_earnings: await countRows(tx, schema.providerEarnings),
      waitlist_signups: await countRows(tx, schema.waitlistSignups),
    };

    return counts;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertSafeToRun();

  const databaseUrl = requireEnv("DATABASE_URL");
  console.log(`[seed-demo] Target DB: ${redactDatabaseUrl(databaseUrl)}`);

  const db = makeDb();

  // Fail fast if the DB is behind migrations.
  await assertDbSchemaCompatible(db);

  if (args.wipe) {
    await wipeDemoData(db);
    console.log("Demo wipe complete.");
    console.log("Run `pnpm seed:demo` to re-seed demo rows.");
    return;
  }

  const counts = await seedDemoData(db);

  console.log("\nCounts:");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`- ${k}: ${v}`);
  }
  console.log("\nDemo seed complete. Use seed:demo:wipe to remove demo rows.");
}

main().catch((err) => {
  console.error("\n[seed-demo] ERROR");
  console.error(err);
  process.exit(1);
});
