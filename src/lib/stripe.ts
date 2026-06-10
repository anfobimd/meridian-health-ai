import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Publishable key is safe to ship to the client. Set VITE_STRIPE_PUBLISHABLE_KEY
// in the environment; when absent, getStripe() returns null and payment UIs
// render a "not configured" state instead of crashing.
const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> | null {
  if (!PUBLISHABLE_KEY) return null;
  if (!stripePromise) stripePromise = loadStripe(PUBLISHABLE_KEY);
  return stripePromise;
}

export const stripeConfigured = (): boolean => !!PUBLISHABLE_KEY;
