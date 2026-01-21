# Verial Services (NZ) — Policy Decisions Checklist (Gaps vs Implemented)

**As-of date:** 2026-01-21 (NZ)

This checklist enumerates policy decisions required to draft Terms, Privacy Policy, Refund/Dispute Policy, and Platform Rules. Each item is marked as either:
- **Policy decision (not implemented)** (no controlling logic evidenced), or
- **Partially implemented** (mechanical capability exists, but policy parameters are missing).

Where relevant, an **Evidence:** section points to the existing implementation.

---

## A) Marketplace contracting model (Terms)
- **Policy decision (not implemented):** Decide the legal contracting structure (customer↔provider vs customer↔platform) and agency/disclosure model.
- **Policy decision (not implemented):** Define provider classification and responsibilities (independent contractor vs employee) and related platform disclaimers.

---

## B) Booking rules (Platform Rules + Terms)
- **Policy decision (partially implemented):** Define booking acceptance obligations and timelines.
  - Evidence (mechanics exist): provider can accept/decline/cancel via API. [src/app/api/provider/bookings/update-status/route.ts](../../src/app/api/provider/bookings/update-status/route.ts)
- **Policy decision (not implemented):** Define reschedule process and required notice windows (schema exists; process not evidenced here).
  - Evidence (schema exists): `booking_reschedules`. [src/db/schema.ts](../../src/db/schema.ts)
- **Policy decision (not implemented):** No-shows policy (provided): customer no-show = no refund; provider no-show = full refund.
- **Policy decision (partially implemented):** Define provider cancellation penalties and rules.
  - Evidence (extra constraint exists): providers cannot cancel after scheduled start time when `paid`. [src/app/api/bookings/[bookingId]/cancel/route.ts](../../src/app/api/bookings/%5BbookingId%5D/cancel/route.ts)

---

## C) Payments (Terms + Refund/Dispute Policy)
- **Policy decision (partially implemented):** Define when customers are charged and what happens on payment failure/expiry.
  - Evidence (charge only after `accepted`): [src/app/api/bookings/[bookingId]/pay/route.ts](../../src/app/api/bookings/%5BbookingId%5D/pay/route.ts)
  - Evidence (payment failure webhook behavior: no status change): [src/app/api/webhooks/stripe-bookings/route.ts](../../src/app/api/webhooks/stripe-bookings/route.ts)
  - Evidence (payment canceled handling): [src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts)
- **Policy decision (not implemented):** Define platform fee disclosures and how fees are calculated/communicated to users.
  - Evidence (fee basis exists in earnings calculations, but disclosure is policy): [src/app/api/webhooks/stripe-bookings/route.ts](../../src/app/api/webhooks/stripe-bookings/route.ts)
- **Policy decision (not implemented):** Stripe fee treatment (provided): Stripe fees are non-refundable and not absorbed by the platform.

---

## D) Refunds and cancellations (Refund/Dispute Policy)
- **Policy decision (partially implemented):** Refund capability exists on cancellation and on admin dispute resolution, but policy parameters are missing.
  - Evidence (cancel refund mechanics): [src/app/api/bookings/[bookingId]/cancel/route.ts](../../src/app/api/bookings/%5BbookingId%5D/cancel/route.ts)
  - Evidence (admin dispute refund mechanics): [src/app/api/admin/disputes/[disputeId]/resolve/route.ts](../../src/app/api/admin/disputes/%5BdisputeId%5D/resolve/route.ts)
  - Evidence (Connect-aware refund semantics): [src/lib/stripe-refunds.ts](../../src/lib/stripe-refunds.ts)
- **Policy decision (not implemented):** Refund/cancellation policy parameters (provided):
  - Free cancellation up to 24 hours before scheduled start.
  - Late cancellations are non-refundable unless provider fault.
  - No-show outcomes as specified in section B.
  - Stripe fees are non-refundable; not absorbed by platform.
- **Policy decision (not implemented):** Define partial refunds, service quality criteria, and evidence requirements.
- **Policy decision (not implemented):** Define who can authorize refunds (customer self-serve vs admin only) and under what rules.

---

## E) Disputes and chargebacks (Refund/Dispute Policy)
- **Policy decision (partially implemented):** Admin dispute workflow exists (open → under_review → resolved) and can trigger refunds.
  - Evidence: review/resolve/export endpoints. [src/app/api/admin/disputes/[disputeId]/review/route.ts](../../src/app/api/admin/disputes/%5BdisputeId%5D/review/route.ts), [src/app/api/admin/disputes/[disputeId]/resolve/route.ts](../../src/app/api/admin/disputes/%5BdisputeId%5D/resolve/route.ts), [src/app/api/admin/disputes/export/route.ts](../../src/app/api/admin/disputes/export/route.ts)
- **Policy decision (not implemented):** Customer/provider dispute submission endpoint and process is not evidenced.
- **Policy decision (not implemented):** Dispute initiation policy (provided): both parties may initiate within 7 days; admin-reviewed.
- **Policy decision (not implemented):** Define escalation path, evidence standards, and outcomes (redo, partial refund, credits, removal).

---

## F) Provider payouts and earnings (Terms + Platform Rules)
- **Policy decision (partially implemented):** Earnings are tracked and payouts are attempted after completion confirmation; transfer failures do not block booking completion.
  - Evidence: completion confirmation payout logic. [src/app/api/bookings/[bookingId]/confirm-completion/route.ts](../../src/app/api/bookings/%5BbookingId%5D/confirm-completion/route.ts)
- **Policy decision (not implemented):** Define payout schedules, minimum thresholds, and retry policies.
- **Policy decision (partially implemented):** Payout status mirroring exists, but earnings-to-payout linking is best-effort and depends on balance transaction matching.
  - Evidence: Connect webhook payout linking. [src/app/api/webhooks/stripe-connect/route.ts](../../src/app/api/webhooks/stripe-connect/route.ts)

---

## G) Communications (Email/notifications/messages)
- **Policy decision (partially implemented):** Transactional emails are best-effort; failures do not fail API requests.
  - Evidence: email helper. [src/lib/email.ts](../../src/lib/email.ts)
- **Policy decision (not implemented):** Define marketing communications consent and opt-out.
- **Policy decision (not implemented):** Define moderation rules for messages and uploaded content.

---

## H) Privacy Act 2020: retention, access, deletion, and cross-border
- **Policy decision (not implemented):** Retention schedule (provided):
  - Financial records: 7 years.
  - KYC: active duration + 12 months.
  - Messages: 2 years.
  - Logs: 30–90 days.
- **Policy decision (not implemented):** Define user rights workflows: access requests, correction, deletion requests, and identity verification for requests.
- **Policy decision (not implemented):** Define data breach response process and notification thresholds.
- **Policy decision (not implemented):** Define cross-border disclosure and safeguards for processors (Clerk, Stripe, Sumsub, R2, Resend, Neon, Sentry, Vercel).

Evidence (data classes exist):
- Schema: [src/db/schema.ts](../../src/db/schema.ts)
- Upload endpoints: [src/app/api/uploads/presign-identity-document/route.ts](../../src/app/api/uploads/presign-identity-document/route.ts)

---

## I) Security and operational controls
- **Policy decision (partially implemented):** Rate limiting exists on selected endpoints; define coverage requirements and incident response.
  - Evidence: booking create/cancel rate limiting. [src/app/api/bookings/create/route.ts](../../src/app/api/bookings/create/route.ts), [src/app/api/bookings/[bookingId]/cancel/route.ts](../../src/app/api/bookings/%5BbookingId%5D/cancel/route.ts)
- **Policy decision (not implemented):** Define audit log retention and admin access controls beyond role checks.

---

## J) Pricing, GST and tax
- **Policy decision (partially implemented):** GST flags exist on `services`/`providers`.
  - Evidence: schema columns `chargesGst`. [src/db/schema.ts](../../src/db/schema.ts)
- **Policy decision (not implemented):** Decide and document GST assumptions, who is supplier-of-record, invoicing approach, and platform fee tax treatment.
