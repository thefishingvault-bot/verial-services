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

