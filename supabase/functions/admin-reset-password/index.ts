import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = userData.user.id;
    const { data: roleData } = await createClient(supabaseUrl, serviceRoleKey)
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { target_user_id, new_password } = await req.json();
    if (!target_user_id || !new_password) {
      return new Response(JSON.stringify({ error: "target_user_id and new_password required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (new_password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Use admin API to reset password
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(target_user_id, { password: new_password });

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
