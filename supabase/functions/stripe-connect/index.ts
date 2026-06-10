// supabase/functions/stripe-connect/index.ts
//
// Clinic Stripe Connect (Express) onboarding (P0-6).
//
// Actions:
//   "onboard" { clinic_id, return_url, refresh_url }
//       → creates an Express connected account for the clinic if it doesn't
//         have one, stores stripe_account_id, and returns a Stripe-hosted
//         onboarding URL to redirect to.
//   "status"  { clinic_id }
//       → retrieves the account and syncs charges_enabled / payouts_enabled /
//         onboarding_status / requirements_due onto the clinic.
//
// Caller must be a staff member who can manage the clinic (checked via the
// user_can_manage_clinic RPC under the caller's JWT). Requires STRIPE_SECRET_KEY.

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    if (!Deno.env.get("STRIPE_SECRET_KEY")) return json({ error: "Stripe is not configured" }, 503);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller and that they can manage this clinic (under their JWT).
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const { action, clinic_id, return_url, refresh_url } = await req.json();
    if (!clinic_id) return json({ error: "clinic_id required" }, 400);

    const { data: canManage } = await userClient.rpc("user_can_manage_clinic", { p_clinic_id: clinic_id });
    if (!canManage) return json({ error: "You do not have permission to manage this clinic" }, 403);

    const admin = createClient(url, serviceKey);
    const { data: clinic, error: clinicErr } = await admin
      .from("clinics")
      .select("id, name, email, stripe_account_id")
      .eq("id", clinic_id)
      .single();
    if (clinicErr || !clinic) return json({ error: "Clinic not found" }, 404);

    if (action === "status") {
      if (!clinic.stripe_account_id) return json({ connected: false, onboarding_status: "not_started" });
      const acct = await stripe.accounts.retrieve(clinic.stripe_account_id);
      const due = acct.requirements?.currently_due ?? [];
      const status = acct.charges_enabled && acct.payouts_enabled
        ? "complete" : (acct.details_submitted ? "pending" : "in_progress");
      await admin.from("clinics").update({
        stripe_charges_enabled: !!acct.charges_enabled,
        stripe_payouts_enabled: !!acct.payouts_enabled,
        stripe_onboarding_status: status,
        stripe_requirements_due: due as any,
      }).eq("id", clinic_id);
      return json({
        connected: true,
        charges_enabled: !!acct.charges_enabled,
        payouts_enabled: !!acct.payouts_enabled,
        onboarding_status: status,
        requirements_due: due,
      });
    }

    // action === "onboard"
    let accountId = clinic.stripe_account_id as string | null;
    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: "express",
        email: clinic.email || undefined,
        business_type: "company",
        metadata: { clinic_id: clinic.id, clinic_name: clinic.name ?? "" },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      });
      accountId = acct.id;
      await admin.from("clinics").update({
        stripe_account_id: accountId,
        stripe_onboarding_status: "in_progress",
      }).eq("id", clinic_id);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      return_url: return_url || `${url}`,
      refresh_url: refresh_url || return_url || `${url}`,
      type: "account_onboarding",
    });

    return json({ url: link.url, account_id: accountId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("stripe-connect error:", msg);
    return json({ error: msg }, 500);
  }
});
