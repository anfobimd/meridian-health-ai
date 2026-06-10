// supabase/functions/checkout-charge/index.ts
//
// Charge an invoice balance by card at checkout (P0-9) — a destination charge
// to the clinic's connected account with the platform application fee deducted.
// Returns a PaymentIntent client_secret; the front desk confirms it with the
// Payment Element. The stripe-webhook reconciles success and marks the invoice
// paid — this function never marks anything paid on its own.
//
// Requires the clinic to be Connect-enabled (charges_enabled). Staff only.

import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    if (!Deno.env.get("STRIPE_SECRET_KEY")) return json({ error: "Stripe is not configured" }, 503);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const { invoice_id, amount } = await req.json();
    if (!invoice_id) return json({ error: "invoice_id required" }, 400);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: inv, error: invErr } = await admin
      .from("invoices")
      .select("id, patient_id, appointment_id, clinic_id, total, balance_due")
      .eq("id", invoice_id)
      .single();
    if (invErr || !inv) return json({ error: "Invoice not found" }, 404);

    // Resolve clinic: from invoice, else from the appointment.
    let clinicId: string | null = inv.clinic_id;
    if (!clinicId && inv.appointment_id) {
      const { data: appt } = await admin.from("appointments").select("clinic_id").eq("id", inv.appointment_id).maybeSingle();
      clinicId = appt?.clinic_id ?? null;
    }
    if (!clinicId) return json({ error: "Invoice has no clinic — cannot route payment" }, 422);

    const { data: clinic } = await admin
      .from("clinics")
      .select("stripe_account_id, stripe_charges_enabled, platform_fee_percent")
      .eq("id", clinicId)
      .maybeSingle();
    if (!clinic?.stripe_account_id || !clinic?.stripe_charges_enabled) {
      return json({ error: "This clinic cannot accept card payments yet (Stripe onboarding incomplete)." }, 422);
    }

    const chargeAmount = Number(amount ?? inv.balance_due ?? inv.total ?? 0);
    if (!(chargeAmount > 0)) return json({ error: "Nothing to charge" }, 422);

    const feePct = Number(clinic.platform_fee_percent) || 0;
    const applicationFee = Math.round(chargeAmount * (feePct / 100) * 100);

    const pi = await stripe.paymentIntents.create({
      amount: Math.round(chargeAmount * 100),
      currency: "usd",
      transfer_data: { destination: clinic.stripe_account_id },
      ...(applicationFee > 0 ? { application_fee_amount: applicationFee } : {}),
      metadata: {
        kind: "balance",
        invoice_id: inv.id,
        patient_id: inv.patient_id ?? "",
        appointment_id: inv.appointment_id ?? "",
        clinic_id: clinicId,
      },
    });

    return json({ client_secret: pi.client_secret, payment_intent_id: pi.id, amount: chargeAmount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("checkout-charge error:", msg);
    return json({ error: msg }, 500);
  }
});
