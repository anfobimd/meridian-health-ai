// supabase/functions/stripe-webhook/index.ts
//
// Signed Stripe webhook — the single source of truth for payment state (P0-7).
// Client-side confirmations are only hints; nothing is marked paid/refunded
// until the matching event arrives here and verifies.
//
// Handles:
//   payment_intent.succeeded        → deposit/balance marked paid; payments row
//   payment_intent.payment_failed   → deposit/payment marked failed
//   charge.refunded                 → payment marked refunded
//   account.updated                 → clinic Connect status synced
//
// Idempotent: every event id is recorded in stripe_webhook_events; replays
// short-circuit. Requires STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET.

import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const body = await req.text();

  if (!signature || !webhookSecret) {
    return new Response(JSON.stringify({ error: "Missing signature or webhook secret" }), { status: 400 });
  }

  // Verify signature — reject anything unsigned/tampered.
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    console.error("Webhook signature verification failed:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Idempotency — record-or-skip. Insert fails on replay (PK conflict).
  const { error: dedupeErr } = await admin
    .from("stripe_webhook_events")
    .insert({ id: event.id, type: event.type, payload: event.data.object as any });
  if (dedupeErr) {
    // Already processed (or a transient insert error) — ack so Stripe stops retrying.
    console.log(`Event ${event.id} already processed or insert failed: ${dedupeErr.message}`);
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const md = pi.metadata || {};
        const amount = (pi.amount_received ?? pi.amount ?? 0) / 100;
        const appFee = pi.application_fee_amount != null ? pi.application_fee_amount / 100 : null;
        const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge as any)?.id ?? null;

        if (md.kind === "deposit" && md.appointment_id) {
          await admin.from("appointments")
            .update({ deposit_status: "paid", deposit_payment_intent_id: pi.id })
            .eq("id", md.appointment_id);
        }

        // Upsert a payments row keyed on the PaymentIntent (unique index).
        await admin.from("payments").upsert({
          patient_id: md.patient_id || null,
          appointment_id: md.appointment_id || null,
          invoice_id: md.invoice_id || null,
          amount,
          method: "credit_card",
          status: "succeeded",
          stripe_payment_intent_id: pi.id,
          stripe_charge_id: chargeId,
          application_fee_amount: appFee,
          reference_number: md.confirmation_code || null,
        }, { onConflict: "stripe_payment_intent_id" });

        // If this settled an invoice balance, mark the invoice paid.
        if (md.kind === "balance" && md.invoice_id) {
          const { data: inv } = await admin.from("invoices").select("total").eq("id", md.invoice_id).maybeSingle();
          await admin.from("invoices").update({
            amount_paid: inv?.total ?? amount,
            balance_due: 0,
            status: "paid",
          }).eq("id", md.invoice_id);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const md = pi.metadata || {};
        if (md.kind === "deposit" && md.appointment_id) {
          await admin.from("appointments").update({ deposit_status: "failed" }).eq("id", md.appointment_id);
        }
        await admin.from("payments")
          .upsert({
            patient_id: md.patient_id || null,
            appointment_id: md.appointment_id || null,
            invoice_id: md.invoice_id || null,
            amount: (pi.amount ?? 0) / 100,
            method: "credit_card",
            status: "failed",
            stripe_payment_intent_id: pi.id,
          }, { onConflict: "stripe_payment_intent_id" });
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent as any)?.id;
        const fullyRefunded = charge.amount_refunded >= charge.amount;
        if (piId) {
          await admin.from("payments")
            .update({ status: fullyRefunded ? "refunded" : "partially_refunded" })
            .eq("stripe_payment_intent_id", piId);
          // Reflect deposit refunds back on the appointment.
          await admin.from("appointments")
            .update({ deposit_status: "refunded" })
            .eq("deposit_payment_intent_id", piId);
        }
        break;
      }

      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        const due = acct.requirements?.currently_due ?? [];
        const status = acct.charges_enabled && acct.payouts_enabled
          ? "complete"
          : (acct.details_submitted ? "pending" : "in_progress");
        await admin.from("clinics").update({
          stripe_charges_enabled: !!acct.charges_enabled,
          stripe_payouts_enabled: !!acct.payouts_enabled,
          stripe_onboarding_status: status,
          stripe_requirements_due: due as any,
        }).eq("stripe_account_id", acct.id);
        break;
      }

      default:
        // Unhandled event types are acked without action.
        break;
    }
  } catch (err) {
    console.error(`Error handling ${event.type} (${event.id}):`, err instanceof Error ? err.message : err);
    // Roll back the dedupe record so Stripe retries this event.
    await admin.from("stripe_webhook_events").delete().eq("id", event.id);
    return new Response(JSON.stringify({ error: "Handler error" }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
