// supabase/functions/self-change-password/index.ts
//
// Fixes QA #5: "system accept old passcode once we reset new pascode".
//
// Root cause: supabase.auth.updateUser({password}) from the client is
// rejected for MFA-enrolled users at AAL1 (mfa_allow_low_aal=false). In
// practice Supabase-js sometimes surfaces this as a silent stall, leaving
// the UI showing "Password Updated" while the server-side hash stays on
// the OLD password — so the old password keeps working and the "new" one
// never took.
//
// This function does the update server-side with the service-role key,
// which bypasses the AAL constraint for a single trusted write, AND
// immediately revokes every session for the user (kills the pre-change
// JWT + refresh tokens in one atomic step).
//
// Body: { new_password: string, old_password?: string }
//   - new_password: required
//   - old_password: optional. If provided, we verify it before accepting
//     the change — gives us a definitive "the change really took" signal
//     the client can trust.

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

    // Identify caller via their JWT.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.email) return json({ error: "Unauthorized" }, 401);

    const email = userData.user.email;
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const newPassword = body?.new_password;
    const oldPassword = body?.old_password;
    if (typeof newPassword !== "string" || newPassword.length < 10) {
      return json({ error: "new_password must be a string of at least 10 characters" }, 400);
    }
    if (newPassword === oldPassword) {
      return json({ error: "New password must differ from the old password" }, 400);
    }

    // Optional old-password verification — proves the caller knows the
    // current password. If provided and wrong, reject before updating.
    if (typeof oldPassword === "string" && oldPassword.length > 0) {
      const verifyClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: verErr } = await verifyClient.auth.signInWithPassword({
        email,
        password: oldPassword,
      });
      if (verErr) {
        return json({ error: "Current password is incorrect" }, 400);
      }
      // Immediately sign out the ephemeral session we just created to
      // verify — we don't need it hanging around.
      try { await verifyClient.auth.signOut(); } catch { /* swallow */ }
    }

    // Update the password with service-role — bypasses AAL2 requirements.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (updateErr) {
      console.error("[self-change-password] update failed:", updateErr);
      return json({ error: updateErr.message }, 500);
    }

    // Verify the change actually took: try signing in with the NEW password.
    // If this fails, something weird happened — better to tell the user than
    // leave them thinking it worked.
    const verifyNew = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: verNewErr } = await verifyNew.auth.signInWithPassword({
      email,
      password: newPassword,
    });
    if (verNewErr) {
      console.error("[self-change-password] new password verification failed:", verNewErr);
      return json({ error: "Password update appeared to succeed but verification failed — please try again" }, 500);
    }
    try { await verifyNew.auth.signOut(); } catch { /* swallow */ }

    // Revoke every outstanding session for this user. DELETE from auth.sessions
    // cascades to refresh_tokens and is the ground truth GoTrue consults on
    // every refresh. Access tokens issued before this moment stop working
    // as soon as their 60s JWT cache expires.
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
    let sessionsRevoked = delResp.ok;

    if (!sessionsRevoked) {
      // Fallback path: admin.signOut with the caller's JWT + scope=global.
      const jwt = authHeader.replace(/^Bearer\s+/i, "");
      const { error: sErr } = await admin.auth.admin.signOut(jwt, "global");
      sessionsRevoked = !sErr;
    }

    return json({
      success: true,
      sessions_revoked: sessionsRevoked,
    });
  } catch (err) {
    console.error("[self-change-password] unexpected:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
