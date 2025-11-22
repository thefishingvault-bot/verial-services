import { relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, pgEnum, integer, time } from "drizzle-orm/pg-core";

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

  // Service area
  baseSuburb: varchar("base_suburb", { length: 255 }),
  baseRegion: varchar("base_region", { length: 255 }),
  serviceRadiusKm: integer("service_radius_km").default(10).notNull(),

  // Stripe Connect
  stripeConnectId: varchar("stripe_connect_id", { length: 255 }).unique(),
  chargesEnabled: boolean("charges_enabled").default(false).notNull(),
  payoutsEnabled: boolean("payouts_enabled").default(false).notNull(),
  chargesGst: boolean("charges_gst").default(true).notNull(), // Default to inclusive

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
  chargesGst: boolean("charges_gst").default(true).notNull(),

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


/**
 * Reviews Table
 * Stores reviews left by customers for completed bookings.
 */
export const reviews = pgTable("reviews", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., rev_...
  userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }), // The customer who wrote it
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "cascade" }), // The provider being reviewed
  bookingId: varchar("booking_id", { length: 255 }).notNull().references(() => bookings.id, { onDelete: "cascade" }).unique(), // A booking can only have one review

  rating: integer("rating").notNull(), // Rating from 1 to 5
  comment: text("comment"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Notifications Table
 * Stores in-app notifications for users.
 */
export const notifications = pgTable("notifications", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., notif_...
  userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }), // The user who receives it
  message: text("message").notNull(),
  href: text("href").notNull(), // The link to go to (e.g., /dashboard/bookings/provider)
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- NEW ENUMS ---
export const dayOfWeekEnum = pgEnum("day_of_week", [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

// --- NEW TABLES ---

/**
 * Provider Availabilities
 * Stores the recurring weekly working hours for a provider.
 */
export const providerAvailabilities = pgTable("provider_availabilities", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., pavail_...
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "cascade" }),

  dayOfWeek: dayOfWeekEnum("day_of_week").notNull(), // e.g., 'monday'
  startTime: time("start_time").notNull(), // e.g., '09:00:00'
  endTime: time("end_time").notNull(), // e.g., '17:00:00'
  isEnabled: boolean("is_enabled").default(true).notNull(),
});

/**
 * Provider Time Offs
 * Stores specific date/time ranges when a provider is unavailable.
 */
export const providerTimeOffs = pgTable("provider_time_offs", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., ptoff_...
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "cascade" }),

  reason: text("reason"), // e.g., "Holiday", "Doctor's Appointment"
  startTime: timestamp("start_time", { withTimezone: true }).notNull(), // Full start timestamp
  endTime: timestamp("end_time", { withTimezone: true }).notNull(), // Full end timestamp
});

/**
 * Conversations Table
 * Links two users (customer and provider) in a chat thread.
 */
export const conversations = pgTable("conversations", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., conv_...
  user1Id: varchar("user1_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  user2Id: varchar("user2_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Messages Table
 * Individual messages within a conversation.
 */
export const messages = pgTable("messages", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., msg_...
  conversationId: varchar("conversation_id", { length: 255 }).notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});



// --- RELATIONS ---
// Define the relationships for our ORM

export const usersRelations = relations(users, ({ one, many }) => ({
  provider: one(providers, {
    fields: [users.providerId],
    references: [providers.id],
  }),
  bookings: many(bookings),
  reviews: many(reviews), // A user can write many reviews
  notifications: many(notifications), // A user can have many notifications
}));

export const providersRelations = relations(providers, ({ one, many }) => ({
  user: one(users, {
    fields: [providers.userId],
    references: [users.id],
  }),
  services: many(services),
  bookings: many(bookings),
  reviews: many(reviews), // A provider can have many reviews
  availabilities: many(providerAvailabilities),
  timeOffs: many(providerTimeOffs),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  provider: one(providers, {
    fields: [services.providerId],
    references: [providers.id],
  }),
  bookings: many(bookings),
}));

export const providerAvailabilitiesRelations = relations(providerAvailabilities, ({ one }) => ({
  provider: one(providers, {
    fields: [providerAvailabilities.providerId],
    references: [providers.id],
  }),
}));

export const providerTimeOffsRelations = relations(providerTimeOffs, ({ one }) => ({
  provider: one(providers, {
    fields: [providerTimeOffs.providerId],
    references: [providers.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user1: one(users, {
    fields: [conversations.user1Id],
    references: [users.id],
    relationName: "user1",
  }),
  user2: one(users, {
    fields: [conversations.user2Id],
    references: [users.id],
    relationName: "user2",
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
  provider: one(providers, {
    fields: [reviews.providerId],
    references: [providers.id],
  }),
  booking: one(bookings, {
    fields: [reviews.bookingId],
    references: [bookings.id],
  }),
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
  review: one(reviews), // A booking can have one review
}));

