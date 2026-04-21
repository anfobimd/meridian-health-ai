// supabase/functions/admin-reset-password/index.ts
//
// Super-admin / admin can reset any user's password.
//
// Body: { target_user_id: uuid, new_password: string }

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

    // Verify caller identity using their JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    // Verify caller has admin privileges. Accept super_admin or admin; use
    // plain select (not maybeSingle) so users with multiple role rows don't
    // error out.
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    const isPrivileged = roles.includes("super_admin") || roles.includes("admin");
    if (!isPrivileged) return json({ error: "Admin access required" }, 403);

    const { target_user_id, new_password } = await req.json();
    if (!target_user_id || !new_password) {
      return json({ error: "target_user_id and new_password are required" }, 400);
    }
    if (typeof new_password !== "string" || new_password.length < 10) {
      return json({ error: "Password must be at least 10 characters" }, 400);
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(target_user_id, {
      password: new_password,
    });
    if (updateErr) return json({ error: updateErr.message }, 500);

    // Best-effort: revoke any existing sessions for the target user so they
    // can't keep using their old password.
    try {
      await admin.auth.admin.signOut(target_user_id, "global");
    } catch { /* some SDK versions don't support signOut by user id — ignore */ }

    return json({ success: true });
  } catch (err) {
    console.error("[admin-reset-password] error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
