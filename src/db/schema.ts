import { relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, pgEnum, integer, time } from "drizzle-orm/pg-core";

// --- ENUMS ---
export const userRoleEnum = pgEnum("user_role", ["user", "provider", "admin"]);
export const providerStatusEnum = pgEnum("provider_status", ["pending", "approved", "rejected"]);
export const trustLevelEnum = pgEnum("trust_level", ["bronze", "silver", "gold", "platinum"]);
export const kycStatusEnum = pgEnum("kyc_status", [
  "not_started",
  "in_progress",
  "pending_review",
  "verified",
  "rejected"
]);

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

  // KYC / Identity
  kycStatus: kycStatusEnum("kyc_status").default("not_started").notNull(),
  identityDocumentUrl: text("identity_document_url"),
  businessDocumentUrl: text("business_document_url"),
  kycSubmittedAt: timestamp("kyc_submitted_at"),
  kycVerifiedAt: timestamp("kyc_verified_at"),
  // Suspension / Limited Mode
  isSuspended: boolean("is_suspended").default(false).notNull(),
  suspensionReason: text("suspension_reason"),
  suspensionStartDate: timestamp("suspension_start_date"),
  suspensionEndDate: timestamp("suspension_end_date"),

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

export const providerChangeStatusEnum = pgEnum("provider_change_status", [
  "pending",
  "approved",
  "rejected",
  "flagged"
]);

export const providerChangeFieldEnum = pgEnum("provider_change_field", [
  "bio",
  "businessName",
  "baseSuburb",
  "baseRegion",
  "serviceRadiusKm"
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
 * Favorite Providers
 * Many-to-many between users (customers) and providers.
 */
export const favoriteProviders = pgTable("favorite_providers", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., fav_...
  userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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

/**
 * Provider Changes Table
 * Tracks pending changes to provider profiles for admin review.
 */
export const providerChanges = pgTable("provider_changes", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., pchg_...
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "cascade" }),
  fieldName: providerChangeFieldEnum("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value").notNull(),
  status: providerChangeStatusEnum("status").default("pending").notNull(),
  requestedBy: varchar("requested_by", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  reviewedBy: varchar("reviewed_by", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Provider Suspension Audit Log
 * Tracks suspension and unsuspension actions for audit purposes.
 */
export const providerSuspensions = pgTable("provider_suspensions", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., psusp_...
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 50 }).notNull(), // 'suspend' or 'unsuspend'
  reason: text("reason"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  performedBy: varchar("performed_by", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Trust Incidents Log
 * Records incidents that affect provider trust scores (complaints, violations, etc.)
 */
export const trustIncidents = pgTable("trust_incidents", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., tincident_...
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "cascade" }),
  incidentType: varchar("incident_type", { length: 100 }).notNull(), // 'complaint', 'violation', 'review_abuse', etc.
  severity: varchar("severity", { length: 20 }).notNull(), // 'low', 'medium', 'high', 'critical'
  description: text("description").notNull(),
  reportedBy: varchar("reported_by", { length: 255 }).references(() => users.id, { onDelete: "set null" }), // nullable for system reports
  bookingId: varchar("booking_id", { length: 255 }).references(() => bookings.id, { onDelete: "set null" }), // optional link to booking
  trustScoreImpact: integer("trust_score_impact").default(0).notNull(), // points to deduct/add
  resolved: boolean("resolved").default(false).notNull(),
  resolvedBy: varchar("resolved_by", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Risk Rules Configuration
 * Configurable rules that determine how incidents affect trust scores and trigger actions
 */
export const riskRules = pgTable("risk_rules", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., rrule_...
  name: varchar("name", { length: 255 }).notNull(),
  incidentType: varchar("incident_type", { length: 100 }).notNull(),
  severity: varchar("severity", { length: 20 }).notNull(),
  trustScorePenalty: integer("trust_score_penalty").default(0).notNull(),
  autoSuspend: boolean("auto_suspend").default(false).notNull(),
  suspendDurationDays: integer("suspend_duration_days"), // null for indefinite
  enabled: boolean("enabled").default(true).notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Provider Notes Table
 * Internal admin notes for providers (non-customer-facing)
 */
export const providerNotes = pgTable("provider_notes", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., pnote_...
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  isInternal: boolean("is_internal").default(true).notNull(), // Always true for admin notes
  createdBy: varchar("created_by", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }), // Admin who created the note
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Refunds Table
 * Tracks refund transactions processed by admins
 */
export const refunds = pgTable("refunds", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., refund_...
  bookingId: varchar("booking_id", { length: 255 }).notNull().references(() => bookings.id, { onDelete: "cascade" }),
  stripeRefundId: varchar("stripe_refund_id", { length: 255 }).unique(), // Stripe refund ID
  amount: integer("amount").notNull(), // Amount refunded in cents
  reason: varchar("reason", { length: 100 }).notNull(), // 'customer_request', 'service_issue', 'dispute_resolution', 'admin_adjustment', etc.
  description: text("description"), // Optional detailed description
  platformFeeRefunded: integer("platform_fee_refunded").default(0).notNull(), // Platform fee portion refunded
  providerAmountRefunded: integer("provider_amount_refunded").default(0).notNull(), // Provider portion refunded
  status: varchar("status", { length: 20 }).default("pending").notNull(), // 'pending', 'processing', 'completed', 'failed'
  processedBy: varchar("processed_by", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }), // Admin who processed the refund
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Booking Disputes
 * Records disputes between customers and providers about completed bookings
 */
export const disputes = pgTable("disputes", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., dispute_...
  bookingId: varchar("booking_id", { length: 255 }).notNull().references(() => bookings.id, { onDelete: "cascade" }),
  initiatorId: varchar("initiator_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }), // who filed the dispute
  initiatorType: varchar("initiator_type", { length: 20 }).notNull(), // 'customer' or 'provider'
  reason: varchar("reason", { length: 100 }).notNull(), // 'service_not_provided', 'poor_quality', 'late_cancellation', etc.
  description: text("description").notNull(),
  evidenceUrls: text("evidence_urls").array(), // array of file URLs
  amountDisputed: integer("amount_disputed"), // amount in cents the initiator wants refunded
  status: varchar("status", { length: 20 }).default("open").notNull(), // 'open', 'under_review', 'resolved', 'closed'
  adminDecision: varchar("admin_decision", { length: 50 }), // 'refund_customer', 'no_refund', 'partial_refund', 'service_redo'
  adminNotes: text("admin_notes"),
  refundAmount: integer("refund_amount"), // actual amount refunded in cents
  resolvedBy: varchar("resolved_by", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Provider Communications Table
 * Tracks all communications sent to providers (emails, notifications, SMS)
 */
export const providerCommunications = pgTable("provider_communications", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., pcomm_...
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(), // 'email', 'notification', 'sms'
  subject: varchar("subject", { length: 255 }).notNull(),
  message: text("message").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  status: varchar("status", { length: 20 }).default("sent").notNull(), // 'sent', 'delivered', 'failed', 'read'
  sentBy: varchar("sent_by", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  error: text("error"), // Error message if sending failed
  response: text("response"), // Provider response if any
  responseAt: timestamp("response_at"),
});

/**
 * Message Templates Table
 * Pre-defined templates for common communication scenarios
 */
export const messageTemplates = pgTable("message_templates", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., mtmpl_...
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  category: varchar("category", { length: 50 }).notNull(), // 'general', 'risk', 'compliance', 'promotion', 'support'
  variables: text("variables").array(), // Array of variable names like ['provider_name', 'risk_level']
  createdBy: varchar("created_by", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Scheduled Communications Table
 * Communications scheduled to be sent at a future date
 */
export const scheduledCommunications = pgTable("scheduled_communications", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., scomm_...
  subject: varchar("subject", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 20 }).notNull(), // 'email', 'notification', 'sms'
  providerIds: text("provider_ids").array().notNull(), // Array of provider IDs
  scheduledFor: timestamp("scheduled_for").notNull(),
  templateId: varchar("template_id", { length: 255 }).references(() => messageTemplates.id, { onDelete: "set null" }),
  createdBy: varchar("created_by", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  sentAt: timestamp("sent_at"),
  status: varchar("status", { length: 20 }).default("scheduled").notNull(), // 'scheduled', 'sent', 'failed'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
// Define the relationships for our ORM

export const usersRelations = relations(users, ({ one, many }) => ({
  provider: one(providers, {
    fields: [users.providerId],
    references: [providers.id],
  }),
  bookings: many(bookings),
  reviews: many(reviews), // A user can write many reviews
  notifications: many(notifications), // A user can have many notifications
  favoriteProviders: many(favoriteProviders),
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
  favoriteProviders: many(favoriteProviders),
  notes: many(providerNotes), // A provider can have many internal notes
}));

export const favoriteProvidersRelations = relations(favoriteProviders, ({ one }) => ({
  user: one(users, {
    fields: [favoriteProviders.userId],
    references: [users.id],
  }),
  provider: one(providers, {
    fields: [favoriteProviders.providerId],
    references: [providers.id],
  }),
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

export const providerChangesRelations = relations(providerChanges, ({ one }) => ({
  provider: one(providers, {
    fields: [providerChanges.providerId],
    references: [providers.id],
  }),
  requester: one(users, {
    fields: [providerChanges.requestedBy],
    references: [users.id],
    relationName: "requester",
  }),
  reviewer: one(users, {
    fields: [providerChanges.reviewedBy],
    references: [users.id],
    relationName: "reviewer",
  }),
}));

export const providerSuspensionsRelations = relations(providerSuspensions, ({ one }) => ({
  provider: one(providers, {
    fields: [providerSuspensions.providerId],
    references: [providers.id],
  }),
  performer: one(users, {
    fields: [providerSuspensions.performedBy],
    references: [users.id],
  }),
}));

export const providerNotesRelations = relations(providerNotes, ({ one }) => ({
  provider: one(providers, {
    fields: [providerNotes.providerId],
    references: [providers.id],
  }),
  author: one(users, {
    fields: [providerNotes.createdBy],
    references: [users.id],
  }),
}));

export const trustIncidentsRelations = relations(trustIncidents, ({ one }) => ({
  provider: one(providers, {
    fields: [trustIncidents.providerId],
    references: [providers.id],
  }),
  reporter: one(users, {
    fields: [trustIncidents.reportedBy],
    references: [users.id],
    relationName: "reporter",
  }),
  resolver: one(users, {
    fields: [trustIncidents.resolvedBy],
    references: [users.id],
    relationName: "resolver",
  }),
  booking: one(bookings, {
    fields: [trustIncidents.bookingId],
    references: [bookings.id],
  }),
}));

export const riskRulesRelations = relations(riskRules, ({ one }) => ({
  creator: one(users, {
    fields: [riskRules.createdBy],
    references: [users.id],
  }),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  booking: one(bookings, {
    fields: [refunds.bookingId],
    references: [bookings.id],
  }),
  processor: one(users, {
    fields: [refunds.processedBy],
    references: [users.id],
  }),
}));

export const providerCommunicationsRelations = relations(providerCommunications, ({ one }) => ({
  provider: one(providers, {
    fields: [providerCommunications.providerId],
    references: [providers.id],
  }),
  sender: one(users, {
    fields: [providerCommunications.sentBy],
    references: [users.id],
  }),
}));

export const messageTemplatesRelations = relations(messageTemplates, ({ one, many }) => ({
  creator: one(users, {
    fields: [messageTemplates.createdBy],
    references: [users.id],
  }),
  scheduledCommunications: many(scheduledCommunications),
}));

export const scheduledCommunicationsRelations = relations(scheduledCommunications, ({ one }) => ({
  template: one(messageTemplates, {
    fields: [scheduledCommunications.templateId],
    references: [messageTemplates.id],
  }),
  creator: one(users, {
    fields: [scheduledCommunications.createdBy],
    references: [users.id],
  }),
}));

export const disputesRelations = relations(disputes, ({ one }) => ({
  // booking: one(bookings, {
  //   fields: [disputes.bookingId],
  //   references: [bookings.id],
  // }),
  initiator: one(users, {
    fields: [disputes.initiatorId],
    references: [users.id],
  }),
  resolver: one(users, {
    fields: [disputes.resolvedBy],
    references: [users.id],
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

