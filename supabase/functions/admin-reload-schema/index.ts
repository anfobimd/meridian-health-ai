// Diagnostic + reload tool for PostgREST schema cache.
// - Idempotently applies the contract_admin migration columns when missing
//   (used to keep DB in sync with repo migrations after Lovable-side history
//   drift, since `supabase db push` can't reconcile cleanly).
// - Verifies all admin/invitation columns exist on disk.
// - Broadcasts NOTIFY pgrst across multiple connections so every PostgREST
//   replica picks up the reload.
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

Deno.serve(async (_req) => {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not set" }), { status: 500 });

  const out: Record<string, unknown> = {};

  // 1. Idempotent ALTER TABLE — additive only, IF NOT EXISTS guarded.
  {
    const sql = postgres(dbUrl, { prepare: false });
    try {
      await sql.unsafe(`
        ALTER TABLE public.contracts
          ADD COLUMN IF NOT EXISTS admin_name              TEXT,
          ADD COLUMN IF NOT EXISTS admin_email             TEXT,
          ADD COLUMN IF NOT EXISTS admin_invited_at        TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS admin_invitation_count  INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE public.clinics
          ADD COLUMN IF NOT EXISTS address_line2 TEXT,
          ADD COLUMN IF NOT EXISTS zip_code      TEXT,
          ADD COLUMN IF NOT EXISTS country       TEXT NOT NULL DEFAULT 'US',
          ADD COLUMN IF NOT EXISTS email         TEXT;
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_admin_email_format') THEN
            ALTER TABLE public.contracts
              ADD CONSTRAINT contracts_admin_email_format
              CHECK (admin_email IS NULL OR admin_email ~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinics_zip_code_format') THEN
            ALTER TABLE public.clinics
              ADD CONSTRAINT clinics_zip_code_format
              CHECK (zip_code IS NULL OR zip_code ~ '^\\d{5}(-\\d{4})?$');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinics_email_format') THEN
            ALTER TABLE public.clinics
              ADD CONSTRAINT clinics_email_format
              CHECK (email IS NULL OR email ~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$');
          END IF;
        END $$;
      `);
      out.migration = "applied";
    } catch (e) {
      out.migration = `error: ${e instanceof Error ? e.message : "?"}`;
    } finally {
      await sql.end();
    }
  }

  // 2. Verify columns
  {
    const sql = postgres(dbUrl, { prepare: false });
    try {
      out.contracts_columns = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='contracts'
          AND column_name IN (
            'invitation_email','invitation_sent_at','invitation_count',
            'admin_name','admin_email','admin_invited_at','admin_invitation_count'
          )
        ORDER BY column_name
      `;
      out.clinics_columns = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='clinics'
          AND column_name IN ('address_line2','zip_code','country','email')
        ORDER BY column_name
      `;
    } finally {
      await sql.end();
    }
  }

  // 3. NOTIFY pgrst across 6 fresh connections so each PostgREST replica
  //    behind the load balancer sees the broadcast.
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
