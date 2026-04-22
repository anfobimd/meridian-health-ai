// supabase/functions/revoke-my-sessions/index.ts
//
// Fixes QA #5: "system accepts old pascode after reset".
//
// The Supabase client's signOut({scope:"global"}) only revokes refresh tokens.
// Outstanding access tokens stay valid until their natural 1-hour expiry, so
// a user who reset their password can still use the old JWT on another tab.
// The ONLY way to kill every active access token is admin.auth.admin.signOut
// with the service-role key — which can't live client-side.
//
// This function runs the admin signOut for the *caller's own* user id, so it's
// safe to expose to authenticated users.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Resolve caller identity using their own JWT.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    // Revoke every session for this user — including the current JWT. The
    // client is expected to immediately redirect to /auth after this call.
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await admin.auth.admin.signOut(userData.user.id, "global");
    if (error) {
      console.error("[revoke-my-sessions] signOut error:", error);
      return json({ error: error.message }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error("[revoke-my-sessions] unexpected:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
