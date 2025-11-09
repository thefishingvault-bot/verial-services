import { relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, pgEnum, integer } from "drizzle-orm/pg-core";

// --- ENUMS ---
export const userRoleEnum = pgEnum("user_role", ["user", "provider", "admin"]);
export const providerStatusEnum = pgEnum("provider_status", ["pending", "approved", "rejected"]);
export const trustLevelEnum = pgEnum("trust_level", ["bronze", "silver", "gold", "platinum"]);

// --- TABLES ---

/**
 * Users Table
 * Mirrors Clerk users but stores our application-specific data.
 * Clerk ID is the source of truth.
 */
export const users = pgTable("users", {
  id: varchar("id", { length: 255 }).primaryKey(), // Clerk User ID
  email: varchar("email", { length: 255 }).notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  // Foreign key to Provider table (if they are one)
  providerId: varchar("provider_id", { length: 255 }).unique(),
});

/**
 * Providers Table
 * Stores all provider-specific data, linked to a User.
 * This is the core of our marketplace.
 */
export const providers = pgTable("providers", {
  id: varchar("id", { length: 255 }).primaryKey(), // Our own unique ID (e.g., prov_...)
  userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  handle: varchar("handle", { length: 100 }).notNull().unique(), // @provider-handle
  businessName: varchar("business_name", { length: 255 }).notNull(),
  bio: text("bio"),

  // Verification & Trust
  status: providerStatusEnum("status").default("pending").notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  trustLevel: trustLevelEnum("trust_level").default("bronze").notNull(),
  trustScore: integer("trust_score").default(0).notNull(),

  // Stripe Connect
  stripeConnectId: varchar("stripe_connect_id", { length: 255 }).unique(),
  chargesEnabled: boolean("charges_enabled").default(false).notNull(),
  payoutsEnabled: boolean("payouts_enabled").default(false).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --- NEW ENUMS ---
export const serviceCategoryEnum = pgEnum("service_category", [
  "cleaning",
  "plumbing",
  "gardening",
  "it_support",
  "accounting",
  "detailing",
  "other"
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",    // Customer has requested
  "confirmed",  // Provider has accepted
  "paid",       // Customer has paid (via Stripe)
  "completed",  // Provider has marked complete
  "canceled"    // Canceled by user or provider
]);

// --- NEW TABLES ---

/**
 * Services Table
 * The listings that providers create.
 */
export const services = pgTable("services", {
  id: varchar("id", { length: 255 }).primaryKey(), // Our own unique ID (e.g., svc_...)
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "cascade" }),

  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(), // e.g., awesome-plumbing-service
  description: text("description"),
  priceInCents: integer("price_in_cents").notNull(), // Store all currency as integers
  category: serviceCategoryEnum("category").default("other").notNull(),
  coverImageUrl: text("cover_image_url"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Bookings Table
 * Represents a transaction between a user and a provider for a service.
 */
export const bookings = pgTable("bookings", {
  id: varchar("id", { length: 255 }).primaryKey(), // Our own unique ID (e.g., bk_...)
  userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "set null" }), // Customer
  serviceId: varchar("service_id", { length: 255 }).notNull().references(() => services.id, { onDelete: "set null" }),
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "set null" }), // Denormalized for easy queries

  status: bookingStatusEnum("status").default("pending").notNull(),
  scheduledDate: timestamp("scheduled_date"),
  priceAtBooking: integer("price_at_booking").notNull(), // Price (in cents) at the time of booking

  // Stripe Payment Intent ID
  paymentIntentId: varchar("payment_intent_id", { length: 255 }).unique(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});


// --- RELATIONS ---
// Define the relationships for our ORM

export const usersRelations = relations(users, ({ one, many }) => ({
  provider: one(providers, {
    fields: [users.providerId],
    references: [providers.id],
  }),
  bookings: many(bookings),
}));

export const providersRelations = relations(providers, ({ one, many }) => ({
  user: one(users, {
    fields: [providers.userId],
    references: [users.id],
  }),
  services: many(services),
  bookings: many(bookings),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  provider: one(providers, {
    fields: [services.providerId],
    references: [providers.id],
  }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  user: one(users, {
    fields: [bookings.userId],
    references: [users.id],
  }),
  service: one(services, {
    fields: [bookings.serviceId],
    references: [services.id],
  }),
  provider: one(providers, {
    fields: [bookings.providerId],
    references: [providers.id],
  }),
}));

