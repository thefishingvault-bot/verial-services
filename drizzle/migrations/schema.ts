import { pgTable, unique, varchar, text, timestamp, foreignKey, boolean, integer, time, pgEnum, index } from "drizzle-orm/pg-core"

export const bookingStatus = pgEnum("booking_status", ['pending', 'confirmed', 'paid', 'completed', 'canceled'])
export const dayOfWeek = pgEnum("day_of_week", ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
export const kycStatus = pgEnum("kyc_status", ['not_started', 'in_progress', 'pending_review', 'verified', 'rejected'])
export const providerChangeField = pgEnum("provider_change_field", ['bio', 'businessName', 'baseSuburb', 'baseRegion', 'serviceRadiusKm'])
export const providerChangeStatus = pgEnum("provider_change_status", ['pending', 'approved', 'rejected', 'flagged'])
export const providerStatus = pgEnum("provider_status", ['pending', 'approved', 'rejected'])
export const serviceCategory = pgEnum("service_category", ['cleaning', 'plumbing', 'gardening', 'it_support', 'accounting', 'detailing', 'other'])
export const trustLevel = pgEnum("trust_level", ['bronze', 'silver', 'gold', 'platinum'])
export const userRole = pgEnum("user_role", ['user', 'provider', 'admin'])


export const users = pgTable("users", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	firstName: text("first_name"),
	lastName: text("last_name"),
	avatarUrl: text("avatar_url"),
	role: userRole().default('user').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	providerId: varchar("provider_id", { length: 255 }),
}, (table) => [
	unique("users_email_unique").on(table.email),
	unique("users_provider_id_unique").on(table.providerId),
]);

export const providerNotes = pgTable("provider_notes", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	providerId: varchar("provider_id", { length: 255 }).notNull(),
	note: text().notNull(),
	isInternal: boolean("is_internal").default(true).notNull(),
	createdBy: varchar("created_by", { length: 255 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [providers.id],
			name: "provider_notes_provider_id_providers_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "provider_notes_created_by_users_id_fk"
		}).onDelete("cascade"),
]);

export const refunds = pgTable("refunds", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	bookingId: varchar("booking_id", { length: 255 }).notNull(),
	stripeRefundId: varchar("stripe_refund_id", { length: 255 }),
	amount: integer().notNull(),
	reason: varchar({ length: 100 }).notNull(),
	description: text(),
	platformFeeRefunded: integer("platform_fee_refunded").default(0).notNull(),
	providerAmountRefunded: integer("provider_amount_refunded").default(0).notNull(),
	status: varchar({ length: 20 }).default('pending').notNull(),
	processedBy: varchar("processed_by", { length: 255 }).notNull(),
	processedAt: timestamp("processed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookings.id],
			name: "refunds_booking_id_bookings_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.processedBy],
			foreignColumns: [users.id],
			name: "refunds_processed_by_users_id_fk"
		}).onDelete("cascade"),
	unique("refunds_stripe_refund_id_unique").on(table.stripeRefundId),
]);

export const providers = pgTable("providers", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 255 }).notNull(),
	handle: varchar({ length: 100 }).notNull(),
	businessName: varchar("business_name", { length: 255 }).notNull(),
	bio: text(),
	status: providerStatus().default('pending').notNull(),
	isVerified: boolean("is_verified").default(false).notNull(),
	trustLevel: trustLevel("trust_level").default('bronze').notNull(),
	trustScore: integer("trust_score").default(0).notNull(),
	stripeConnectId: varchar("stripe_connect_id", { length: 255 }),
	chargesEnabled: boolean("charges_enabled").default(false).notNull(),
	payoutsEnabled: boolean("payouts_enabled").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	chargesGst: boolean("charges_gst").default(true).notNull(),
	baseSuburb: varchar("base_suburb", { length: 255 }),
	baseRegion: varchar("base_region", { length: 255 }),
	serviceRadiusKm: integer("service_radius_km").default(10).notNull(),
	kycStatus: kycStatus("kyc_status").default('not_started').notNull(),
	identityDocumentUrl: text("identity_document_url"),
	businessDocumentUrl: text("business_document_url"),
	kycSubmittedAt: timestamp("kyc_submitted_at", { mode: 'string' }),
	kycVerifiedAt: timestamp("kyc_verified_at", { mode: 'string' }),
	isSuspended: boolean("is_suspended").default(false).notNull(),
	suspensionReason: text("suspension_reason"),
	suspensionStartDate: timestamp("suspension_start_date", { mode: 'string' }),
	suspensionEndDate: timestamp("suspension_end_date", { mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "providers_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("providers_user_id_unique").on(table.userId),
	unique("providers_handle_unique").on(table.handle),
	unique("providers_stripe_connect_id_unique").on(table.stripeConnectId),
]);

export const disputes = pgTable("disputes", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	bookingId: varchar("booking_id", { length: 255 }).notNull(),
	initiatorId: varchar("initiator_id", { length: 255 }).notNull(),
	initiatorType: varchar("initiator_type", { length: 20 }).notNull(),
	reason: varchar({ length: 100 }).notNull(),
	description: text().notNull(),
	evidenceUrls: text("evidence_urls").array(),
	amountDisputed: integer("amount_disputed"),
	status: varchar({ length: 20 }).default('open').notNull(),
	adminDecision: varchar("admin_decision", { length: 50 }),
	adminNotes: text("admin_notes"),
	refundAmount: integer("refund_amount"),
	resolvedBy: varchar("resolved_by", { length: 255 }),
	resolvedAt: timestamp("resolved_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookings.id],
			name: "disputes_booking_id_bookings_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.initiatorId],
			foreignColumns: [users.id],
			name: "disputes_initiator_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.resolvedBy],
			foreignColumns: [users.id],
			name: "disputes_resolved_by_users_id_fk"
		}).onDelete("set null"),
]);

export const services = pgTable("services", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	providerId: varchar("provider_id", { length: 255 }).notNull(),
	title: varchar({ length: 255 }).notNull(),
	slug: varchar({ length: 255 }).notNull(),
	description: text(),
	priceInCents: integer("price_in_cents").notNull(),
	category: serviceCategory().default('other').notNull(),
	coverImageUrl: text("cover_image_url"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	chargesGst: boolean("charges_gst").default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [providers.id],
			name: "services_provider_id_providers_id_fk"
		}).onDelete("cascade"),
	unique("services_slug_unique").on(table.slug),
]);

export const bookings = pgTable("bookings", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 255 }).notNull(),
	serviceId: varchar("service_id", { length: 255 }).notNull(),
	providerId: varchar("provider_id", { length: 255 }).notNull(),
	status: bookingStatus().default('pending').notNull(),
	scheduledDate: timestamp("scheduled_date", { mode: 'string' }),
	priceAtBooking: integer("price_at_booking").notNull(),
	paymentIntentId: varchar("payment_intent_id", { length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "bookings_user_id_users_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.serviceId],
			foreignColumns: [services.id],
			name: "bookings_service_id_services_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [providers.id],
			name: "bookings_provider_id_providers_id_fk"
		}).onDelete("set null"),
	unique("bookings_payment_intent_id_unique").on(table.paymentIntentId),
]);

export const reviews = pgTable("reviews", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 255 }).notNull(),
	providerId: varchar("provider_id", { length: 255 }).notNull(),
	bookingId: varchar("booking_id", { length: 255 }).notNull(),
	rating: integer().notNull(),
	comment: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "reviews_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [providers.id],
			name: "reviews_provider_id_providers_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookings.id],
			name: "reviews_booking_id_bookings_id_fk"
		}).onDelete("cascade"),
	unique("reviews_booking_id_unique").on(table.bookingId),
]);

export const notifications = pgTable("notifications", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 255 }).notNull(),
	type: varchar({ length: 50 }).default("system").notNull(),
	title: text().default("Notification").notNull(),
	body: text(),
	actionUrl: text("action_url").default("/dashboard").notNull(),
	message: text().default("Notification").notNull(),
	href: text().default("/dashboard").notNull(),
	isRead: boolean("is_read").default(false).notNull(),
	readAt: timestamp("read_at", { mode: 'string' }),
	bookingId: varchar("booking_id", { length: 255 }),
	serviceId: varchar("service_id", { length: 255 }),
	providerId: varchar("provider_id", { length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "notifications_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookings.id],
			name: "notifications_booking_id_bookings_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.serviceId],
			foreignColumns: [services.id],
			name: "notifications_service_id_services_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [providers.id],
			name: "notifications_provider_id_providers_id_fk"
		}).onDelete("set null"),
	index("notifications_user_idx").on(table.userId),
	index("notifications_created_idx").on(table.createdAt),
]);

export const favoriteProviders = pgTable("favorite_providers", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 255 }).notNull(),
	providerId: varchar("provider_id", { length: 255 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "favorite_providers_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [providers.id],
			name: "favorite_providers_provider_id_providers_id_fk"
		}).onDelete("cascade"),
]);

export const providerAvailabilities = pgTable("provider_availabilities", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	providerId: varchar("provider_id", { length: 255 }).notNull(),
	dayOfWeek: dayOfWeek("day_of_week").notNull(),
	startTime: time("start_time").notNull(),
	endTime: time("end_time").notNull(),
	isEnabled: boolean("is_enabled").default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [providers.id],
			name: "provider_availabilities_provider_id_providers_id_fk"
		}).onDelete("cascade"),
]);

export const providerTimeOffs = pgTable("provider_time_offs", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	providerId: varchar("provider_id", { length: 255 }).notNull(),
	reason: text(),
	startTime: timestamp("start_time", { withTimezone: true, mode: 'string' }).notNull(),
	endTime: timestamp("end_time", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [providers.id],
			name: "provider_time_offs_provider_id_providers_id_fk"
		}).onDelete("cascade"),
]);

export const conversations = pgTable("conversations", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	userAId: varchar("user_a_id", { length: 255 }).notNull(),
	userBId: varchar("user_b_id", { length: 255 }).notNull(),
	lastMessageAt: timestamp("last_message_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userAId],
			foreignColumns: [users.id],
			name: "conversations_user_a_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userBId],
			foreignColumns: [users.id],
			name: "conversations_user_b_id_users_id_fk"
		}).onDelete("cascade"),
	unique("conversations_user_pair_unique").on(table.userAId, table.userBId),
	index("conversations_last_message_idx").on(table.lastMessageAt),
]);

export const messages = pgTable("messages", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	conversationId: varchar("conversation_id", { length: 255 }).notNull(),
	senderId: varchar("sender_id", { length: 255 }).notNull(),
	content: text().notNull(),
	readAt: timestamp("read_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "messages_conversation_id_conversations_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.senderId],
			foreignColumns: [users.id],
			name: "messages_sender_id_users_id_fk"
		}).onDelete("cascade"),
	index("messages_conversation_created_idx").on(table.conversationId, table.createdAt),
]);

export const providerChanges = pgTable("provider_changes", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	providerId: varchar("provider_id", { length: 255 }).notNull(),
	fieldName: providerChangeField("field_name").notNull(),
	oldValue: text("old_value"),
	newValue: text("new_value").notNull(),
	status: providerChangeStatus().default('pending').notNull(),
	requestedBy: varchar("requested_by", { length: 255 }).notNull(),
	reviewedBy: varchar("reviewed_by", { length: 255 }),
	reviewNote: text("review_note"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [providers.id],
			name: "provider_changes_provider_id_providers_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.requestedBy],
			foreignColumns: [users.id],
			name: "provider_changes_requested_by_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reviewedBy],
			foreignColumns: [users.id],
			name: "provider_changes_reviewed_by_users_id_fk"
		}).onDelete("set null"),
]);

export const providerSuspensions = pgTable("provider_suspensions", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	providerId: varchar("provider_id", { length: 255 }).notNull(),
	action: varchar({ length: 50 }).notNull(),
	reason: text(),
	startDate: timestamp("start_date", { mode: 'string' }),
	endDate: timestamp("end_date", { mode: 'string' }),
	performedBy: varchar("performed_by", { length: 255 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [providers.id],
			name: "provider_suspensions_provider_id_providers_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.performedBy],
			foreignColumns: [users.id],
			name: "provider_suspensions_performed_by_users_id_fk"
		}).onDelete("cascade"),
]);

export const riskRules = pgTable("risk_rules", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	incidentType: varchar("incident_type", { length: 100 }).notNull(),
	severity: varchar({ length: 20 }).notNull(),
	trustScorePenalty: integer("trust_score_penalty").default(0).notNull(),
	autoSuspend: boolean("auto_suspend").default(false).notNull(),
	suspendDurationDays: integer("suspend_duration_days"),
	enabled: boolean().default(true).notNull(),
	createdBy: varchar("created_by", { length: 255 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "risk_rules_created_by_users_id_fk"
		}).onDelete("cascade"),
]);

export const trustIncidents = pgTable("trust_incidents", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	providerId: varchar("provider_id", { length: 255 }).notNull(),
	incidentType: varchar("incident_type", { length: 100 }).notNull(),
	severity: varchar({ length: 20 }).notNull(),
	description: text().notNull(),
	reportedBy: varchar("reported_by", { length: 255 }),
	bookingId: varchar("booking_id", { length: 255 }),
	trustScoreImpact: integer("trust_score_impact").default(0).notNull(),
	resolved: boolean().default(false).notNull(),
	resolvedBy: varchar("resolved_by", { length: 255 }),
	resolvedAt: timestamp("resolved_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.providerId],
			foreignColumns: [providers.id],
			name: "trust_incidents_provider_id_providers_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reportedBy],
			foreignColumns: [users.id],
			name: "trust_incidents_reported_by_users_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookings.id],
			name: "trust_incidents_booking_id_bookings_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.resolvedBy],
			foreignColumns: [users.id],
			name: "trust_incidents_resolved_by_users_id_fk"
		}).onDelete("set null"),
]);
