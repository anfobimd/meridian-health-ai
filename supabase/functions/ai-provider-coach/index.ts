import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { provider_id } = await req.json();
    if (!provider_id) throw new Error("provider_id required");

    // Fetch provider info
    const { data: provider } = await supabase
      .from("providers")
      .select("*")
      .eq("id", provider_id)
      .single();
    if (!provider) throw new Error("Provider not found");

    // Fetch provider intelligence
    const { data: intel } = await supabase
      .from("ai_provider_intelligence")
      .select("*")
      .eq("provider_id", provider_id)
      .single();

    // Fetch recent corrections
    const { data: corrections } = await supabase
      .from("chart_review_records")
      .select("*, encounters(chief_complaint, encounter_type)")
      .eq("provider_id", provider_id)
      .eq("status", "corrected")
      .order("created_at", { ascending: false })
      .limit(20);

    // Fetch existing coaching actions
    const { data: existingActions } = await supabase
      .from("coaching_actions")
      .select("*")
      .eq("provider_id", provider_id)
      .eq("is_resolved", false)
      .order("created_at", { ascending: false });

    // Get AI prompt
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

    // Call AI
    const aiResponse = await fetch("https://ai.lovable.dev/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";
    const coaching = JSON.parse(content);

    // Update provider intelligence with recurring issues
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

    // Create coaching actions
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

    // Log the API call
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
    await supabase.from("ai_api_calls").insert({
      function_name: "ai-provider-coach",
      status: "error",
      error_message: error.message,
      latency_ms: latency,
    });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
