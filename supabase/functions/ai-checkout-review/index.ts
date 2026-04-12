import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { appointment_id, mode } = body;
    if (!appointment_id) throw new Error("appointment_id required");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [aptRes, encounterRes, consentsRes, invoicesRes] = await Promise.all([
      sb.from("appointments").select("*, patients(id, first_name, last_name, phone, email), treatments(name, price, category)").eq("id", appointment_id).single(),
      sb.from("encounters").select("id, status, signed_at, signed_by, encounter_type, chief_complaint").eq("appointment_id", appointment_id).limit(1).maybeSingle(),
      sb.from("patient_consents").select("id, status").eq("appointment_id", appointment_id),
      sb.from("invoices").select("id, status, balance_due, total_amount").eq("appointment_id", appointment_id),
    ]);

    const apt = aptRes.data;
    const encounter = encounterRes.data;
    const consents = consentsRes.data || [];
    const invoices = invoicesRes.data || [];

    // ── MODE: telehealth_summary ──
    if (mode === "telehealth_summary") {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      // Gather SOAP notes + prescriptions from this visit
      const [noteRes, rxRes] = await Promise.all([
        sb.from("clinical_notes").select("subjective, objective, assessment, plan").eq("appointment_id", appointment_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        encounter?.id
          ? sb.from("prescriptions").select("medication_name, dosage, frequency, route, notes").eq("encounter_id", encounter.id)
          : Promise.resolve({ data: [] }),
      ]);

      const note = noteRes.data;
      const prescriptions = (rxRes as any).data || [];

      const prompt = `You are a clinical documentation AI. Generate a concise telehealth visit summary for a patient.

Patient: ${apt?.patients?.first_name} ${apt?.patients?.last_name}
Visit type: Telehealth
Treatment: ${apt?.treatments?.name || "General"}
Chief complaint: ${encounter?.chief_complaint || "Not specified"}

SOAP Notes:
S: ${note?.subjective || "Not documented"}
O: ${note?.objective || "Not documented"}
A: ${note?.assessment || "Not documented"}
P: ${note?.plan || "Not documented"}

Prescriptions written during visit: ${prescriptions.length > 0 ? prescriptions.map((rx: any) => `${rx.medication_name} ${rx.dosage || ""} ${rx.frequency || ""} ${rx.route || ""}`).join("; ") : "None"}

Generate a structured visit summary with:
1. visit_summary: 2-3 sentence overview
2. prescriptions_summary: List of medications prescribed with dosing
3. follow_up_recommendation: Specific follow-up timing and what to monitor
4. patient_instructions: 3-5 bullet points for the patient
5. follow_up_days: number of days until recommended follow-up`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: prompt }],
          tools: [{
            type: "function",
            function: {
              name: "telehealth_summary",
              description: "Return structured telehealth visit summary",
              parameters: {
                type: "object",
                properties: {
                  visit_summary: { type: "string" },
                  prescriptions_summary: { type: "string" },
                  follow_up_recommendation: { type: "string" },
                  patient_instructions: { type: "array", items: { type: "string" } },
                  follow_up_days: { type: "number" },
                },
                required: ["visit_summary", "follow_up_recommendation", "follow_up_days"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "telehealth_summary" } },
        }),
      });

      if (!aiRes.ok) {
        if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (aiRes.status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`AI error: ${aiRes.status}`);
      }

      const aiData = await aiRes.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      const summary = toolCall ? JSON.parse(toolCall.function.arguments) : { visit_summary: "Unable to generate", follow_up_days: 14 };

      return new Response(JSON.stringify(summary), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── DEFAULT MODE: checkout review ──
    const openItems: { item: string; severity: "warning" | "critical"; resolved: boolean }[] = [];

    if (encounter && !encounter.signed_at) {
      openItems.push({ item: "Encounter chart not signed", severity: "critical", resolved: false });
    }
    if (!encounter) {
      openItems.push({ item: "No encounter record found for this appointment", severity: "warning", resolved: false });
    }

    const pendingConsents = consents.filter((c: any) => c.status === "pending");
    if (pendingConsents.length > 0) {
      openItems.push({ item: `${pendingConsents.length} consent form(s) pending signature`, severity: "critical", resolved: false });
    }

    const unpaidInvoices = invoices.filter((i: any) => i.status !== "paid" && (i.balance_due ?? 0) > 0);
    if (unpaidInvoices.length > 0) {
      const totalDue = unpaidInvoices.reduce((s: number, i: any) => s + (i.balance_due || 0), 0);
      openItems.push({ item: `Outstanding balance: $${totalDue.toFixed(2)}`, severity: "warning", resolved: false });
    }
    if (invoices.length === 0) {
      openItems.push({ item: "No invoice created for this visit", severity: "warning", resolved: false });
    }

    // payment_suggestions mode
    let paymentSuggestions: any[] = [];
    if (mode === "payment_suggestions" && apt?.patients?.id) {
      const patientId = apt.patients.id;
      const treatmentName = apt.treatments?.name || "";
      const treatmentCategory = apt.treatments?.category || "";

      const { data: packages } = await sb.from("patient_package_purchases")
        .select("id, package_name, sessions_total, sessions_used, expires_at")
        .eq("patient_id", patientId)
        .eq("status", "active")
        .gt("sessions_total", 0);

      const applicablePackages = (packages || []).filter((p: any) => {
        const remaining = p.sessions_total - (p.sessions_used || 0);
        if (remaining <= 0) return false;
        const pkgName = p.package_name?.toLowerCase() || "";
        return pkgName.includes(treatmentName.toLowerCase()) || pkgName.includes(treatmentCategory.toLowerCase()) || treatmentName.toLowerCase().includes(pkgName.split(" ")[0]);
      });

      for (const pkg of applicablePackages) {
        const remaining = pkg.sessions_total - (pkg.sessions_used || 0);
        paymentSuggestions.push({ type: "package_credit", label: `Apply ${pkg.package_name} credit (${remaining} sessions remaining)`, package_id: pkg.id, remaining_sessions: remaining, expires_at: pkg.expires_at });
      }

      const { data: memberships } = await sb.from("patient_memberships")
        .select("id, membership_name, discount_percent, status")
        .eq("patient_id", patientId)
        .eq("status", "active");

      for (const m of (memberships || [])) {
        paymentSuggestions.push({ type: "membership_discount", label: `Member discount: ${m.discount_percent || 10}% off (${m.membership_name})`, membership_id: m.id, discount_percent: m.discount_percent || 10 });
      }
    }

    // AI follow-up suggestion
    let followUpSuggestion = "Schedule follow-up per treatment protocol";
    let followUpDays: number | null = null;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY && apt) {
      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{ role: "user", content: `Patient ${apt.patients?.first_name} ${apt.patients?.last_name} completed a ${apt.treatments?.name || "general"} visit. Respond in JSON: {"suggestion":"one sentence follow-up recommendation","days":number}. Be specific.` }],
            response_format: { type: "json_object" },
          }),
        });
        if (aiRes.ok) {
          const d = await aiRes.json();
          try {
            const parsed = JSON.parse(d.choices?.[0]?.message?.content || "");
            followUpSuggestion = parsed.suggestion || followUpSuggestion;
            followUpDays = parsed.days || null;
          } catch { /* graceful */ }
        }
      } catch { /* graceful */ }
    }

    const canCheckout = openItems.filter(i => i.severity === "critical").length === 0;

    return new Response(JSON.stringify({
      open_items: openItems,
      can_checkout: canCheckout,
      follow_up_suggestion: followUpSuggestion,
      follow_up_days: followUpDays,
      patient_name: apt ? `${apt.patients?.first_name} ${apt.patients?.last_name}` : null,
      patient_id: apt?.patients?.id || null,
      payment_suggestions: paymentSuggestions,
      invoice_summary: {
        total: invoices.reduce((s: number, i: any) => s + (i.total_amount || 0), 0),
        balance_due: unpaidInvoices.reduce((s: number, i: any) => s + (i.balance_due || 0), 0),
        invoice_count: invoices.length,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-checkout-review error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
