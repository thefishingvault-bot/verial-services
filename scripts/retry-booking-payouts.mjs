import process from "node:process";
import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";

function isBalanceInsufficientStripeError(error) {
  const code = typeof error?.code === "string" ? error.code : typeof error?.raw?.code === "string" ? error.raw.code : null;
  if (code === "balance_insufficient") return true;

  const message =
    typeof error?.message === "string"
      ? error.message
      : typeof error?.raw?.message === "string"
        ? error.raw.message
        : null;
  if (!message) return false;
  return message.toLowerCase().includes("insufficient available funds");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  if (!process.env.DATABASE_URL) fail("Missing DATABASE_URL env var.");
  if (!process.env.STRIPE_SECRET_KEY) fail("Missing STRIPE_SECRET_KEY env var.");

  const sql = neon(process.env.DATABASE_URL);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-10-29.clover" });

  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const parsedLimit = limitArg ? Number(limitArg.split("=")[1]) : 20;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 20;

  const rows = await sql(
    `
      select
        pe.id as "earningsId",
        pe.booking_id as "bookingId",
        pe.provider_id as "providerId",
        pe.net_amount as "netAmount",
        pe.currency as "currency",
        pe.stripe_transfer_id as "stripeTransferId",
        pe.status as "status",
        p.stripe_connect_id as "connectId"
      from provider_earnings pe
      join providers p on p.id = pe.provider_id
      where pe.status = 'awaiting_payout'
        and pe.stripe_transfer_id is null
      order by pe.updated_at asc
      limit ${limit}
    `,
  );

  console.log(`[retry-booking-payouts] Found ${rows.length} awaiting payouts (limit=${limit})`);

  let succeeded = 0;
  let queued = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.connectId) {
      console.warn("[retry-booking-payouts] Missing connectId; skipping", {
        earningsId: row.earningsId,
        bookingId: row.bookingId,
        providerId: row.providerId,
      });
      failed += 1;
      continue;
    }

    try {
      const transfer = await stripe.transfers.create(
        {
          amount: row.netAmount,
          currency: row.currency ?? "nzd",
          destination: row.connectId,
          transfer_group: row.bookingId,
          metadata: {
            bookingId: row.bookingId,
            providerId: row.providerId,
            earningsId: row.earningsId,
            reason: "retry_payout",
          },
        },
        { idempotencyKey: `payout_${row.earningsId}` },
      );

      await sql(
        `
          update provider_earnings
          set status = 'paid_out',
              stripe_transfer_id = $1,
              transferred_at = now(),
              updated_at = now()
          where id = $2
        `,
        [transfer.id, row.earningsId],
      );

      console.log("[retry-booking-payouts] Paid out", {
        earningsId: row.earningsId,
        bookingId: row.bookingId,
        transferId: transfer.id,
      });
      succeeded += 1;
    } catch (error) {
      if (isBalanceInsufficientStripeError(error)) {
        console.warn("[retry-booking-payouts] Still balance_insufficient; keeping queued", {
          earningsId: row.earningsId,
          bookingId: row.bookingId,
          providerId: row.providerId,
        });
        queued += 1;
        continue;
      }

      console.error("[retry-booking-payouts] Transfer failed", {
        earningsId: row.earningsId,
        bookingId: row.bookingId,
        providerId: row.providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      failed += 1;
    }
  }

  console.log(`[retry-booking-payouts] Done. succeeded=${succeeded} queued=${queued} failed=${failed}`);
}

main().catch((error) => {
  console.error("[retry-booking-payouts] Fatal", error);
  process.exit(1);
});
