import { relations } from "drizzle-orm";
import {
  AnyPgColumn,
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  pgEnum,
  integer,
  time,
  serial,
  index,
  uniqueIndex,
  jsonb,
  primaryKey,
  uuid,
} from "drizzle-orm/pg-core";

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

export const providerPlanEnum = pgEnum("provider_plan", ["starter", "pro", "elite", "unknown"]);

// Waitlist
export const waitlistRoleEnum = pgEnum("waitlist_role", ["provider", "customer"]);

// Provider early-access invites
export const providerInviteStatusEnum = pgEnum("provider_invite_status", ["pending", "redeemed", "revoked"]);

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
  providerId: varchar("provider_id", { length: 255 }),
  earlyProviderAccess: boolean("early_provider_access").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Provider Invites
 * Admin-issued early-access invites for providers.
 */
export const providerInvites = pgTable(
  "provider_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    emailLower: varchar("email_lower", { length: 255 }).notNull(),

    token: varchar("token", { length: 255 }).notNull(),
    status: providerInviteStatusEnum("status").default("pending").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdByUserId: varchar("created_by_user_id", { length: 255 }).notNull(),

    redeemedAt: timestamp("redeemed_at"),
    redeemedByUserId: varchar("redeemed_by_user_id", { length: 255 }),

    inviteEmailSentAt: timestamp("invite_email_sent_at"),
    inviteEmailTo: varchar("invite_email_to", { length: 255 }),
    inviteEmailResendId: varchar("invite_email_resend_id", { length: 255 }),
    inviteEmailError: text("invite_email_error"),

    notes: text("notes"),
  },
  (table) => ({
    tokenUnique: uniqueIndex("provider_invites_token_unique").on(table.token),
    emailLowerIdx: index("provider_invites_email_lower_idx").on(table.emailLower),
    statusIdx: index("provider_invites_status_idx").on(table.status),
    createdAtIdx: index("provider_invites_created_at_idx").on(table.createdAt),
  }),
);

/**
 * Waitlist Signups
 * Public waitlist capture for launch.
 */
export const waitlistSignups = pgTable(
  "waitlist_signups",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    createdAt: timestamp("created_at").defaultNow().notNull(),

    role: waitlistRoleEnum("role").notNull(),

    email: varchar("email", { length: 255 }).notNull(),
    emailLower: varchar("email_lower", { length: 255 }).notNull(),

    suburbCity: varchar("suburb_city", { length: 255 }).notNull(),
    suburbCityNorm: varchar("suburb_city_norm", { length: 255 }).notNull(),

    categoryText: varchar("category_text", { length: 255 }),
    categoryNorm: varchar("category_norm", { length: 255 }),
    yearsExperience: integer("years_experience"),

    referralCode: varchar("referral_code", { length: 32 }).notNull(),
    referredById: varchar("referred_by_id", { length: 255 }).references((): AnyPgColumn => waitlistSignups.id, { onDelete: "set null" }),

    tags: jsonb("tags").$type<string[]>().notNull().default([]),

    lastConfirmationEmailSentAt: timestamp("last_confirmation_email_sent_at"),
  },
  (table) => ({
    emailLowerUnique: uniqueIndex("waitlist_signups_email_lower_unique").on(table.emailLower),
    referralCodeUnique: uniqueIndex("waitlist_signups_referral_code_unique").on(table.referralCode),
    emailLowerIdx: index("waitlist_signups_email_lower_idx").on(table.emailLower),
    referralCodeIdx: index("waitlist_signups_referral_code_idx").on(table.referralCode),
    referredByIdx: index("waitlist_signups_referred_by_id_idx").on(table.referredById),
    roleIdx: index("waitlist_signups_role_idx").on(table.role),
    createdAtIdx: index("waitlist_signups_created_at_idx").on(table.createdAt),
    categoryNormIdx: index("waitlist_signups_category_norm_idx").on(table.categoryNorm),
    suburbCityNormIdx: index("waitlist_signups_suburb_city_norm_idx").on(table.suburbCityNorm),
  }),
);

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
  gstNumber: varchar("gst_number", { length: 50 }),

  // Provider subscriptions (Stripe Billing)
  plan: providerPlanEnum("plan").default("starter").notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).unique(),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }).unique(),
  stripeSubscriptionStatus: varchar("stripe_subscription_status", { length: 50 }),
  stripeSubscriptionPriceId: varchar("stripe_subscription_price_id", { length: 255 }),
  stripeCurrentPeriodEnd: timestamp("stripe_current_period_end"),
  stripeCancelAtPeriodEnd: boolean("stripe_cancel_at_period_end").default(false).notNull(),
  stripeSubscriptionUpdatedAt: timestamp("stripe_subscription_updated_at").defaultNow().notNull(),

  // KYC / Identity
  kycStatus: kycStatusEnum("kyc_status").default("not_started").notNull(),
  identityDocumentUrl: text("identity_document_url"),
  businessDocumentUrl: text("business_document_url"),
  sumsubApplicantId: varchar("sumsub_applicant_id", { length: 255 }),
  sumsubInspectionId: varchar("sumsub_inspection_id", { length: 255 }),
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

// Provider suburbs / coverage areas (explicit whitelist)
export const providerSuburbs = pgTable("provider_suburbs", {
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "cascade" }),
  region: varchar("region", { length: 100 }).notNull(),
  suburb: varchar("suburb", { length: 100 }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.providerId, table.suburb] }),
  regionIdx: index("provider_suburbs_region_idx").on(table.region),
}));

// Booking Cancellations
export const bookingCancellations = pgTable("booking_cancellations", {
  id: varchar("id", { length: 255 }).primaryKey(),
  bookingId: varchar("booking_id", { length: 255 }).notNull().references(() => bookings.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  actor: varchar("actor", { length: 20 }).notNull(), // 'customer' | 'provider'
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Booking Reschedules
export const bookingReschedules = pgTable("booking_reschedules", {
  id: varchar("id", { length: 255 }).primaryKey(),
  bookingId: varchar("booking_id", { length: 255 }).notNull().references(() => bookings.id, { onDelete: "cascade" }),
  requesterId: varchar("requester_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  proposedDate: timestamp("proposed_date").notNull(),
  responderId: varchar("responder_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending | approved | declined
  providerNote: text("provider_note"),
  customerNote: text("customer_note"),
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

export const servicePricingTypeEnum = pgEnum("service_pricing_type", [
  "fixed",
  "from",
  "quote",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",             // Customer has requested
  "accepted",            // Provider has accepted
  "declined",            // Provider has declined
  "paid",                // Customer has paid (via Stripe)
  "completed_by_provider",// Provider marked complete; waiting on customer confirmation
  "completed",           // Customer confirmed completion
  "canceled_customer",   // Customer canceled
  "canceled_provider",   // Provider canceled
  "disputed",            // Customer disputed after payment
  "refunded"             // Platform processed refund
]);

export const earningStatusEnum = pgEnum("earning_status", [
  "pending",           // Booking not yet paid
  "held",              // Paid to platform; funds held until completion confirmation
  "transferred",       // Transfer created to provider connected account
  "awaiting_payout",   // Legacy: paid and waiting for payout
  "paid_out",          // Included in a payout
  "refunded"           // Refunded after payout
]);

export const payoutStatusEnum = pgEnum("payout_status", [
  "pending",       // Created but not yet in transit
  "in_transit",    // Stripe processing / on the way
  "paid",          // Paid to bank
  "canceled",      // Canceled in Stripe
  "failed"         // Failed payout
]);

export const providerPayoutRequestStatusEnum = pgEnum("provider_payout_request_status", [
  "queued",
  "processed",
  "failed",
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
  pricingType: servicePricingTypeEnum("pricing_type").default("fixed").notNull(),
  priceInCents: integer("price_in_cents"), // Store all currency as integers (nullable for quote)
  priceNote: text("price_note"),
  category: serviceCategoryEnum("category").default("other").notNull(),
  coverImageUrl: text("cover_image_url"),
  chargesGst: boolean("charges_gst").default(true).notNull(),
  // Controls whether the service is visible in public search and by-slug pages
  isPublished: boolean("is_published").default(false).notNull(),
  region: varchar("region", { length: 255 }),
  suburb: varchar("suburb", { length: 255 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const serviceFavorites = pgTable(
  "service_favorites",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    serviceId: varchar("service_id", { length: 255 }).notNull().references(() => services.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: false }).defaultNow().notNull(),
  },
  (table) => ({
    userServiceUnique: uniqueIndex("service_favorites_user_service_unique").on(table.userId, table.serviceId),
    userIdx: index("service_favorites_user_idx").on(table.userId),
    serviceIdx: index("service_favorites_service_idx").on(table.serviceId),
  }),
);

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
  region: varchar("region", { length: 255 }),
  suburb: varchar("suburb", { length: 255 }),

  // Stripe Payment Intent ID
  paymentIntentId: varchar("payment_intent_id", { length: 255 }).unique(),

  // Provider-provided reasons for certain status transitions
  providerDeclineReason: text("provider_decline_reason"),
  providerCancelReason: text("provider_cancel_reason"),

  // Customer-visible notes from provider (e.g., after accepting a quote)
  providerMessage: text("provider_message"),
  // Stores provider-quoted price for quote-based bookings (in cents)
  providerQuotedPrice: integer("provider_quoted_price"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Provider Earnings
 * One row per paid booking capturing gross, fees, GST, and net to provider.
 */
/**
 * Provider Payouts
 * Mirrors Stripe payouts for reconciliation.
 */
export const providerPayouts = pgTable("provider_payouts", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., ppayout_...
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "cascade" }),
  stripeAccountId: varchar("stripe_account_id", { length: 255 }).notNull(),
  stripePayoutId: varchar("stripe_payout_id", { length: 255 }).unique(),

  amount: integer("amount").notNull(), // cents
  currency: varchar("currency", { length: 10 }).default("nzd").notNull(),
  status: payoutStatusEnum("status").default("pending").notNull(),
  arrivalDate: timestamp("arrival_date"),
  estimatedArrival: timestamp("estimated_arrival"),

  stripeCreatedAt: timestamp("stripe_created_at"),
  raw: jsonb("raw"),

  failureCode: varchar("failure_code", { length: 255 }),
  failureMessage: text("failure_message"),
  balanceTransactionId: varchar("balance_transaction_id", { length: 255 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
},
  (table) => ({
    providerIdx: index("provider_payouts_provider_idx").on(table.providerId),
    stripeAccountPayoutUnique: uniqueIndex("provider_payouts_stripe_account_payout_unique").on(
      table.stripeAccountId,
      table.stripePayoutId,
    ),
  }),
);

/**
 * Provider Payout Requests
 * Records a provider-initiated request to pay out pending earnings.
 * (Does not necessarily imply a Stripe payout was created.)
 */
export const providerPayoutRequests = pgTable(
  "provider_payout_requests",
  {
    id: varchar("id", { length: 255 }).primaryKey(), // e.g., preq_...
    providerId: varchar("provider_id", { length: 255 })
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),

    amount: integer("amount").notNull(), // cents
    currency: varchar("currency", { length: 10 }).default("nzd").notNull(),
    status: providerPayoutRequestStatusEnum("status").default("queued").notNull(),

    // App-level idempotency key supplied by client.
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),

    // Captures whether payouts were disabled when the request was created.
    payoutsDisabled: boolean("payouts_disabled").default(false).notNull(),
    note: text("note"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    providerIdx: index("provider_payout_requests_provider_idx").on(table.providerId),
    providerIdempotencyUnique: uniqueIndex("provider_payout_requests_provider_idempotency_unique").on(
      table.providerId,
      table.idempotencyKey,
    ),
  }),
);

/**
 * Provider Earnings
 * One row per paid booking capturing gross, fees, GST, and net to provider.
 */
export const providerEarnings = pgTable("provider_earnings", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., earn_...
  bookingId: varchar("booking_id", { length: 255 }).notNull().references(() => bookings.id, { onDelete: "cascade" }).unique(),
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id", { length: 255 }).references(() => services.id, { onDelete: "set null" }),

  grossAmount: integer("gross_amount").notNull(), // booking base amount in cents (excludes customer service fee)
  platformFeeAmount: integer("platform_fee_amount").notNull(), // platform fee in cents
  gstAmount: integer("gst_amount").default(0).notNull(), // GST component retained/remitted
  netAmount: integer("net_amount").notNull(), // net to provider in cents
  currency: varchar("currency", { length: 10 }).default("nzd").notNull(),

  // Customer-facing fee charged on top of the booking amount (retained by the platform).
  customerServiceFeeAmount: integer("customer_service_fee_amount").default(0).notNull(),
  // Total amount charged to the customer in cents (booking + service fee). Nullable for legacy rows.
  customerTotalChargedAmount: integer("customer_total_charged_amount"),

  status: earningStatusEnum("status").default("pending").notNull(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  stripeBalanceTransactionId: varchar("stripe_balance_transaction_id", { length: 255 }),
  stripeChargeId: varchar("stripe_charge_id", { length: 255 }),
  stripeFeeAmount: integer("stripe_fee_amount"),
  stripeNetAmount: integer("stripe_net_amount"),
  stripeAmount: integer("stripe_amount"),
  stripeTransferId: varchar("stripe_transfer_id", { length: 255 }),
  payoutId: varchar("payout_id", { length: 255 }).references(() => providerPayouts.id, { onDelete: "set null" }),

  transferredAt: timestamp("transferred_at"),

  paidAt: timestamp("paid_at"), // when booking was paid
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Financial Audit Logs
 * Records inconsistencies detected by the financial consistency engine.
 */
export const financialAuditLogs = pgTable("financial_audit_logs", {
  id: serial("id").primaryKey(),
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "cascade" }),
  bookingId: varchar("booking_id", { length: 255 }).references(() => bookings.id, { onDelete: "set null" }),
  issue: text("issue").notNull(),
  expectedValue: text("expected_value"),
  actualValue: text("actual_value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Admin Audit Logs
 * Tracks administrative actions for security/compliance.
 */
export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: varchar('id', { length: 255 }).primaryKey(), // e.g., audit_...
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 100 }).notNull(),
  resource: varchar('resource', { length: 50 }).notNull(),
  resourceId: varchar('resource_id', { length: 255 }),
  details: text('details').notNull(),
  ipAddress: varchar('ip_address', { length: 100 }).default('unknown').notNull(),
  userAgent: text('user_agent').default('unknown').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});


/**
 * Reviews Table
 * Stores reviews left by customers for completed bookings.
 */
export const reviews = pgTable("reviews", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., rev_...
  userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }), // The customer who wrote it
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => providers.id, { onDelete: "cascade" }), // The provider being reviewed
  bookingId: varchar("booking_id", { length: 255 }).notNull().references(() => bookings.id, { onDelete: "cascade" }),

  serviceId: varchar("service_id", { length: 255 }).references(() => services.id, { onDelete: "set null" }), // Optional denorm to the service

  rating: integer("rating").notNull(), // Rating from 1 to 5
  comment: text("comment"),

  tipAmount: integer("tip_amount"), // Optional future tip in cents

  isHidden: boolean("is_hidden").default(false).notNull(),
  hiddenReason: text("hidden_reason"),
  hiddenBy: varchar("hidden_by", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
  hiddenAt: timestamp("hidden_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  bookingUserUnique: uniqueIndex("reviews_booking_user_unique").on(table.bookingId, table.userId),
}));

/**
 * Notifications Table
 * Stores in-app notifications for users.
 */
export const notifications = pgTable("notifications", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., notif_...
  userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }), // The user who receives it
  type: varchar("type", { length: 50 }).default("system").notNull(),
  title: text("title").default("Notification").notNull(),
  body: text("body"),
  actionUrl: text("action_url").default("/dashboard").notNull(),
  message: text("message").default("Notification").notNull(), // legacy field kept for backwards compatibility
  href: text("href").default("/dashboard").notNull(), // legacy field kept for backwards compatibility
  isRead: boolean("is_read").default(false).notNull(),
  readAt: timestamp("read_at"),
  bookingId: varchar("booking_id", { length: 255 }).references(() => bookings.id, { onDelete: "set null" }),
  serviceId: varchar("service_id", { length: 255 }).references(() => services.id, { onDelete: "set null" }),
  providerId: varchar("provider_id", { length: 255 }).references(() => providers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("notifications_user_idx").on(table.userId),
  createdIdx: index("notifications_created_idx").on(table.createdAt),
}));

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
export const conversations = pgTable(
  "conversations",
  {
    id: varchar("id", { length: 255 }).primaryKey(), // e.g., conv_...
    userAId: varchar("user_a_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userBId: varchar("user_b_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userPairUnique: uniqueIndex("conversations_user_pair_unique").on(table.userAId, table.userBId),
    lastMessageIdx: index("conversations_last_message_idx").on(table.lastMessageAt),
  }),
);

/**
 * Messages Table
 * Individual messages within a conversation.
 */
export const messageThreads = pgTable(
  "message_threads",
  {
    id: varchar("id", { length: 255 }).primaryKey(), // e.g., mthread_...
    bookingId: varchar("booking_id", { length: 255 })
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" })
      .unique(),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    unreadCount: integer("unread_count").notNull().default(0),
  },
  (table) => ({
    bookingIdx: index("message_threads_booking_idx").on(table.bookingId),
    lastMessageIdx: index("message_threads_last_message_idx").on(table.lastMessageAt),
  }),
);

export const messages = pgTable(
  "messages",
  {
    serverMessageId: varchar("server_message_id", { length: 255 }).primaryKey(), // canonical UUID message id
    id: varchar("id", { length: 255 }).notNull().unique(), // legacy id kept for backward compatibility
    bookingId: varchar("booking_id", { length: 255 })
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    threadId: varchar("thread_id", { length: 255 }).references(() => messageThreads.id, { onDelete: "cascade" }),
    senderId: varchar("sender_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientId: varchar("recipient_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    isSystem: boolean("is_system").default(false).notNull(),
    attachments: jsonb("attachments"),
    clientTempId: varchar("client_temp_id", { length: 255 }),
    deliveredAt: timestamp("delivered_at"),
    seenAt: timestamp("seen_at"),
    readAt: timestamp("read_at"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    bookingIdx: index("messages_booking_idx").on(table.bookingId),
    senderCreatedIdx: index("messages_sender_created_idx").on(table.senderId, table.createdAt),
    unreadIdx: index("messages_unread_idx").on(table.recipientId, table.readAt),
    threadCreatedIdx: index("messages_thread_created_idx").on(table.threadId, table.createdAt),
    bookingCreatedIdx: index("messages_booking_created_idx").on(table.bookingId, table.createdAt),
  }),
);

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
  isInternal: boolean("is_internal").default(true).notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
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

/**
 * Provider Saved Replies
 * Provider-owned message snippets used in booking chat (Pro/Elite feature).
 */
export const providerSavedReplies = pgTable("provider_saved_replies", {
  id: varchar("id", { length: 255 }).primaryKey(), // e.g., psr_...
  providerId: varchar("provider_id", { length: 255 })
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 120 }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  payouts: many(providerPayouts),
  earnings: many(providerEarnings),
  financialAuditLogs: many(financialAuditLogs),
  savedReplies: many(providerSavedReplies),
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

export const serviceFavoritesRelations = relations(serviceFavorites, ({ one }) => ({
  user: one(users, {
    fields: [serviceFavorites.userId],
    references: [users.id],
  }),
  service: one(services, {
    fields: [serviceFavorites.serviceId],
    references: [services.id],
  }),
}));

export const providerSavedRepliesRelations = relations(providerSavedReplies, ({ one }) => ({
  provider: one(providers, {
    fields: [providerSavedReplies.providerId],
    references: [providers.id],
  }),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  provider: one(providers, {
    fields: [services.providerId],
    references: [providers.id],
  }),
  bookings: many(bookings),
  favorites: many(serviceFavorites),
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

export const messageThreadsRelations = relations(messageThreads, ({ one, many }) => ({
  booking: one(bookings, {
    fields: [messageThreads.bookingId],
    references: [bookings.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  booking: one(bookings, {
    fields: [messages.bookingId],
    references: [bookings.id],
  }),
  thread: one(messageThreads, {
    fields: [messages.threadId],
    references: [messageThreads.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
  recipient: one(users, {
    fields: [messages.recipientId],
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

export const providerPayoutsRelations = relations(providerPayouts, ({ one, many }) => ({
  provider: one(providers, {
    fields: [providerPayouts.providerId],
    references: [providers.id],
  }),
  earnings: many(providerEarnings),
}));

export const providerEarningsRelations = relations(providerEarnings, ({ one }) => ({
  booking: one(bookings, {
    fields: [providerEarnings.bookingId],
    references: [bookings.id],
  }),
  provider: one(providers, {
    fields: [providerEarnings.providerId],
    references: [providers.id],
  }),
  service: one(services, {
    fields: [providerEarnings.serviceId],
    references: [services.id],
  }),
  payout: one(providerPayouts, {
    fields: [providerEarnings.payoutId],
    references: [providerPayouts.id],
  }),
}));

export const financialAuditLogsRelations = relations(financialAuditLogs, ({ one }) => ({
  provider: one(providers, {
    fields: [financialAuditLogs.providerId],
    references: [providers.id],
  }),
  booking: one(bookings, {
    fields: [financialAuditLogs.bookingId],
    references: [bookings.id],
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

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
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
  earning: one(providerEarnings, {
    fields: [bookings.id],
    references: [providerEarnings.bookingId],
  }),
  cancellations: many(bookingCancellations),
  reschedules: many(bookingReschedules),
}));

export const bookingCancellationsRelations = relations(bookingCancellations, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingCancellations.bookingId],
    references: [bookings.id],
  }),
  user: one(users, {
    fields: [bookingCancellations.userId],
    references: [users.id],
  }),
}));

export const bookingReschedulesRelations = relations(bookingReschedules, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingReschedules.bookingId],
    references: [bookings.id],
  }),
  requester: one(users, {
    fields: [bookingReschedules.requesterId],
    references: [users.id],
  }),
  responder: one(users, {
    fields: [bookingReschedules.responderId],
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

