// supabase/functions/stripe-refund/index.ts
//
// Issues refund for a Stripe PaymentIntent. Called from intake-clearance
// on MD rejection, or manually from admin UI for cancellations.
//
// Body: { payment_intent_id, amount?, reason?, metadata? }
//   amount (optional) — partial refund in cents; defaults to full
//   reason — stripe refund reason: duplicate | fraudulent | requested_by_customer

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { payment_intent_id, amount, reason = "requested_by_customer", metadata = {} } = await req.json();

    if (!payment_intent_id) {
      return new Response(JSON.stringify({ error: "payment_intent_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build Stripe refund request.
    // Our charges are destination charges to the clinic's connected account with
    // a platform application fee. On refund we must (a) reverse the transfer so
    // the funds come back from the clinic and (b) refund the application fee
    // proportionally, otherwise the platform keeps a fee on a refunded charge and
    // the books are wrong. Both default on; pass reverse_transfer:false /
    // refund_application_fee:false in metadata-free args to override if ever needed.
    const params = new URLSearchParams();
    params.append("payment_intent", payment_intent_id);
    params.append("reason", reason);
    if (amount) params.append("amount", String(amount));
    params.append("reverse_transfer", "true");
    params.append("refund_application_fee", "true");
    for (const [k, v] of Object.entries(metadata)) {
      params.append(`metadata[${k}]`, String(v));
    }

    const resp = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const refund = await resp.json();

    if (!resp.ok) {
      console.error("Stripe refund failed:", refund);
      return new Response(JSON.stringify({ error: refund?.error?.message || "Refund failed", stripe_error: refund }), {
        status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log to audit (best-effort)
    try {
      await admin.from("audit_logs").insert({
        resource_type: "stripe_refund",
        resource_id: refund.id,
        action: "refund_issued",
        details: {
          payment_intent_id,
          amount: refund.amount,
          status: refund.status,
          metadata,
        },
      });
    } catch { /* best-effort */ }

    return new Response(JSON.stringify({
      refund_id: refund.id,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[stripe-refund] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
