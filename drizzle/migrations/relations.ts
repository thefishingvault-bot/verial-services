import { relations } from "drizzle-orm/relations";
import { providers, providerNotes, users, bookings, refunds, disputes, services, reviews, notifications, favoriteProviders, providerAvailabilities, providerTimeOffs, conversations, messages, providerChanges, providerSuspensions, riskRules, trustIncidents } from "./schema";

export const providerNotesRelations = relations(providerNotes, ({one}) => ({
	provider: one(providers, {
		fields: [providerNotes.providerId],
		references: [providers.id]
	}),
	user: one(users, {
		fields: [providerNotes.createdBy],
		references: [users.id]
	}),
}));

export const providersRelations = relations(providers, ({one, many}) => ({
	providerNotes: many(providerNotes),
	user: one(users, {
		fields: [providers.userId],
		references: [users.id]
	}),
	services: many(services),
	bookings: many(bookings),
	reviews: many(reviews),
	favoriteProviders: many(favoriteProviders),
	providerAvailabilities: many(providerAvailabilities),
	providerTimeOffs: many(providerTimeOffs),
	providerChanges: many(providerChanges),
	providerSuspensions: many(providerSuspensions),
	trustIncidents: many(trustIncidents),
}));

export const usersRelations = relations(users, ({many}) => ({
	providerNotes: many(providerNotes),
	refunds: many(refunds),
	providers: many(providers),
	disputes_initiatorId: many(disputes, {
		relationName: "disputes_initiatorId_users_id"
	}),
	disputes_resolvedBy: many(disputes, {
		relationName: "disputes_resolvedBy_users_id"
	}),
	bookings: many(bookings),
	reviews: many(reviews),
	notifications: many(notifications),
	favoriteProviders: many(favoriteProviders),
	conversations_user1Id: many(conversations, {
		relationName: "conversations_user1Id_users_id"
	}),
	conversations_user2Id: many(conversations, {
		relationName: "conversations_user2Id_users_id"
	}),
	messages: many(messages),
	providerChanges_requestedBy: many(providerChanges, {
		relationName: "providerChanges_requestedBy_users_id"
	}),
	providerChanges_reviewedBy: many(providerChanges, {
		relationName: "providerChanges_reviewedBy_users_id"
	}),
	providerSuspensions: many(providerSuspensions),
	riskRules: many(riskRules),
	trustIncidents_reportedBy: many(trustIncidents, {
		relationName: "trustIncidents_reportedBy_users_id"
	}),
	trustIncidents_resolvedBy: many(trustIncidents, {
		relationName: "trustIncidents_resolvedBy_users_id"
	}),
}));

export const refundsRelations = relations(refunds, ({one}) => ({
	booking: one(bookings, {
		fields: [refunds.bookingId],
		references: [bookings.id]
	}),
	user: one(users, {
		fields: [refunds.processedBy],
		references: [users.id]
	}),
}));

export const bookingsRelations = relations(bookings, ({one, many}) => ({
	refunds: many(refunds),
	disputes: many(disputes),
	user: one(users, {
		fields: [bookings.userId],
		references: [users.id]
	}),
	service: one(services, {
		fields: [bookings.serviceId],
		references: [services.id]
	}),
	provider: one(providers, {
		fields: [bookings.providerId],
		references: [providers.id]
	}),
	reviews: many(reviews),
	trustIncidents: many(trustIncidents),
}));

export const disputesRelations = relations(disputes, ({one}) => ({
	booking: one(bookings, {
		fields: [disputes.bookingId],
		references: [bookings.id]
	}),
	user_initiatorId: one(users, {
		fields: [disputes.initiatorId],
		references: [users.id],
		relationName: "disputes_initiatorId_users_id"
	}),
	user_resolvedBy: one(users, {
		fields: [disputes.resolvedBy],
		references: [users.id],
		relationName: "disputes_resolvedBy_users_id"
	}),
}));

export const servicesRelations = relations(services, ({one, many}) => ({
	provider: one(providers, {
		fields: [services.providerId],
		references: [providers.id]
	}),
	bookings: many(bookings),
}));

export const reviewsRelations = relations(reviews, ({one}) => ({
	user: one(users, {
		fields: [reviews.userId],
		references: [users.id]
	}),
	provider: one(providers, {
		fields: [reviews.providerId],
		references: [providers.id]
	}),
	booking: one(bookings, {
		fields: [reviews.bookingId],
		references: [bookings.id]
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	user: one(users, {
		fields: [notifications.userId],
		references: [users.id]
	}),
}));

export const favoriteProvidersRelations = relations(favoriteProviders, ({one}) => ({
	user: one(users, {
		fields: [favoriteProviders.userId],
		references: [users.id]
	}),
	provider: one(providers, {
		fields: [favoriteProviders.providerId],
		references: [providers.id]
	}),
}));

export const providerAvailabilitiesRelations = relations(providerAvailabilities, ({one}) => ({
	provider: one(providers, {
		fields: [providerAvailabilities.providerId],
		references: [providers.id]
	}),
}));

export const providerTimeOffsRelations = relations(providerTimeOffs, ({one}) => ({
	provider: one(providers, {
		fields: [providerTimeOffs.providerId],
		references: [providers.id]
	}),
}));

export const conversationsRelations = relations(conversations, ({one, many}) => ({
	user_user1Id: one(users, {
		fields: [conversations.user1Id],
		references: [users.id],
		relationName: "conversations_user1Id_users_id"
	}),
	user_user2Id: one(users, {
		fields: [conversations.user2Id],
		references: [users.id],
		relationName: "conversations_user2Id_users_id"
	}),
	messages: many(messages),
}));

export const messagesRelations = relations(messages, ({one}) => ({
	conversation: one(conversations, {
		fields: [messages.conversationId],
		references: [conversations.id]
	}),
	user: one(users, {
		fields: [messages.senderId],
		references: [users.id]
	}),
}));

export const providerChangesRelations = relations(providerChanges, ({one}) => ({
	provider: one(providers, {
		fields: [providerChanges.providerId],
		references: [providers.id]
	}),
	user_requestedBy: one(users, {
		fields: [providerChanges.requestedBy],
		references: [users.id],
		relationName: "providerChanges_requestedBy_users_id"
	}),
	user_reviewedBy: one(users, {
		fields: [providerChanges.reviewedBy],
		references: [users.id],
		relationName: "providerChanges_reviewedBy_users_id"
	}),
}));

export const providerSuspensionsRelations = relations(providerSuspensions, ({one}) => ({
	provider: one(providers, {
		fields: [providerSuspensions.providerId],
		references: [providers.id]
	}),
	user: one(users, {
		fields: [providerSuspensions.performedBy],
		references: [users.id]
	}),
}));

export const riskRulesRelations = relations(riskRules, ({one}) => ({
	user: one(users, {
		fields: [riskRules.createdBy],
		references: [users.id]
	}),
}));

export const trustIncidentsRelations = relations(trustIncidents, ({one}) => ({
	provider: one(providers, {
		fields: [trustIncidents.providerId],
		references: [providers.id]
	}),
	user_reportedBy: one(users, {
		fields: [trustIncidents.reportedBy],
		references: [users.id],
		relationName: "trustIncidents_reportedBy_users_id"
	}),
	booking: one(bookings, {
		fields: [trustIncidents.bookingId],
		references: [bookings.id]
	}),
	user_resolvedBy: one(users, {
		fields: [trustIncidents.resolvedBy],
		references: [users.id],
		relationName: "trustIncidents_resolvedBy_users_id"
	}),
}));