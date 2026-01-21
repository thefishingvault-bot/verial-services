# Verial Services (NZ) — Legal Drafting Pack Summary (Topics/Clauses)

**As-of date:** 2026-01-21 (NZ)

This document is a **drafting pack outline** for NZ legal counsel. It is **not legal wording**. It lists clauses/topics to draft, anchored to:
- the implemented operational behaviors (see [legal/spec/01-platform-operational-spec.md](01-platform-operational-spec.md)), and
- identified policy gaps/choices (see [legal/spec/02-policy-decisions-checklist.md](02-policy-decisions-checklist.md)).

Where a topic depends on a non-implemented choice, it should be drafted as **Policy decision (not implemented)** and resolved before final Terms/Privacy/Refund Policies are published.

---

## 1) Terms of Service — core structure
- Parties and contracting model (platform role, agency/disclosure, provider independence).
  - Policy decision (not implemented): contracting structure. See [legal/spec/02-policy-decisions-checklist.md](02-policy-decisions-checklist.md)
- Definitions: “Customer”, “Provider”, “Booking”, “Service”, “Fees”, “Platform Fee”, “Payout”, “Dispute”, “Refund”.
- Eligibility: age, capacity, accurate information; account creation/Clerk identity.
  - Evidence (auth model): [src/middleware.ts](../../src/middleware.ts)

---

## 2) Marketplace rules (Platform Rules)
- Acceptable services/content, provider profile requirements, truthful listings.
- Prohibited conduct: fraud, harassment, unlawful services.
- Platform moderation/termination rights.
  - Policy decision (not implemented): moderation criteria and enforcement process.

---

## 3) Bookings — lifecycle + status meanings
- Define booking states and what each means for each party.
  - Evidence (authoritative transitions): [src/lib/booking-state.ts](../../src/lib/booking-state.ts)
- Customer flow: create booking; provider accepts/declines; customer pays after acceptance; completion confirmation.
  - Evidence (create): [src/app/api/bookings/create/route.ts](../../src/app/api/bookings/create/route.ts)
  - Evidence (provider status changes): [src/app/api/provider/bookings/update-status/route.ts](../../src/app/api/provider/bookings/update-status/route.ts)
  - Evidence (pay): [src/app/api/bookings/[bookingId]/pay/route.ts](../../src/app/api/bookings/%5BbookingId%5D/pay/route.ts)
  - Evidence (confirm completion): [src/app/api/bookings/[bookingId]/confirm-completion/route.ts](../../src/app/api/bookings/%5BbookingId%5D/confirm-completion/route.ts)
- Reschedules: notice windows; mutual consent; effect on cancellation/refund.
  - Policy decision (not implemented): reschedule process. (Schema exists.) [src/db/schema.ts](../../src/db/schema.ts)
- No-shows/late arrivals: definition, evidence, outcomes.
  - Policy decision (not implemented): no-show outcomes (provided): customer no-show = no refund; provider no-show = full refund.

---

## 4) Pricing and fees
- Explain total price, deposits (if any), platform fees, and how fees are shown.
  - Policy decision (not implemented): disclosure and calculation rules.
- Currency, invoicing/receipts, GST handling.
  - Policy decision (not implemented): GST/supplier-of-record.
  - Evidence (GST flags exist): [src/db/schema.ts](../../src/db/schema.ts)

---

## 5) Payments (Stripe) — authorization/charge and failures
- Payment method handling; PCI responsibilities (Stripe).
- When customers are charged (after acceptance) and what happens if payment fails.
  - Evidence (Checkout session after acceptance): [src/app/api/bookings/[bookingId]/pay/route.ts](../../src/app/api/bookings/%5BbookingId%5D/pay/route.ts)
  - Evidence (webhook: payment failure does not set booking paid): [src/app/api/webhooks/stripe-bookings/route.ts](../../src/app/api/webhooks/stripe-bookings/route.ts)

---

## 6) Cancellations and refunds
- Cancellation by customer/provider: permitted windows, fees, exceptions.
  - Evidence (implemented status constraints): [src/app/api/bookings/[bookingId]/cancel/route.ts](../../src/app/api/bookings/%5BbookingId%5D/cancel/route.ts)
  - Policy decision (not implemented):
    - Free cancellation up to 24 hours before scheduled start.
    - Late cancellations are non-refundable unless provider fault.
    - Partial refund policy (if any).
- Refund methods and timing, including Stripe processing times; no cash refunds.
- Stripe fee treatment.
  - Policy decision (not implemented): Stripe fees are non-refundable and not absorbed by the platform.
- Connect/destination-charge semantics: when refunds reverse transfers and application fees.
  - Evidence (refund helper): [src/lib/stripe-refunds.ts](../../src/lib/stripe-refunds.ts)

---

## 7) Disputes and chargebacks
- Define dispute types (service quality, non-delivery, misrepresentation).
- Submission process, required evidence, timelines, interim measures.
  - Policy decision (not implemented): customer/provider submission path.
- Dispute initiation window.
  - Policy decision (not implemented): both parties may initiate within 7 days; admin-reviewed.
- Admin review + outcomes; refunds/partial refunds.
  - Evidence (admin workflow endpoints): [src/app/api/admin/disputes/[disputeId]/review/route.ts](../../src/app/api/admin/disputes/%5BdisputeId%5D/review/route.ts), [src/app/api/admin/disputes/[disputeId]/resolve/route.ts](../../src/app/api/admin/disputes/%5BdisputeId%5D/resolve/route.ts)

---

## 8) Provider earnings and payouts
- When providers earn (after completion confirmation), payout initiation, and failure handling.
  - Evidence (best-effort transfer; completion not blocked): [src/app/api/bookings/[bookingId]/confirm-completion/route.ts](../../src/app/api/bookings/%5BbookingId%5D/confirm-completion/route.ts)
- Payout schedules, minimum thresholds, reserves/holds.
  - Policy decision (not implemented)
- Stripe Connect onboarding responsibilities and KYC obligations.
  - Evidence (KYC system exists): [src/app/api/webhooks/sumsub/route.ts](../../src/app/api/webhooks/sumsub/route.ts)

---

## 9) Subscriptions (Providers)
- Plan terms, billing, renewals/cancellation, proration/refunds.
  - Evidence (subscription checkout): [src/app/api/provider/subscription/checkout/route.ts](../../src/app/api/provider/subscription/checkout/route.ts)
  - Evidence (subscription syncing via Stripe webhook): [src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts)
- Policy decision (not implemented): any promised plan “benefits” not enforced by code must be treated as marketing-only or removed.

---

## 10) Privacy Policy (NZ Privacy Act 2020 aligned)
- Information collected: account/profile, booking data, payment identifiers, messages, uploads, KYC/identity documents.
  - Evidence (schema inventory): [src/db/schema.ts](../../src/db/schema.ts)
  - Evidence (upload routes incl identity docs): [src/app/api/uploads/presign-identity-document/route.ts](../../src/app/api/uploads/presign-identity-document/route.ts)
  - Evidence (KYC webhook): [src/app/api/webhooks/sumsub/route.ts](../../src/app/api/webhooks/sumsub/route.ts)
- Purposes of use: provide services, payments, fraud prevention, compliance, communications.
- Disclosures to processors: Clerk, Stripe, Sumsub, R2, Resend, Neon, Vercel, Sentry (as applicable).
  - Evidence (vendor integrations in code): [src/lib/stripe.ts](../../src/lib/stripe.ts), [src/lib/sumsub.ts](../../src/lib/sumsub.ts), [src/lib/r2.ts](../../src/lib/r2.ts), [src/lib/email.ts](../../src/lib/email.ts)
- Cross-border disclosures and safeguards.
  - Policy decision (not implemented): cross-border statement and contractual safeguards.
- Retention and deletion.
  - Policy decision (not implemented): retention schedule (provided) and deletion workflows.
    - Financial records: 7 years.
    - KYC: active duration + 12 months.
    - Messages: 2 years.
    - Logs: 30–90 days.
- User rights: access/correction, complaint process.
  - Policy decision (not implemented): operational workflow.

---

## 11) Security statement
- Authentication and authorization model; admin role checks.
  - Evidence: [src/middleware.ts](../../src/middleware.ts), [src/lib/admin-auth.ts](../../src/lib/admin-auth.ts)
- Rate limits and abuse prevention.
  - Evidence (example endpoints): [src/app/api/bookings/create/route.ts](../../src/app/api/bookings/create/route.ts)
- Incident response and breach notification.
  - Policy decision (not implemented)
- Log retention.
  - Policy decision (not implemented): 30–90 days.

---

## 12) Liability, disclaimers, and consumer law notes
- Liability limitations consistent with NZ law; platform role in service delivery.
  - Policy decision (not implemented): align with contracting model.
- CGA/FTA notes (if applicable): ensure claims don’t overreach.

---

## 13) Notices and communications
- How platform communicates changes, booking updates, legal notices.
  - Evidence (notifications system exists; best-effort): [src/lib/notifications.ts](../../src/lib/notifications.ts)
  - Evidence (email helper best-effort): [src/lib/email.ts](../../src/lib/email.ts)
- Marketing communications consent and opt-out.
  - Policy decision (not implemented)

---

## 14) Governing law and venue
- NZ governing law, courts/tribunal venue.
  - Policy decision (not implemented)

---

## 15) Document set and publication checklist
- Ensure consistency between:
  - Terms of Service
  - Privacy Policy
  - Refund/Dispute Policy
  - Platform Rules
- Ensure every “policy decision” in [legal/spec/02-policy-decisions-checklist.md](02-policy-decisions-checklist.md) is resolved or explicitly deferred.
