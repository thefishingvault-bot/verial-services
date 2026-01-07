import Stripe from "stripe";

let stripeSecretKey = process.env.STRIPE_SECRET_KEY;

// Unit tests import modules that reference Stripe, but don't need a real key.
// Avoid throwing at import-time in test environments.
if (!stripeSecretKey) {
  const isTest = process.env.NODE_ENV === "test" || !!process.env.VITEST;
  if (isTest) {
    stripeSecretKey = "sk_test_dummy";
  } else {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }
}

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-10-29.clover", // Use a recent, fixed API version
  typescript: true,
});

export type StripeMode = "test" | "live";

export function detectStripeMode(secretKey: string | undefined = process.env.STRIPE_SECRET_KEY): StripeMode {
  if (!secretKey) return "test";
  if (secretKey.startsWith("sk_live")) return "live";
  return "test";
}

export async function resolveActivePriceIdByLookupKey(lookupKey: string): Promise<string | null> {
  const res = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
    expand: ["data.product"],
  });
  return res.data[0]?.id ?? null;
}

export async function retrieveStripePriceSafe(priceId: string): Promise<Stripe.Price | null> {
  try {
    return await stripe.prices.retrieve(priceId);
  } catch {
    return null;
  }
}

