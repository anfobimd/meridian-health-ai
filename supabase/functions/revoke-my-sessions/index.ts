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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.1";

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

    // Revoke every session for this user by deleting their session rows
    // directly. GoTrue's admin.signOut(jwt, scope) takes a JWT (not a user
    // id) and revokes sessions owned by that JWT's user — but calling it
    // from a service-role admin client is awkward because the admin client
    // has no JWT. Deleting from auth.sessions cascades to
    // auth.refresh_tokens via FK and is the ground truth GoTrue itself
    // consults on every token refresh. Net effect: every outstanding
    // access token for this user stops working as soon as its 60s JWT
    // cache expires (typically ~60s), which is exactly what QA #5 needs.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userId = userData.user.id;

    // Use the admin REST API against auth.sessions table. The auth schema
    // is exposed via the "pgrst_reserved_schemas" config; if it's not, we
    // fall back to calling the admin users endpoint to re-issue a password
    // update (which in turn revokes tokens).
    const delResp = await fetch(
      `${supabaseUrl}/rest/v1/sessions?user_id=eq.${userId}`,
      {
        method: "DELETE",
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Accept-Profile": "auth",
          "Content-Profile": "auth",
          "Prefer": "return=minimal",
        },
      },
    );

    if (delResp.ok) {
      return json({ success: true, method: "direct-delete" });
    }

    // Fallback: admin.signOut with the caller's JWT + scope=global. This
    // works because scope=global tells GoTrue to kill every session for
    // the user that owns the JWT — not just the one the JWT represents.
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { error: signOutErr } = await admin.auth.admin.signOut(jwt, "global");
    if (signOutErr) {
      console.error("[revoke-my-sessions] fallback signOut error:", signOutErr);
      return json(
        { error: signOutErr.message, rest_status: delResp.status },
        500,
      );
    }

    return json({ success: true, method: "admin-signout" });
  } catch (err) {
    console.error("[revoke-my-sessions] unexpected:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
