# Job Requests V1.5 Manual Test Checklist

## 1) Setup
- Run migrations including `0047_job_requests_v15.sql`.
- Ensure env vars are set: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FULL_PAYMENT_MODE` (optional).
- Ensure provider has a valid Stripe Connect account ID (`acct_...`).
- Ensure at least one customer user and one provider user exist.

## 2) Customer creates and views job
- Create a job via `POST /api/job-requests/create`.
- Open `/customer/jobs/[id]`.
- Confirm details card renders.
- Confirm quotes panel and Public Q&A section render on mobile and desktop.

## 3) Provider submits quote
- Open `/provider/job-requests` and `/provider/job-requests/[id]`.
- Submit quote with amount, availability, included, excluded.
- Verify unique quote per provider per job (second submit updates existing quote).
- Verify customer page displays quote and smart badges.

## 4) Accept quote + initial payment intent
- As customer, click `Accept & Pay`.
- Verify API creates PaymentIntent with metadata:
  - `job_request_id`
  - `quote_id`
  - `payment_type`
- Verify `job_requests` stores `accepted_quote_id`, `total_price`, `deposit_amount`, `remaining_amount`.
- Verify duplicate accept does not create duplicate pending intents.

## 5) Webhook safety on success
- Trigger `payment_intent.succeeded` for deposit/full payment intent.
- Verify webhook signature validation passes.
- Verify server (not client redirect) updates:
  - `job_requests.status = assigned`
  - `job_requests.payment_status = deposit_paid` or `fully_paid`
  - accepted quote marked `accepted`
  - all other quotes marked `rejected`
  - conversation exists between customer and provider

## 6) Provider lifecycle
- As assigned provider, click `Mark In Progress`.
- Verify `job_requests.status = in_progress`.
- Click `Mark Completed`.
- If `FULL_PAYMENT_MODE=true`, verify status moves to `closed`.
- If deposit mode, verify status moves to `completed` and UI shows `Awaiting Final Payment`.

## 7) Remaining balance flow (deposit mode)
- As customer, click `Pay Remaining Balance`.
- Verify remainder PaymentIntent created with `payment_type = remainder`.
- Trigger `payment_intent.succeeded` for remainder.
- Verify:
  - `job_requests.payment_status = fully_paid`
  - `job_requests.status = closed`

## 8) Cancellation + refunds
- Customer cancels while `open`:
  - Verify `status = cancelled`, no refund attempt.
- Customer/provider cancels while `assigned` and not `in_progress`:
  - Verify refund API call to Stripe using original payment intent.
  - Verify `job_requests.payment_status = refunded`, `status = cancelled`.
- Cancel while `in_progress`:
  - Verify API returns admin-review required (no auto-refund).

## 9) Admin refund endpoint
- Call `POST /api/admin/job-requests/[jobId]/refund` as admin.
- Verify refund created in Stripe.
- Verify full refund sets `payment_status = refunded` and cancels job.
- Verify partial refund sets `payment_status = partially_refunded`.

## 10) Security checks
- Provider cannot call accept endpoint successfully.
- Customer cannot accept quotes for jobs they do not own.
- Provider lifecycle endpoint only works for assigned provider user.
- Webhook is the only path that sets paid statuses from Stripe events.
- Replayed webhook events remain idempotent.

## 11) Responsive checks
- Verify `/customer/jobs/[id]` and provider routes at widths:
  - `375px`
  - `768px`
  - `1024px`
  - `1440px`
- Confirm mobile sticky CTA renders on customer job page.
- Confirm desktop comparison uses two-column layout.
