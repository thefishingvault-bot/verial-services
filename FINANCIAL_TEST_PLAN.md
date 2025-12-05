# Financial Flows E2E Test Plan

## Scope
Covers bookings → earnings → payouts → admin reporting. Focus on Stripe Connect, GST/fees math, and permissions.

## Environments & Data
- Env: Staging with Stripe test mode.
- Seed: at least 2 providers (one GST on/off), 1 admin, 2 customers.
- Configure `PLATFORM_FEE_BPS`, `GST_BPS`, webhook secrets, and Connect redirect URLs.

## Happy Paths
1. **Provider Onboarding**
   - Start from provider dashboard banner, generate Connect link, complete onboarding.
   - Assert provider `chargesEnabled/payoutsEnabled` true; payouts page loads balances.
2. **Booking Pay -> Earnings Row**
   - Customer books + pays service; webhook fires.
   - Assert `provider_earnings` row created with gross/fee/gst/net matching calculator; status `awaiting_payout`.
3. **Payout Sync**
   - Trigger payout sync (provider payouts API); payouts recorded; earnings linked to payout id; earnings status `paid_out`.
4. **Admin Fees Dashboard**
   - Admin hits fees page with date range; daily table shows booking; summary totals match earnings; CSV download works.
5. **Provider Tax Doc**
   - Call `/api/provider/earnings/tax-doc?year=<current>`; totals/ monthly match earnings; payouts reflect paid-only sums.

## Edge / Negative
6. **Cancel Before Payment**
   - Cancel booking pre-payment; no earnings row; admin fees remains unchanged.
7. **Refund Flow**
   - Simulate refund; earnings status becomes `refunded`; admin fees should exclude refunded amounts; audit log captures mismatch if not.
8. **KYC Gate**
   - Set provider kycStatus not verified; ensure payouts page shows gating; audit endpoint logs issue for earnings with awaiting/paid_out when KYC not verified.
9. **Partial Onboarding**
   - Provider stops onboarding; banner shows pending; create-link regenerates; payouts disabled.
10. **Permissions**
    - Non-admin blocked from admin fees, audit, and financial routes; unauth provider blocked from earnings/tax.

## Observability & Audit
- Verify financial audit endpoint logs discrepancies for missing earnings, fee/gst/net mismatches.
- Check Sentry logs for webhook failures.

## Tools
- Stripe CLI for webhook replay and payout creation.
- DB queries on `provider_earnings`, `provider_payouts`, `financial_audit_logs` for verification.
