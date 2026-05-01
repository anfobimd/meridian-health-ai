// Diagnostic + reload tool for PostgREST schema cache.
// Read-only: verifies columns exist on disk and broadcasts NOTIFY pgrst across
// multiple connections so every PostgREST replica picks up the reload.
// No writes are performed.
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

Deno.serve(async (_req) => {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not set" }), { status: 500 });

  const out: Record<string, unknown> = {};

  // 1. Confirm columns exist on disk (read-only)
  {
    const sql = postgres(dbUrl, { prepare: false });
    try {
      out.contracts_columns = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='contracts'
          AND column_name IN ('invitation_email','invitation_sent_at','invitation_count')
        ORDER BY column_name
      `;
      out.assignments_columns = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='provider_clinic_assignments'
          AND column_name IN ('notification_sent_at','notification_count')
        ORDER BY column_name
      `;
    } finally {
      await sql.end();
    }
  }

  // 2. Fire NOTIFY pgrst across 6 fresh connections so each PostgREST replica
  //    behind the load balancer sees the broadcast. NOTIFY is non-destructive.
  {
    const reloads: string[] = [];
    for (let i = 0; i < 6; i++) {
      const sql = postgres(dbUrl, { prepare: false, connection: { application_name: `reload-${i}` } });
      try {
        await sql`NOTIFY pgrst, 'reload schema'`;
        await sql`NOTIFY pgrst, 'reload config'`;
        reloads.push(`ok-${i}`);
      } catch (e) {
        reloads.push(`err-${i}: ${e instanceof Error ? e.message : "?"}`);
      } finally {
        await sql.end();
      }
    }
    out.reloads = reloads;
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
