import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { chatCompletion } from "../_shared/bedrock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const mode = body.mode || "coaching";
    const provider_id = body.provider_id;
    if (!provider_id) throw new Error("provider_id required");

    // ─── DAY BRIEF MODE ───
    if (mode === "day_brief") {
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

      // Fetch today's appointments with patient data
      const { data: apts } = await supabase
        .from("appointments")
        .select("*, patients(first_name, last_name, allergies, medications, date_of_birth, last_visit_at), treatments(name, category)")
        .eq("provider_id", provider_id)
        .gte("scheduled_at", todayStart)
        .lt("scheduled_at", todayEnd)
        .not("status", "in", '("cancelled","no_show")')
        .order("scheduled_at", { ascending: true });

      // Fetch overdue charts
      const { data: overdue } = await supabase
        .from("encounters")
        .select("id, chief_complaint, created_at")
        .eq("provider_id", provider_id)
        .eq("status", "in_progress")
        .lt("created_at", todayStart);

      // Fetch pending MD corrections
      const { data: corrections } = await supabase
        .from("chart_review_records")
        .select("id, md_comment")
        .eq("provider_id", provider_id)
        .eq("status", "corrected");

      const schedule = (apts || []).map((a: any, i: number) => {
        const p = a.patients;
        const allergyNote = p?.allergies?.length ? `ALLERGIES: ${p.allergies.join(", ")}` : "";
        const medNote = p?.medications?.length ? `MEDS: ${p.medications.join(", ")}` : "";
        const lastVisit = p?.last_visit_at || null;
        const daysSince = lastVisit ? Math.round((Date.now() - new Date(lastVisit).getTime()) / 86400000) : null;
        const lapseNote = daysSince && daysSince > 90 ? `LAPSED (${daysSince} days since last visit)` : "";
        return `${i + 1}. ${p?.first_name} ${p?.last_name} — ${a.treatments?.name || "General"}. ${allergyNote} ${medNote} ${lapseNote}`.trim();
      }).join("\n");

      const overdueNote = overdue?.length ? `\n\nOVERDUE CHARTS (${overdue.length}): ${overdue.map((o: any) => o.chief_complaint || "Unnamed").join(", ")}` : "";
      const correctionNote = corrections?.length ? `\n\nMD CORRECTIONS PENDING (${corrections.length}): ${corrections.map((c: any) => c.md_comment?.slice(0, 80) || "Review needed").join("; ")}` : "";

      const prompt = `You are an AI clinical assistant for a medical spa. Generate a concise day brief for a provider.

Today's schedule (${(apts || []).length} patients):
${schedule || "No patients scheduled."}
${overdueNote}${correctionNote}

Write 3-5 sentences summarizing key things the provider should know: total patients, any drug interaction risks (aspirin/blood thinners before fillers, etc.), lapsed patients returning, overdue charts, pending MD corrections. Be specific about patient names and concerns. Keep it professional and actionable.`;

      const aiResponse = await chatCompletion({
messages: [
            { role: "system", content: "You are a concise clinical briefing assistant. No markdown formatting. Plain text only." },
            { role: "user", content: prompt },
          ]
        });

      

      const aiData = aiResponse;
      const brief = aiData.choices?.[0]?.message?.content || "No summary available.";

      // Log the call
      const latency = Date.now() - startTime;
      await supabase.from("ai_api_calls").insert({
        function_name: "ai-provider-coach",
        model_used: "google/gemini-3-flash-preview",
        status: "success",
        latency_ms: latency,
        input_tokens: aiData.usage?.prompt_tokens || 0,
        output_tokens: aiData.usage?.completion_tokens || 0,
      });

      return new Response(JSON.stringify({ success: true, brief }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── BIO DRAFT MODE ───
    if (mode === "bio_draft") {
      const ctx = body.context || {};
      const bioPrompt = `Write a concise, professional marketplace bio (2-3 sentences) for a medical aesthetics provider.
Name: ${ctx.first_name || ""} ${ctx.last_name || ""}
Specialty: ${ctx.specialty || "Aesthetic Medicine"}
Credentials: ${ctx.credentials || ""}
Modalities: ${(ctx.modalities || []).join(", ") || "Various aesthetic treatments"}
Tone: Warm, professional, confidence-inspiring. No markdown.`;

      const aiResponse = await chatCompletion({
messages: [
            { role: "system", content: "You are a professional bio writer for healthcare providers. Return only the bio text, no quotes or labels." },
            { role: "user", content: bioPrompt },
          ]
        });

      if (!aiResponse.ok) throw new Error("AI gateway error");
      const aiData = aiResponse;
      const bio = aiData.choices?.[0]?.message?.content || "";

      const latency = Date.now() - startTime;
      await supabase.from("ai_api_calls").insert({
        function_name: "ai-provider-coach",
        model_used: "google/gemini-3-flash-preview",
        status: "success",
        latency_ms: latency,
        input_tokens: aiData.usage?.prompt_tokens || 0,
        output_tokens: aiData.usage?.completion_tokens || 0,
      });

      return new Response(JSON.stringify({ success: true, bio }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── COACHING MODE (original) ───
    const { data: provider } = await supabase
      .from("providers")
      .select("*")
      .eq("id", provider_id)
      .single();
    if (!provider) throw new Error("Provider not found");

    const { data: intel } = await supabase
      .from("ai_provider_intelligence")
      .select("*")
      .eq("provider_id", provider_id)
      .single();

    const { data: corrections } = await supabase
      .from("chart_review_records")
      .select("*, encounters(chief_complaint, encounter_type)")
      .eq("provider_id", provider_id)
      .eq("status", "corrected")
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: existingActions } = await supabase
      .from("coaching_actions")
      .select("*")
      .eq("provider_id", provider_id)
      .eq("is_resolved", false)
      .order("created_at", { ascending: false });

    const { data: promptRow } = await supabase
      .from("ai_prompts")
      .select("system_prompt")
      .eq("prompt_key", "provider_coaching")
      .eq("is_active", true)
      .single();

    const systemPrompt = promptRow?.system_prompt || `You are an AI clinical coaching assistant for a medical spa. Analyze provider performance data and generate coaching recommendations. Return JSON with: { "summary": string, "recurring_issues": string[], "improvement_plan": string[], "recommended_actions": [{ "title": string, "description": string, "action_type": "training"|"review"|"meeting"|"documentation" }], "risk_assessment": "low"|"medium"|"high" }`;

    const userPrompt = `Analyze this provider's performance and generate coaching recommendations:

Provider: ${provider?.first_name} ${provider?.last_name}, ${provider?.credentials || ""}
Specialty: ${provider?.specialty || "General"}
Total Charts Reviewed: ${intel?.total_charts || 0}
Correction Rate: ${((intel?.correction_rate || 0) * 100).toFixed(1)}%
Current Coaching Status: ${intel?.coaching_status || "none"}
Avg Documentation Score: ${intel?.avg_documentation_score || "N/A"}
Current Recurring Issues: ${JSON.stringify(intel?.recurring_issues || [])}

Recent Corrections (last 20):
${(corrections || []).map((c: any) => `- Encounter type: ${c.encounters?.encounter_type || "unknown"}, CC: ${c.encounters?.chief_complaint || "N/A"}, MD comment: ${c.md_comment || "none"}, Details: ${JSON.stringify(c.correction_details || {})}`).join("\n")}

Active Coaching Actions:
${(existingActions || []).map((a: any) => `- [${a.action_type}] ${a.title}: ${a.description || ""}`).join("\n") || "None"}`;

    const aiResponse = await chatCompletion({
messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ]
});

    const aiData = aiResponse;
    const content = aiData.choices?.[0]?.message?.content || "{}";
    const coaching = JSON.parse(content);

    if (coaching.recurring_issues?.length > 0) {
      await supabase
        .from("ai_provider_intelligence")
        .update({
          recurring_issues: coaching.recurring_issues,
          coaching_notes: coaching.summary,
          last_analyzed_at: new Date().toISOString(),
        })
        .eq("provider_id", provider_id);
    }

    if (coaching.recommended_actions?.length > 0) {
      const actions = coaching.recommended_actions.map((a: any) => ({
        provider_id,
        action_type: a.action_type || "note",
        title: a.title,
        description: a.description,
        created_by: "ai",
      }));
      await supabase.from("coaching_actions").insert(actions);
    }

    const latency = Date.now() - startTime;
    await supabase.from("ai_api_calls").insert({
      function_name: "ai-provider-coach",
      model_used: "google/gemini-2.5-flash",
      status: "success",
      latency_ms: latency,
      input_tokens: aiData.usage?.prompt_tokens || 0,
      output_tokens: aiData.usage?.completion_tokens || 0,
    });

    return new Response(JSON.stringify({ success: true, coaching }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const latency = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : "Unknown error";
    await supabase.from("ai_api_calls").insert({
      function_name: "ai-provider-coach",
      status: "error",
      error_message: msg,
      latency_ms: latency,
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});