import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { appointment_id } = await req.json();
    if (!appointment_id) throw new Error("appointment_id required");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [aptRes, encounterRes, consentsRes, invoicesRes] = await Promise.all([
      sb.from("appointments").select("*, patients(first_name, last_name), treatments(name)").eq("id", appointment_id).single(),
      sb.from("encounters").select("id, status, signed_at, signed_by").eq("appointment_id", appointment_id).limit(1).maybeSingle(),
      sb.from("patient_consents").select("id, status").eq("appointment_id", appointment_id),
      sb.from("invoices").select("id, status, balance_due").eq("appointment_id", appointment_id),
    ]);

    const apt = aptRes.data;
    const encounter = encounterRes.data;
    const consents = consentsRes.data || [];
    const invoices = invoicesRes.data || [];

    // Build checklist
    const openItems: { item: string; severity: "warning" | "critical"; resolved: boolean }[] = [];

    // Check unsigned encounter
    if (encounter && !encounter.signed_at) {
      openItems.push({ item: "Encounter chart not signed", severity: "critical", resolved: false });
    }
    if (!encounter) {
      openItems.push({ item: "No encounter record found for this appointment", severity: "warning", resolved: false });
    }

    // Check unsigned consents
    const pendingConsents = consents.filter(c => c.status === "pending");
    if (pendingConsents.length > 0) {
      openItems.push({ item: `${pendingConsents.length} consent form(s) pending signature`, severity: "critical", resolved: false });
    }

    // Check unpaid invoices
    const unpaidInvoices = invoices.filter(i => i.status !== "paid" && (i.balance_due ?? 0) > 0);
    if (unpaidInvoices.length > 0) {
      const totalDue = unpaidInvoices.reduce((s, i) => s + (i.balance_due || 0), 0);
      openItems.push({ item: `Outstanding balance: $${totalDue.toFixed(2)}`, severity: "warning", resolved: false });
    }
    if (invoices.length === 0) {
      openItems.push({ item: "No invoice created for this visit", severity: "warning", resolved: false });
    }

    // AI follow-up suggestion
    let followUpSuggestion = "Schedule follow-up per treatment protocol";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY && apt) {
      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{
              role: "user",
              content: `Patient ${apt.patients?.first_name} ${apt.patients?.last_name} just completed a ${apt.treatments?.name || "general"} visit. Suggest a follow-up timeframe in one sentence (e.g. "Schedule follow-up in 2 weeks for re-evaluation"). Be specific to the treatment type.`,
            }],
          }),
        });
        if (aiRes.ok) {
          const d = await aiRes.json();
          followUpSuggestion = d.choices?.[0]?.message?.content || followUpSuggestion;
        }
      } catch { /* graceful degradation */ }
    }

    const canCheckout = openItems.filter(i => i.severity === "critical").length === 0;

    return new Response(JSON.stringify({
      open_items: openItems,
      can_checkout: canCheckout,
      follow_up_suggestion: followUpSuggestion,
      patient_name: apt ? `${apt.patients?.first_name} ${apt.patients?.last_name}` : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-checkout-review error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
