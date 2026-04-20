import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletion } from "../_shared/bedrock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { firstName, lastName, email, phone, dob } = await req.json();
    // Check for duplicates
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: possibleDupes } = await supabaseAdmin.from("patients")
      .select("id, first_name, last_name, email, phone, date_of_birth")
      .or(`email.ilike.%${email || "NOEMAIL"}%,phone.eq.${phone || "NOPHONE"}`)
      .limit(10);

    // Also check name similarity
    const { data: nameDupes } = await supabaseAdmin.from("patients")
      .select("id, first_name, last_name, email, phone, date_of_birth")
      .ilike("first_name", `%${firstName || ""}%`)
      .ilike("last_name", `%${lastName || ""}%`)
      .limit(10);

    const allDupes = [...(possibleDupes || []), ...(nameDupes || [])];
    const uniqueDupes = allDupes.filter((d, i, a) => a.findIndex(x => x.id === d.id) === i);

    // Call AI for validation
    const aiRes = await chatCompletion({
messages: [{
          role: "system",
          content: `You are a patient registration validator for a medical aesthetics clinic. Analyze registration data and return JSON with:
- "emailIssues": string[] (typos like "gmial.com", disposable domains, format issues)
- "phoneIssues": string[] (formatting issues, invalid patterns)
- "dobIssues": string[] (future date, implausible age >120 or <0, minor alerts <18)
- "duplicateWarnings": string[] (analyze the duplicate candidates and flag likely matches)
- "suggestedIntakeForms": string[] (based on any clues, suggest relevant intake form types)
- "overallRisk": "none" | "low" | "medium" | "high"
Be concise. Empty arrays if no issues.`
        }, {
          role: "user",
          content: JSON.stringify({
            registration: { firstName, lastName, email, phone, dob },
            duplicateCandidates: uniqueDupes.slice(0, 5)
          })
        }],
temperature: 0.2
      });
    const aiData = aiRes;
    let validation = {};
    try {
      const content = aiData.choices?.[0]?.message?.content || "{}";
      validation = JSON.parse(content);
    } catch { validation = {}; }

    return new Response(JSON.stringify({
      duplicates: uniqueDupes.slice(0, 5),
      validation,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-patient-registration error:", err);
    return new Response(JSON.stringify({ error: "Validation failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});