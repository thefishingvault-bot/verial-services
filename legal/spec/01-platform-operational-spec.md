# Verial Services (NZ) — Operational / Technical / Data-Flow Specification

**As-of date:** 2026-01-21 (NZ)

**Repository context:** `thefishingvault-bot/verial-services`, branch `main`.

## Evidence rule (strict)
- Every behavioral claim below is either:
  - **Evidence-backed** (includes an **Evidence:** list pointing to the exact file(s) / route(s) / function(s)), or
  - Marked **Policy decision (not implemented)**.

This is an engineering evidence document intended to support NZ legal drafting. It is not legal advice.

---

## 1) Product scope and roles
### 1.1 Roles
- **Customer** is a `users` row with `role="user"`.
- **Provider** is a `users` row with `role="provider"`, with a corresponding `providers` row linked by `providers.userId`.
- **Admin** is a `users` row with `role="admin"`.

**Evidence:**
- `users.role` enum + table: [src/db/schema.ts](../../src/db/schema.ts)
- Middleware role resolution + routing: [src/middleware.ts](../../src/middleware.ts)
- Admin role resolution fallback behavior: [src/lib/admin-auth.ts](../../src/lib/admin-auth.ts)

### 1.2 Marketplace behavior (high-level)
- The platform supports service listings (`services`) created by providers.
- Customers create booking requests (`bookings`) for provider services.
- Providers accept/decline/cancel and mark work complete; customers confirm completion.

**Evidence:**
- Tables: [src/db/schema.ts](../../src/db/schema.ts)
- Booking create API: [src/app/api/bookings/create/route.ts](../../src/app/api/bookings/create/route.ts)
- Provider booking status update API: [src/app/api/provider/bookings/update-status/route.ts](../../src/app/api/provider/bookings/update-status/route.ts)
- Customer completion confirmation API: [src/app/api/bookings/[bookingId]/confirm-completion/route.ts](../../src/app/api/bookings/%5BbookingId%5D/confirm-completion/route.ts)

---

## 2) Authentication and authorization (AuthN/AuthZ)
### 2.1 Authentication mechanism
- Auth is performed using Clerk (`auth()`), and access to non-public routes is enforced in middleware.

**Evidence:**
- Middleware public-route allowlist + auth redirect behavior: [src/middleware.ts](../../src/middleware.ts)

### 2.2 Public route allowlist (selected)
- The middleware treats certain pages/APIs as public, including `/`, `/services*`, `/s/*`, `/p/*`, `/api/webhooks*`, `/api/stripe/webhook`, `/api/health*`, `/legal*`, and auth pages.

**Evidence:**
- Public route matcher list: [src/middleware.ts](../../src/middleware.ts)

### 2.3 Admin and provider dashboard gating
- `/dashboard/admin*` and `/api/admin*` require role `admin`.
- `/dashboard/provider*` requires role `provider` or `admin`.
- Provider dashboard access is restricted until provider application status is `approved`, except for onboarding routes `/dashboard/provider/kyc*` and `/dashboard/provider/services*`.

**Evidence:**
- Middleware admin/provider gating: [src/middleware.ts](../../src/middleware.ts)

### 2.4 Admin action rate limiting (dashboard POST/PATCH)
- Admin dashboard POST/PATCH is rate-limited (resource `admin`, limit 10/min).

**Evidence:**
- Middleware admin write rate limit: [src/middleware.ts](../../src/middleware.ts)

---

## 3) Primary data stores and identifiers
### 3.1 Database
- Database is Postgres accessed via Neon serverless HTTP driver, through Drizzle ORM.

**Evidence:**
- DB connection and requirement of `DATABASE_URL`: [src/lib/db.ts](../../src/lib/db.ts)

### 3.2 Core entities (non-exhaustive)
- `users`, `providers`, `services`, `bookings`, `provider_earnings`, `provider_payouts`, `provider_payout_requests`, `refunds`, `disputes`, `messages`, `notifications`.

**Evidence:**
- Table definitions: [src/db/schema.ts](../../src/db/schema.ts)

---

## 4) User data synchronization (Clerk → DB)
- On booking creation, the system fetches the Clerk user, extracts email/name/avatar, and inserts a `users` row if missing.

**Evidence:**
- Clerk user fetch + users insert: [src/app/api/bookings/create/route.ts](../../src/app/api/bookings/create/route.ts)
- `users` schema: [src/db/schema.ts](../../src/db/schema.ts)

**Policy decision (not implemented):**
- A general “account deletion” or “data export” workflow is not evidenced in the reviewed code.

---

## 5) Provider profile, trust/suspension, subscription plan
### 5.1 Provider profile and status
- Provider application status is tracked on `providers.status` (`pending|approved|rejected`).
- Suspension state exists (`providers.isSuspended`, reason, start/end timestamps).

**Evidence:**
- Provider columns: [src/db/schema.ts](../../src/db/schema.ts)
- Booking create checks for suspended provider: [src/app/api/bookings/create/route.ts](../../src/app/api/bookings/create/route.ts)
- Provider transact gating helper usage: [src/app/api/provider/subscription/checkout/route.ts](../../src/app/api/provider/subscription/checkout/route.ts)

### 5.2 Provider subscription plan storage
- Provider plan is stored on `providers.plan` with supporting Stripe subscription fields (`stripeCustomerId`, `stripeSubscriptionId`, status, price id, period end, cancel at period end).

**Evidence:**
- Provider subscription columns: [src/db/schema.ts](../../src/db/schema.ts)
- Provider subscription checkout: [src/app/api/provider/subscription/checkout/route.ts](../../src/app/api/provider/subscription/checkout/route.ts)
- Subscription syncing (webhook): [src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts)

---

## 6) KYC / identity verification (Sumsub)
### 6.1 Provider KYC fields
- Provider KYC state tracked via `providers.kycStatus` and timestamps; Sumsub identifiers may be stored (`sumsubApplicantId`, `sumsubInspectionId`).

**Evidence:**
- Provider KYC fields: [src/db/schema.ts](../../src/db/schema.ts)

### 6.2 Sumsub access token generation
- Authenticated providers can request a Sumsub WebSDK access token. The API requires a configured Sumsub level name.

**Evidence:**
- Access token endpoint: [src/app/api/provider/kyc/sumsub/access-token/route.ts](../../src/app/api/provider/kyc/sumsub/access-token/route.ts)
- Sumsub signed request helper: [src/lib/sumsub.ts](../../src/lib/sumsub.ts)

### 6.3 Sumsub webhook ingestion and signature verification
- Webhook route verifies signatures in production (requires `SUMSUB_WEBHOOK_SECRET`).
- In non-production, signature verification is required by default, with an explicit opt-out via `ALLOW_INSECURE_SUMSUB_WEBHOOK=true`.
- Webhook updates provider KYC status and may backfill applicant/inspection ids (best-effort via Sumsub API lookup by `externalUserId`).

**Evidence:**
- Webhook route verification + status mapping + DB update: [src/app/api/webhooks/sumsub/route.ts](../../src/app/api/webhooks/sumsub/route.ts)
- Sumsub API helper used for fallback resolution: [src/lib/sumsub.ts](../../src/lib/sumsub.ts)

---

## 7) File uploads and storage (Cloudflare R2)
### 7.1 R2 client configuration
- R2 uses AWS S3-compatible SDK (`S3Client`) and requires endpoint and access keys.

**Evidence:**
- R2 client setup: [src/lib/r2.ts](../../src/lib/r2.ts)

### 7.2 Presigned upload endpoints
- Avatar uploads (auth required) generate a presigned PUT URL and return `publicUrl`.
- Message attachments (auth required) generate a presigned PUT URL and return `publicUrl`.
- Identity documents (auth required) accept images or PDFs and generate a presigned PUT URL and return `publicUrl`.
- Service cover uploads (provider-only) validate provider status, optionally validate service ownership, and generate a presigned PUT URL.

**Evidence:**
- Avatar presign: [src/app/api/uploads/presign-avatar/route.ts](../../src/app/api/uploads/presign-avatar/route.ts)
- Message attachment presign: [src/app/api/uploads/presign-message-attachment/route.ts](../../src/app/api/uploads/presign-message-attachment/route.ts)
- Identity document presign: [src/app/api/uploads/presign-identity-document/route.ts](../../src/app/api/uploads/presign-identity-document/route.ts)
- Service cover presign: [src/app/api/uploads/presign-service-cover/route.ts](../../src/app/api/uploads/presign-service-cover/route.ts)

**Policy decision (not implemented):**
- Retention rules and deletion workflow for R2 objects are not evidenced.

---

## 8) Booking lifecycle (API-driven workflow)
### 8.1 Booking creation (customer)
- Requires authentication.
- Rate-limited (resource `bookings:create`, 5/min).
- Idempotent (uses a booking idempotency key and `withIdempotency`).
- Creates `bookings` row with status `pending`.
- Sends best-effort provider email and creates an in-app notification for the provider.

**Evidence:**
- Booking create endpoint: [src/app/api/bookings/create/route.ts](../../src/app/api/bookings/create/route.ts)
- Notifications helper: [src/lib/notifications.ts](../../src/lib/notifications.ts)
- Email helper: [src/lib/email.ts](../../src/lib/email.ts)
- Booking schema: [src/db/schema.ts](../../src/db/schema.ts)

### 8.2 Provider actions (accept/decline/cancel/mark completed)
- Providers can update booking status via a provider-authenticated endpoint.
- Status transitions are enforced via `assertTransition()`.
- Accept flow:
  - For `pricingType` `from` or `quote`, provider must set a final price.
  - Performs time-off and overlap checks.
  - Requires provider has `stripeConnectId` to accept.

**Evidence:**
- Provider booking update endpoint: [src/app/api/provider/bookings/update-status/route.ts](../../src/app/api/provider/bookings/update-status/route.ts)
- Booking transitions definition: [src/lib/booking-state.ts](../../src/lib/booking-state.ts)
- Provider schema includes `stripeConnectId`: [src/db/schema.ts](../../src/db/schema.ts)

### 8.3 Booking cancellation (customer or provider)
- Requires authentication.
- Rate-limited (resource `bookings:cancel`, 5/min).
- Idempotent.
- Allowed only from statuses `pending|accepted|paid`.
- Enforces an additional rule: providers cannot cancel after scheduled start time if the booking is already `paid`.
- If booking is `paid`, attempts a refund through Stripe (Connect-aware refund semantics) and persists a `refunds` record.
- Records cancellation in `booking_cancellations` and creates notifications.

**Evidence:**
- Booking cancel endpoint: [src/app/api/bookings/[bookingId]/cancel/route.ts](../../src/app/api/bookings/%5BbookingId%5D/cancel/route.ts)
- Booking transitions: [src/lib/booking-state.ts](../../src/lib/booking-state.ts)
- Refund helper: [src/lib/stripe-refunds.ts](../../src/lib/stripe-refunds.ts)
- Cancellation + refund tables: [src/db/schema.ts](../../src/db/schema.ts)

**Policy decision (not implemented):**
- Refund eligibility windows, partial refund rules, and no-show policy are not encoded as policy logic beyond the mechanical cancellation/refund pathways.
- The following policy parameters have been specified but are **not implemented** as controlling logic:
  - **Free cancellation window:** free cancellation up to 24 hours before the scheduled start.
  - **Late cancellation:** non-refundable unless provider fault.
  - **No-shows:** customer no-show = no refund; provider no-show = full refund.
  - **Stripe fees:** non-refundable; not absorbed by the platform.


---

## 9) Payments (Stripe)
### 9.1 Booking payment initiation
- Customer can initiate payment only when booking is `accepted`.
- Payment is created as a Stripe Checkout Session in `mode="payment"`.
- Booking/user/provider identifiers are placed into Stripe metadata.
- Uses `transfer_group = booking.id`.

**Evidence:**
- Booking pay endpoint: [src/app/api/bookings/[bookingId]/pay/route.ts](../../src/app/api/bookings/%5BbookingId%5D/pay/route.ts)

### 9.2 Alternative: direct PaymentIntent creation
- There is also an endpoint that creates a Stripe PaymentIntent for the booking and persists `bookings.paymentIntentId`.

**Evidence:**
- Create intent endpoint: [src/app/api/stripe/create-intent/route.ts](../../src/app/api/stripe/create-intent/route.ts)

### 9.3 Stripe client configuration
- Stripe SDK is initialized with a fixed API version.
- In test environments, a dummy key may be used to avoid import-time errors.

**Evidence:**
- Stripe client: [src/lib/stripe.ts](../../src/lib/stripe.ts)

---

## 10) Payment confirmation → booking paid → earnings ledger
### 10.1 Primary driver: Stripe bookings webhook
- The Stripe bookings webhook (platform events) responds to:
  - `checkout.session.completed` (payment mode)
  - `checkout.session.async_payment_succeeded`
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
- On success events, it attempts to transition booking to `paid`, ensures PI linkage, and upserts a `provider_earnings` row to `status="held"`.
- On `payment_intent.payment_failed`, it does not change booking status; it may still link PI id.

**Evidence:**
- Stripe bookings webhook implementation: [src/app/api/webhooks/stripe-bookings/route.ts](../../src/app/api/webhooks/stripe-bookings/route.ts)
- Booking transitions enforcement: [src/lib/booking-state.ts](../../src/lib/booking-state.ts)
- Earnings schema: [src/db/schema.ts](../../src/db/schema.ts)

### 10.2 Secondary drivers: customer sync endpoints
- There are customer-authenticated endpoints that retrieve the PaymentIntent; if it is `succeeded`, they transition booking to `paid` (if allowed) and best-effort ensure an earnings row exists.

**Evidence:**
- Booking sync payment endpoint: [src/app/api/bookings/[bookingId]/sync-payment/route.ts](../../src/app/api/bookings/%5BbookingId%5D/sync-payment/route.ts)
- Confirm booking payment endpoint: [src/app/api/stripe/confirm-booking-payment/route.ts](../../src/app/api/stripe/confirm-booking-payment/route.ts)

---

## 11) Completion and payout queueing / transfer
- Customer completion confirmation requires booking is in `completed_by_provider` (normalized).
- On confirmation, booking transitions to `completed`.
- The endpoint ensures a `provider_earnings` row exists (best-effort repair).
- If payouts are disabled by env flag, it returns success and reports payout as queued.
- If payouts are enabled, it marks earnings `awaiting_payout`, then attempts a Stripe Transfer to the provider’s Connect account (best-effort; does not block completion on failure).

**Evidence:**
- Confirm completion endpoint: [src/app/api/bookings/[bookingId]/confirm-completion/route.ts](../../src/app/api/bookings/%5BbookingId%5D/confirm-completion/route.ts)
- Earnings schema + statuses: [src/db/schema.ts](../../src/db/schema.ts)

---

## 12) Payout mirroring and Connect account status
- Stripe Connect webhook:
  - Updates provider `chargesEnabled` and `payoutsEnabled` from `account.updated` events.
  - Mirrors Stripe payouts into `provider_payouts`.
  - Best-effort links earnings to payouts by enumerating balance transactions for a payout.

**Evidence:**
- Stripe Connect webhook implementation: [src/app/api/webhooks/stripe-connect/route.ts](../../src/app/api/webhooks/stripe-connect/route.ts)
- Provider + payout + earnings schema: [src/db/schema.ts](../../src/db/schema.ts)
- Notifications helper: [src/lib/notifications.ts](../../src/lib/notifications.ts)

---

## 13) Refunds and disputes
### 13.1 Refund creation (booking cancel and admin dispute resolution)
- Booking cancel can create a Stripe refund (if booking is `paid`) and records a `refunds` row.
- Admin dispute resolution may create a Stripe refund and records a `refunds` row.

**Evidence:**
- Booking cancel refund path: [src/app/api/bookings/[bookingId]/cancel/route.ts](../../src/app/api/bookings/%5BbookingId%5D/cancel/route.ts)
- Admin dispute resolve refund path: [src/app/api/admin/disputes/[disputeId]/resolve/route.ts](../../src/app/api/admin/disputes/%5BdisputeId%5D/resolve/route.ts)
- Refund helper: [src/lib/stripe-refunds.ts](../../src/lib/stripe-refunds.ts)
- Refund/dispute schema: [src/db/schema.ts](../../src/db/schema.ts)

### 13.2 Refund completion sync → booking/earnings marked refunded
- Stripe platform webhook handles `charge.refunded` and `refund.updated` and, on successful refund, transitions booking to `refunded` and sets `provider_earnings.status` to `refunded`.

**Evidence:**
- Stripe webhook refund handlers + `markRefunded`: [src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts)
- Booking transitions: [src/lib/booking-state.ts](../../src/lib/booking-state.ts)

### 13.3 Dispute admin workflow
- Admin can move dispute from `open` → `under_review`.
- Admin can resolve a dispute and optionally initiate a refund.
- Admin can export disputes to CSV.

**Evidence:**
- Review endpoint: [src/app/api/admin/disputes/[disputeId]/review/route.ts](../../src/app/api/admin/disputes/%5BdisputeId%5D/review/route.ts)
- Resolve endpoint: [src/app/api/admin/disputes/[disputeId]/resolve/route.ts](../../src/app/api/admin/disputes/%5BdisputeId%5D/resolve/route.ts)
- Export endpoint: [src/app/api/admin/disputes/export/route.ts](../../src/app/api/admin/disputes/export/route.ts)

**Policy decision (not implemented):**
- A customer/provider “file dispute” endpoint/UI is not evidenced in the reviewed routes.
- The following dispute policy parameters have been specified but are **not implemented** as controlling logic:
  - **Who may initiate:** both parties.
  - **Time limit:** within 7 days.
  - **Review model:** admin-reviewed.

---

## 14) Messaging and notifications
### 14.1 Messages
- Messages are stored in DB and linked to bookings; message rows can include `attachments` JSON.

**Evidence:**
- Messaging tables: [src/db/schema.ts](../../src/db/schema.ts)
- Message attachment presign: [src/app/api/uploads/presign-message-attachment/route.ts](../../src/app/api/uploads/presign-message-attachment/route.ts)

### 14.2 Notifications
- Notifications are stored in DB.
- Notification creation is best-effort (failures do not throw).
- There is an idempotent “once” helper keyed by event + bookingId + userId.

**Evidence:**
- Notifications library: [src/lib/notifications.ts](../../src/lib/notifications.ts)
- Notifications table: [src/db/schema.ts](../../src/db/schema.ts)

---

## 15) Communications and operational controls
### 15.1 Email sending (Resend)
- Emails are sent via Resend.
- If `RESEND_API_KEY` is not configured, email sends are skipped and logged.
- Failures do not throw (main request continues).

**Evidence:**
- Email helper: [src/lib/email.ts](../../src/lib/email.ts)
- Booking create provider email: [src/app/api/bookings/create/route.ts](../../src/app/api/bookings/create/route.ts)
- Provider booking update customer email: [src/app/api/provider/bookings/update-status/route.ts](../../src/app/api/provider/bookings/update-status/route.ts)

### 15.2 Rate limiting (selected)
- Booking create and cancel endpoints are rate-limited per user.

**Evidence:**
- Booking create rate limit call: [src/app/api/bookings/create/route.ts](../../src/app/api/bookings/create/route.ts)
- Booking cancel rate limit call: [src/app/api/bookings/[bookingId]/cancel/route.ts](../../src/app/api/bookings/%5BbookingId%5D/cancel/route.ts)

---

# Mandatory state machines

## A) Booking status state machine (`bookings.status`)
Source-of-truth transition table is implemented in `ALLOWED_TRANSITIONS`.

**Evidence:**
- Transition map + `assertTransition`: [src/lib/booking-state.ts](../../src/lib/booking-state.ts)
- Enum values: [src/db/schema.ts](../../src/db/schema.ts)

| Current status | Allowed next statuses |
|---|---|
| `pending` | `accepted`, `declined`, `canceled_customer`, `canceled_provider` |
| `accepted` | `paid`, `canceled_provider`, `canceled_customer` |
| `declined` | *(none)* |
| `paid` | `completed_by_provider`, `disputed`, `refunded`, `canceled_customer`, `canceled_provider` |
| `completed_by_provider` | `completed`, `disputed`, `refunded` |
| `completed` | `disputed`, `refunded` |
| `canceled_customer` | *(none)* |
| `canceled_provider` | *(none)* |
| `disputed` | `refunded` |
| `refunded` | *(none)* |

**Invalid transitions:** any current→next not listed above; `assertTransition()` throws.

---

## B) Stripe states/events the platform reacts to (bookings)

**Evidence:**
- Stripe bookings webhook: [src/app/api/webhooks/stripe-bookings/route.ts](../../src/app/api/webhooks/stripe-bookings/route.ts)
- Customer sync/confirm endpoints: [src/app/api/bookings/[bookingId]/sync-payment/route.ts](../../src/app/api/bookings/%5BbookingId%5D/sync-payment/route.ts), [src/app/api/stripe/confirm-booking-payment/route.ts](../../src/app/api/stripe/confirm-booking-payment/route.ts)
- Stripe platform webhook: [src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts)

| Trigger | Stripe state observed | Platform reaction |
|---|---|---|
| `payment_intent.succeeded` | `PaymentIntent.status == "succeeded"` | Transition booking → `paid` (if allowed); ensure PI linkage; upsert earnings → `held` |
| `checkout.session.completed` (mode=payment) | session has `payment_intent` | Same as above (resolve bookingId/PI from metadata and DB) |
| `checkout.session.async_payment_succeeded` | async success | Same as above |
| `payment_intent.payment_failed` | failure | Do not change booking status; best-effort link PI id |
| `checkout.session.async_payment_failed` | async failure | Do not change booking status |
| Customer sync endpoints | `PaymentIntent.status == "succeeded"` | Transition booking → `paid` (if allowed); best-effort ensure earnings row exists |
| `payment_intent.canceled` | canceled | Clears `bookings.paymentIntentId` (best-effort) and notifies customer when resolved |

---

## C) Earnings and payout tracking state machine

### C.1 Earnings statuses
Earnings statuses are enumerated and stored on `provider_earnings.status`.

**Evidence:**
- Enum + table: [src/db/schema.ts](../../src/db/schema.ts)

### C.2 Observed/implemented transitions

| Current earnings status | Transition trigger | Next earnings status |
|---|---|---|
| `pending` | Payment success (webhook or sync endpoint) | `held` |
| `held` (or tolerated legacy `pending`) | Customer confirms completion (payouts enabled) | `awaiting_payout` |
| `awaiting_payout` | Connect payout event + balance-tx linking | `paid_out` (if payout is `paid`) or `awaiting_payout` (if not `paid`) |
| any | Refund confirmation (`refund.updated` succeeded / `charge.refunded`) | `refunded` |

**Evidence:**
- Upsert earnings held: [src/app/api/webhooks/stripe-bookings/route.ts](../../src/app/api/webhooks/stripe-bookings/route.ts)
- Confirm completion payout queue/transfer attempt: [src/app/api/bookings/[bookingId]/confirm-completion/route.ts](../../src/app/api/bookings/%5BbookingId%5D/confirm-completion/route.ts)
- Link earnings to payouts: [src/app/api/webhooks/stripe-connect/route.ts](../../src/app/api/webhooks/stripe-connect/route.ts)
- Mark refunded: [src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts)

**Note (implementation gap):**
- `earning_status` includes `transferred`, but no observed code path sets `provider_earnings.status` to `transferred`.
  - Treat as **legacy/unused** unless implemented.

---

# Privacy Act 2020-aligned data inventory (implemented vs policy decisions)

This inventory is based on observed tables and flows. **Retention/deletion/access workflows are not evidenced unless explicitly referenced.**

**Evidence:**
- Schema: [src/db/schema.ts](../../src/db/schema.ts)
- Clerk → DB sync: [src/app/api/bookings/create/route.ts](../../src/app/api/bookings/create/route.ts)
- Upload presign routes: [src/app/api/uploads/presign-avatar/route.ts](../../src/app/api/uploads/presign-avatar/route.ts), [src/app/api/uploads/presign-message-attachment/route.ts](../../src/app/api/uploads/presign-message-attachment/route.ts), [src/app/api/uploads/presign-identity-document/route.ts](../../src/app/api/uploads/presign-identity-document/route.ts)
- KYC: [src/app/api/provider/kyc/sumsub/access-token/route.ts](../../src/app/api/provider/kyc/sumsub/access-token/route.ts), [src/app/api/webhooks/sumsub/route.ts](../../src/app/api/webhooks/sumsub/route.ts)

## Inventory table

| Data category | Source | Stored where | Purpose (operational) | Sharing / processors | Retention |
|---|---|---|---|---|---|
| Auth identifier (Clerk userId) | Clerk | `users.id`, `providers.userId` | Account linkage and authorization | Clerk; Neon DB | Policy decision (not implemented) |
| Contact email | Clerk | `users.email` | Transactional comms and account ops | Resend (email delivery) | Policy decision (not implemented) |
| Name + avatar URL | Clerk | `users.firstName/lastName/avatarUrl` | UX personalization | Clerk; possibly R2 for uploaded assets | Policy decision (not implemented) |
| Provider profile | Provider | `providers.*` | Marketplace listing / trust / ops | Neon DB | Policy decision (not implemented) |
| KYC state + Sumsub IDs | Sumsub + provider | `providers.kycStatus`, `sumsubApplicantId`, `sumsubInspectionId` | Compliance and audit | Sumsub; Neon DB | Policy decision (not implemented): active duration + 12 months |
| Identity/business docs (URLs) | Provider upload | R2 object + URL fields | Verification evidence | Cloudflare R2 | Policy decision (not implemented): active duration + 12 months |
| Bookings (status, schedule, location, price) | Customer/provider | `bookings` | Fulfilment workflow and audit | Stripe metadata (bookingId linkage) | Policy decision (not implemented) |
| Payment identifiers | Stripe | `bookings.paymentIntentId`, earnings PI fields | Reconciliation + ledger | Stripe | Policy decision (not implemented) |
| Earnings and payouts | Platform + Stripe | `provider_earnings`, `provider_payouts`, `provider_payout_requests` | Provider reporting + payout ops | Stripe Connect | Policy decision (not implemented): financial records 7 years |
| Refund records | Platform/admin + Stripe | `refunds` | Audit and customer support | Stripe refunds | Policy decision (not implemented): financial records 7 years |
| Dispute records + evidence URLs | Admin (and/or parties) | `disputes` | Dispute handling recordkeeping | R2 (evidence URLs), exports | Policy decision (not implemented): 7 years |
| Messages + attachments | Users | `message_threads`, `messages.attachments` | In-platform comms | R2 (attachments), Neon DB | Policy decision (not implemented): 2 years |
| Notifications | Platform | `notifications` | UX event alerting | Neon DB | Policy decision (not implemented) |
| Admin/audit logs | Admin system | `admin_audit_logs`, `financial_audit_logs` | Security/compliance | Neon DB | Policy decision (not implemented): 30–90 days |

## Retention schedule (policy decisions)

**Policy decision (not implemented):** The following retention periods have been specified for legal/policy drafting but are not evidenced as enforced by code or automated deletion workflows.

| Data class | Retention period |
|---|---|
| Financial records (including payments/earnings/payouts/refunds and related audit) | 7 years |
| KYC records (provider identity verification) | Active duration + 12 months |
| Messages (and message attachments metadata/URLs) | 2 years |
| Logs (application/security/operational logs) | 30–90 days |

---

# Vendor / processor matrix (technical)

**Evidence:**
- Clerk auth gating: [src/middleware.ts](../../src/middleware.ts)
- Stripe SDK: [src/lib/stripe.ts](../../src/lib/stripe.ts)
- Stripe webhooks: [src/app/api/webhooks/stripe-bookings/route.ts](../../src/app/api/webhooks/stripe-bookings/route.ts), [src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts), [src/app/api/webhooks/stripe-connect/route.ts](../../src/app/api/webhooks/stripe-connect/route.ts)
- Neon DB: [src/lib/db.ts](../../src/lib/db.ts)
- R2: [src/lib/r2.ts](../../src/lib/r2.ts)
- Resend: [src/lib/email.ts](../../src/lib/email.ts)
- Sumsub: [src/lib/sumsub.ts](../../src/lib/sumsub.ts)

| Vendor | Implemented purpose | Key identifiers stored (DB) | Webhook endpoints | Cross-border note |
|---|---|---|---|---|
| Clerk | Auth + user profile source | `users.id/email/name/avatarUrl`, `providers.userId` | N/A | Likely cross-border (policy decision) |
| Stripe (Payments) | Booking payments via Checkout/PaymentIntents | `bookings.paymentIntentId`, PI metadata includes booking/user/provider ids | `/api/webhooks/stripe-bookings` | Likely cross-border (policy decision) |
| Stripe (Billing) | Provider subscriptions | `providers.stripeCustomerId`, `stripeSubscriptionId/status/priceId/period end` | `/api/stripe/webhook` | Likely cross-border (policy decision) |
| Stripe (Connect) | Provider payouts & account status | `providers.stripeConnectId`, `provider_payouts`, `provider_earnings.stripeTransferId` | `/api/webhooks/stripe-connect` | Likely cross-border (policy decision) |
| Neon | Postgres hosting | All tables in schema | N/A | Likely cross-border (policy decision) |
| Cloudflare R2 | File storage | URL references (docs, avatars, attachments) | N/A | Likely cross-border (policy decision) |
| Resend | Email delivery | None required in DB | N/A | Likely cross-border (policy decision) |
| Sumsub | KYC verification | Applicant/inspection ids + KYC status | `/api/webhooks/sumsub` | Likely cross-border (policy decision) |
| Sentry | Monitoring | Not evidenced in DB | N/A | Likely cross-border (policy decision) |
| Vercel | Hosting/runtime env | Not evidenced in DB | N/A | Likely cross-border (policy decision) |

---

# NZ drafting notes (non-legal; policy decisions)

**Policy decision (not implemented):**
- Marketplace contracting model (customer↔provider vs customer↔platform) is not encoded in code; must be decided and reflected in Terms.
- Consumer Guarantees Act (CGA) positioning and service-provider obligations are legal/policy decisions.
- GST handling: implementation has `chargesGst` flags on provider/service, but tax/legal disclosures are a policy decision.
- Privacy Act 2020 compliance specifics (retention periods, access/correction workflow, breach process) must be defined in policy and operational playbooks.
