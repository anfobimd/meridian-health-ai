import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY_NAME = "LOVABLE_API_KEY";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get(LOVABLE_API_KEY_NAME);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { password, user_email, user_name } = await req.json();
    if (!password) {
      return new Response(JSON.stringify({ error: "password required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Local heuristic scoring
    let score = 0;
    const warnings: string[] = [];

    if (password.length >= 8) score += 15;
    if (password.length >= 12) score += 10;
    if (password.length >= 16) score += 5;
    if (/[A-Z]/.test(password)) score += 10;
    if (/[a-z]/.test(password)) score += 10;
    if (/[0-9]/.test(password)) score += 10;
    if (/[^A-Za-z0-9]/.test(password)) score += 15;
    if (new Set(password).size >= 8) score += 10;

    // Check for common patterns
    const lower = password.toLowerCase();
    const commonPatterns = ["password", "123456", "qwerty", "abc123", "letmein", "welcome", "admin"];
    for (const p of commonPatterns) {
      if (lower.includes(p)) {
        warnings.push(`Contains common pattern "${p}"`);
        score -= 20;
      }
    }

    // Check against user info
    if (user_email) {
      const emailLocal = user_email.split("@")[0].toLowerCase();
      if (emailLocal.length > 2 && lower.includes(emailLocal)) {
        warnings.push("Contains your email username");
        score -= 15;
      }
    }
    if (user_name) {
      const nameParts = user_name.toLowerCase().split(/\s+/);
      for (const part of nameParts) {
        if (part.length > 2 && lower.includes(part)) {
          warnings.push(`Contains your name "${part}"`);
          score -= 15;
        }
      }
    }

    // Check clinic-related patterns
    const clinicPatterns = ["meridian", "clinic", "medspa", "botox", "laser", "patient"];
    for (const cp of clinicPatterns) {
      if (lower.includes(cp)) {
        warnings.push(`Contains clinic-related word "${cp}"`);
        score -= 10;
      }
    }

    // Repeated characters
    if (/(.)\1{3,}/.test(password)) {
      warnings.push("Contains repeated characters");
      score -= 10;
    }

    // Sequential numbers
    if (/(?:012|123|234|345|456|567|678|789)/.test(password)) {
      warnings.push("Contains sequential numbers");
      score -= 10;
    }

    score = Math.max(0, Math.min(100, score));

    // AI enhancement if available
    let aiSuggestion: string | null = null;
    if (LOVABLE_API_KEY && warnings.length > 0) {
      try {
        const aiResp = await fetch("https://ai-gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            max_tokens: 150,
            messages: [
              {
                role: "system",
                content: "You are a security advisor. Given password warnings, provide ONE short actionable tip (max 2 sentences) to create a stronger password. Never reveal or repeat the password.",
              },
              {
                role: "user",
                content: `Password issues found: ${warnings.join(", ")}. Password length: ${password.length}. Score: ${score}/100. Give a brief improvement tip.`,
              },
            ],
          }),
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          aiSuggestion = aiData.choices?.[0]?.message?.content?.trim() || null;
        }
      } catch {
        // AI is optional
      }
    }

    let tier: string;
    if (score >= 85) tier = "excellent";
    else if (score >= 65) tier = "strong";
    else if (score >= 45) tier = "fair";
    else if (score >= 25) tier = "weak";
    else tier = "critical";

    return new Response(
      JSON.stringify({ score, tier, warnings, ai_suggestion: aiSuggestion }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
