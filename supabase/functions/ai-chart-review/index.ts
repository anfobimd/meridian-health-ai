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
    const { encounter_id } = await req.json();
    if (!encounter_id) throw new Error("encounter_id required");

    // 1. Fetch encounter + relations
    const { data: encounter, error: encErr } = await supabase
      .from("encounters")
      .select("*, patients(*), providers!encounters_provider_id_fkey(*)")
      .eq("id", encounter_id)
      .single();
    if (encErr) { console.error("Encounter fetch error:", encErr); throw new Error("Encounter not found: " + encErr.message); }
    if (!encounter) throw new Error("Encounter not found");

    // 2. Fetch clinical note
    const { data: notes } = await supabase
      .from("clinical_notes")
      .select("*")
      .eq("patient_id", encounter.patient_id)
      .order("created_at", { ascending: false })
      .limit(3);

    // 3. Fetch provider intelligence if exists
    const { data: providerIntel } = await supabase
      .from("ai_provider_intelligence")
      .select("*")
      .eq("provider_id", encounter.provider_id)
      .maybeSingle();

    // 4. Get active prompt
    const { data: prompt } = await supabase
      .from("ai_prompts")
      .select("system_prompt, version")
      .eq("prompt_key", "chart_brief")
      .eq("is_active", true)
      .single();

    // 5. Get doc checklist for procedure type
    const { data: checklists } = await supabase
      .from("ai_doc_checklists")
      .select("*")
      .eq("is_active", true);

    // Build context for AI
    const patient = encounter.patients;
    const provider = encounter.providers;
    const latestNote = notes?.[0];

    const userPrompt = `Analyze this encounter for MD review:

ENCOUNTER:
- ID: ${encounter.id}
- Type: ${encounter.encounter_type || "general"}
- Chief Complaint: ${encounter.chief_complaint || "Not documented"}
- Status: ${encounter.status}
- Started: ${encounter.started_at}

PATIENT:
- Name: ${patient?.first_name} ${patient?.last_name}
- DOB: ${patient?.date_of_birth || "Unknown"}
- Gender: ${patient?.gender || "Unknown"}
- Allergies: ${patient?.allergies?.join(", ") || "None documented"}
- Medications: ${patient?.medications?.join(", ") || "None documented"}
- Contraindications: ${patient?.contraindications?.join(", ") || "None documented"}

PROVIDER:
- Name: ${provider?.first_name} ${provider?.last_name}, ${provider?.credentials || ""}
- Specialty: ${provider?.specialty || "General"}
- Correction Rate: ${providerIntel?.correction_rate ?? "N/A (new provider)"}
- Total Charts: ${providerIntel?.total_charts ?? 0}
- Recurring Issues: ${JSON.stringify(providerIntel?.recurring_issues || [])}

SOAP NOTE:
- Subjective: ${latestNote?.subjective || "Not documented"}
- Objective: ${latestNote?.objective || "Not documented"}
- Assessment: ${latestNote?.assessment || "Not documented"}
- Plan: ${latestNote?.plan || "Not documented"}
- AI Generated: ${latestNote?.ai_generated ?? false}

DOCUMENTATION CHECKLISTS AVAILABLE:
${checklists?.map((c: any) => `${c.procedure_type}: ${JSON.stringify(c.checklist_items)}`).join("\n") || "None"}

Return your analysis as a JSON object using the suggest_chart_analysis tool.`;

    // 6. Call Lovable AI with tool calling for structured output
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: prompt?.system_prompt || "Analyze the chart and return structured JSON." },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_chart_analysis",
              description: "Return the structured chart analysis brief",
              parameters: {
                type: "object",
                properties: {
                  procedure_summary: { type: "string" },
                  documentation_status: { type: "string", enum: ["complete", "partial", "incomplete"] },
                  documentation_score: { type: "number" },
                  ai_flags: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        flag: { type: "string" },
                        severity: { type: "string", enum: ["info", "warning", "critical"] },
                        detail: { type: "string" },
                      },
                      required: ["flag", "severity", "detail"],
                    },
                  },
                  patient_context: { type: "string" },
                  risk_score: { type: "number" },
                  risk_tier: { type: "string", enum: ["low", "medium", "high", "critical"] },
                  recommended_action: { type: "string" },
                  estimated_review_seconds: { type: "number" },
                },
                required: [
                  "procedure_summary", "documentation_status", "documentation_score",
                  "ai_flags", "patient_context", "risk_score", "risk_tier",
                  "recommended_action", "estimated_review_seconds",
                ],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_chart_analysis" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      
      // Log failed call
      await supabase.from("ai_api_calls").insert({
        function_name: "ai-chart-review",
        model_used: "google/gemini-2.5-flash",
        latency_ms: Date.now() - startTime,
        status: "error",
        error_message: `${aiResponse.status}: ${errText.substring(0, 500)}`,
        encounter_id,
      });

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call response from AI");

    const analysis = JSON.parse(toolCall.function.arguments);

    // Rubber-stamp thresholds by risk tier
    const thresholds: Record<string, number> = { low: 30, medium: 90, high: 180, critical: 300 };
    const rubberStampThreshold = thresholds[analysis.risk_tier] || 30;

    // 7. Create or update chart_review_record
    const { data: existingReview } = await supabase
      .from("chart_review_records")
      .select("id")
      .eq("encounter_id", encounter_id)
      .maybeSingle();

    let reviewRecordId: string;
    if (existingReview) {
      reviewRecordId = existingReview.id;
      await supabase.from("chart_review_records").update({
        ai_priority_score: analysis.risk_score,
        ai_risk_tier: analysis.risk_tier,
        rubber_stamp_threshold_seconds: rubberStampThreshold,
        status: "pending_review",
      }).eq("id", reviewRecordId);
    } else {
      const { data: newReview } = await supabase.from("chart_review_records").insert({
        encounter_id,
        provider_id: encounter.provider_id,
        patient_id: encounter.patient_id,
        ai_priority_score: analysis.risk_score,
        ai_risk_tier: analysis.risk_tier,
        rubber_stamp_threshold_seconds: rubberStampThreshold,
        status: "pending_review",
      }).select("id").single();
      reviewRecordId = newReview!.id;
    }

    // 8. Store AI analysis
    await supabase.from("ai_chart_analysis").insert({
      encounter_id,
      review_record_id: reviewRecordId,
      risk_score: analysis.risk_score,
      risk_tier: analysis.risk_tier,
      documentation_score: analysis.documentation_score,
      ai_flags: analysis.ai_flags,
      brief: analysis,
      recommended_action: analysis.recommended_action,
      estimated_review_seconds: analysis.estimated_review_seconds,
      model_used: "google/gemini-2.5-flash",
      prompt_version: prompt?.version?.toString() || "1",
    });

    // 9. Log API call
    await supabase.from("ai_api_calls").insert({
      function_name: "ai-chart-review",
      model_used: "google/gemini-2.5-flash",
      input_tokens: aiData.usage?.prompt_tokens,
      output_tokens: aiData.usage?.completion_tokens,
      latency_ms: Date.now() - startTime,
      status: "success",
      encounter_id,
    });

    return new Response(JSON.stringify({ success: true, analysis, review_record_id: reviewRecordId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-chart-review error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
