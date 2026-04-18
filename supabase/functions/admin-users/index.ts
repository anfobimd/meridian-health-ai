// supabase/functions/admin-users/index.ts
//
// Super-admin-only user management. Actions:
//   "list"            — list all users with their roles + last sign in
//   "assign_role"     — add a role to a user (doesn't remove existing roles)
//   "remove_role"     — remove a specific role
//   "set_role"        — replace all roles with a single role
//   "allowlist_add"   — add email to super_admin_emails (auto-promotes on signup)
//   "allowlist_remove"— remove email from super_admin_emails
//   "allowlist_list"  — list allowlist emails
//   "send_invite"     — admin sends password-reset-style link for new user signup

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppRole = "super_admin" | "admin" | "provider" | "front_desk";
const VALID_ROLES: AppRole[] = ["super_admin", "admin", "provider", "front_desk"];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    // Verify caller is super_admin
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isSuperAdmin = (callerRoles || []).some((r: { role: string }) => r.role === "super_admin");
    if (!isSuperAdmin) {
      return jsonResponse({ error: "Forbidden — super_admin role required" }, 403);
    }

    const body = await req.json();
    const { action } = body;

    // ─── LIST USERS ─────────────────────────────────────────────────────
    if (action === "list") {
      // Fetch users from auth.users (via admin API)
      const { data: authData, error: authErr } = await admin.auth.admin.listUsers({ perPage: 200 });
      if (authErr) throw authErr;

      // Fetch all roles in one query
      const userIds = authData.users.map(u => u.id);
      const { data: rolesData } = await admin
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      const rolesByUser: Record<string, string[]> = {};
      for (const r of rolesData || []) {
        (rolesByUser[r.user_id] = rolesByUser[r.user_id] || []).push(r.role);
      }

      const users = authData.users.map(u => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        roles: rolesByUser[u.id] || [],
      }));

      return jsonResponse({ users });
    }

    // ─── ASSIGN ROLE ─────────────────────────────────────────────────────
    if (action === "assign_role") {
      const { user_id, role } = body;
      if (!user_id || !VALID_ROLES.includes(role)) {
        return jsonResponse({ error: "user_id and valid role required" }, 400);
      }
      const { error } = await admin.from("user_roles").insert({ user_id, role });
      if (error && !error.message.includes("duplicate")) throw error;
      return jsonResponse({ assigned: true, user_id, role });
    }

    // ─── REMOVE ROLE ─────────────────────────────────────────────────────
    if (action === "remove_role") {
      const { user_id, role } = body;
      if (!user_id || !VALID_ROLES.includes(role)) {
        return jsonResponse({ error: "user_id and valid role required" }, 400);
      }
      const { error } = await admin.from("user_roles").delete().eq("user_id", user_id).eq("role", role);
      if (error) throw error;
      return jsonResponse({ removed: true, user_id, role });
    }

    // ─── SET ROLE (replaces all roles) ───────────────────────────────────
    if (action === "set_role") {
      const { user_id, role } = body;
      if (!user_id || !VALID_ROLES.includes(role)) {
        return jsonResponse({ error: "user_id and valid role required" }, 400);
      }
      await admin.from("user_roles").delete().eq("user_id", user_id);
      const { error } = await admin.from("user_roles").insert({ user_id, role });
      if (error) throw error;
      return jsonResponse({ set: true, user_id, role });
    }

    // ─── ALLOWLIST: ADD ─────────────────────────────────────────────────
    if (action === "allowlist_add") {
      const { email, notes } = body;
      if (!email) return jsonResponse({ error: "email required" }, 400);
      const { error } = await admin.from("super_admin_emails").upsert({
        email: email.trim().toLowerCase(),
        added_by: user.id,
        notes: notes || null,
      });
      if (error) throw error;

      // If user with this email already exists, promote them now
      const { data: existing } = await admin.auth.admin.listUsers({ perPage: 200 });
      const match = existing?.users?.find(u => u.email?.toLowerCase() === email.trim().toLowerCase());
      if (match) {
        const { error: insErr } = await admin.from("user_roles").insert({ user_id: match.id, role: "super_admin" });
        if (insErr && !insErr.message.includes("duplicate")) {/* ignore */}
      }

      return jsonResponse({ added: true, email, promoted_existing: !!match });
    }

    // ─── ALLOWLIST: REMOVE ──────────────────────────────────────────────
    if (action === "allowlist_remove") {
      const { email } = body;
      if (!email) return jsonResponse({ error: "email required" }, 400);
      const { error } = await admin.from("super_admin_emails").delete().eq("email", email.trim().toLowerCase());
      if (error) throw error;
      return jsonResponse({ removed: true, email });
    }

    // ─── ALLOWLIST: LIST ────────────────────────────────────────────────
    if (action === "allowlist_list") {
      const { data, error } = await admin.from("super_admin_emails").select("*").order("added_at", { ascending: false });
      if (error) throw error;
      return jsonResponse({ allowlist: data });
    }

    // ─── SEND INVITE ────────────────────────────────────────────────────
    if (action === "send_invite") {
      const { email, role } = body;
      if (!email) return jsonResponse({ error: "email required" }, 400);

      // Create user (or get existing) via admin API
      const redirectUrl = body.redirect_url || `${req.headers.get("origin") || "https://meridian-ai-care.lovable.app"}/auth`;
      const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email.trim().toLowerCase(), {
        redirectTo: redirectUrl,
      });
      if (error) throw error;

      // Assign role if specified
      if (role && VALID_ROLES.includes(role) && invited?.user) {
        const { error: insErr } = await admin.from("user_roles").insert({ user_id: invited.user.id, role });
        if (insErr && !insErr.message.includes("duplicate")) {/* ignore */}
      }

      return jsonResponse({ invited: true, email, user_id: invited?.user?.id, role });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err: unknown) {
    console.error("[admin-users] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
