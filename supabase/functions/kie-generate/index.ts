// supabase/functions/kie-generate/index.ts
//
// Server-side proxy for the kie.ai unified jobs API — the multi-model
// generation gateway (Veo, Sora, Nano Banana, Seedance, Flux, Suno, ...).
//
// Every call is metered and billed by kie.ai, so KIE_API_KEY never reaches the
// browser and every action requires an authenticated caller.
//
// Actions:
//   "create" — start a generation job.  { model, input, callBackUrl? } -> { taskId }
//   "status" — poll a job.              { taskId } -> { state, resultUrls, error }
//
// kie.ai is asynchronous: "create" returns immediately with a taskId and the
// caller polls "status" until state is "success" or "fail". Pass callBackUrl
// instead if you would rather kie.ai push the result to a webhook.
//
// Requires KIE_API_KEY secret configured in Supabase:
//   supabase secrets set KIE_API_KEY=...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KIE_API_BASE = "https://api.kie.ai/api/v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** kie.ai wraps everything in { code, msg, data } and returns HTTP 200 for
 *  business errors, so the envelope has to be unwrapped explicitly. */
async function kieFetch(path: string, init: RequestInit = {}) {
  const apiKey = Deno.env.get("KIE_API_KEY");
  if (!apiKey) throw new Error("KIE_API_KEY not configured");

  const res = await fetch(`${KIE_API_BASE}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`kie.ai ${path} failed (HTTP ${res.status}): ${payload?.msg ?? "no response body"}`);
  }
  if (payload?.code !== 200) {
    throw new Error(`kie.ai ${path} failed (code ${payload?.code}): ${payload?.msg ?? "unknown error"}`);
  }
  return payload.data;
}

/** kie.ai returns result URLs as a JSON *string* under resultJson. */
function parseResultUrls(resultJson: unknown): string[] {
  if (typeof resultJson !== "string" || !resultJson) return [];
  try {
    const parsed = JSON.parse(resultJson);
    const urls = parsed?.resultUrls;
    return Array.isArray(urls) ? urls.filter((u: unknown) => typeof u === "string") : [];
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    // Generations cost credits — confirm a real signed-in user, not just a key.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { action } = body;

    // ─── CREATE TASK ────────────────────────────────────────
    if (action === "create") {
      const { model, input, callBackUrl } = body;
      if (!model) return json({ error: "model is required" }, 400);
      if (!input || typeof input !== "object") return json({ error: "input object is required" }, 400);

      const data = await kieFetch("/jobs/createTask", {
        method: "POST",
        body: JSON.stringify({ model, input, ...(callBackUrl ? { callBackUrl } : {}) }),
      });

      const taskId = data?.taskId;
      if (!taskId) throw new Error("kie.ai did not return a taskId");
      return json({ taskId });
    }

    // ─── POLL TASK ──────────────────────────────────────────
    if (action === "status") {
      const { taskId } = body;
      if (!taskId) return json({ error: "taskId is required" }, 400);

      const data = await kieFetch(`/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`);

      // state: "waiting" | "queuing" | "generating" | "success" | "fail"
      const state: string = data?.state ?? "waiting";
      return json({
        taskId,
        state,
        model: data?.model ?? null,
        resultUrls: state === "success" ? parseResultUrls(data?.resultJson) : [],
        error: state === "fail" ? (data?.failMsg ?? "Generation failed") : null,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("kie-generate error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
