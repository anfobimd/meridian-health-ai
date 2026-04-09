const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { mediaType, base64Data } = await req.json();
    if (!mediaType || !base64Data) {
      return new Response(JSON.stringify({ error: "mediaType and base64Data are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const extractPrompt = `You are a lab value extractor. Extract every value from this lab document that matches the list below. Return ONLY a valid JSON object — no explanation, no markdown, no backticks. Use null for values not found. All numeric values must be numbers, not strings.

Extract these keys exactly:
{
  "tt": total testosterone (ng/dL),
  "ft": free testosterone (pg/mL),
  "e2": estradiol E2 (pg/mL),
  "p4": progesterone (ng/mL),
  "lh": LH (mIU/mL),
  "fsh": FSH (mIU/mL),
  "shbg": SHBG (nmol/L),
  "prl": prolactin (ng/mL),
  "psa": PSA (ng/mL),
  "dhea": DHEA-S (mcg/dL),
  "tsh": TSH (mIU/L),
  "ft3": free T3 (pg/mL),
  "ft4": free T4 (ng/dL),
  "hgb": hemoglobin (g/dL),
  "hct": hematocrit (%),
  "rbc": RBC (M/uL),
  "glc": fasting glucose (mg/dL),
  "a1c": HbA1c (%),
  "alt": ALT (U/L),
  "ast": AST (U/L),
  "crt": creatinine (mg/dL),
  "igf1": IGF-1 (ng/mL),
  "fins": fasting insulin (µIU/mL),
  "crp": CRP / hs-CRP (mg/L),
  "igfbp3": IGF-BP3 (mg/L),
  "calcitonin": calcitonin (pg/mL),
  "b12": vitamin B12 (pg/mL),
  "folate": folate (ng/mL),
  "vitd": vitamin D 25-OH (ng/mL)
}

If a value is reported in different units, convert to the target unit. Include values that have range flags (H/L/HH/LL) — just provide the numeric value.`;

    // Content is always an image (PDFs converted client-side)
    const imageContent = {
      type: "image_url" as const,
      image_url: { url: `data:${mediaType};base64,${base64Data}` },
    };
    
    const imageContent = {
      type: "image_url" as const,
      image_url: { url: `data:${mediaType};base64,${base64Data}` },
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            imageContent,
            { type: "text", text: extractPrompt },
          ],
        }],
        temperature: 0.1,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited. Please try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await response.text();
      console.error("AI error:", status, errText);
      return new Response(JSON.stringify({ error: "Lab extraction failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    const clean = raw.replace(/```json|```/g, "").trim();

    let labs;
    try {
      labs = JSON.parse(clean);
    } catch {
      return new Response(JSON.stringify({ error: "Could not parse lab extraction response", raw }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ labs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ai-extract-labs error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
