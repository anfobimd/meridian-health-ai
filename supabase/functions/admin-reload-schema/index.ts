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

        -- QA #60 — starter formulary so the prescription search returns hits.
        INSERT INTO public.medications (name, generic_name, category, route, default_dose, default_unit, is_controlled, schedule_class)
        SELECT v.name, v.generic_name, v.category, v.route, v.default_dose, v.default_unit, v.is_controlled, v.schedule_class
        FROM (VALUES
          ('Amoxicillin', 'Amoxicillin', 'antibiotic', 'oral', '500', 'mg', false, NULL::text),
          ('Azithromycin', 'Azithromycin', 'antibiotic', 'oral', '250', 'mg', false, NULL),
          ('Doxycycline', 'Doxycycline', 'antibiotic', 'oral', '100', 'mg', false, NULL),
          ('Cephalexin', 'Cephalexin', 'antibiotic', 'oral', '500', 'mg', false, NULL),
          ('Estradiol', 'Estradiol', 'hormone', 'transdermal', '0.05', 'mg/day', false, NULL),
          ('Progesterone', 'Progesterone', 'hormone', 'oral', '100', 'mg', false, NULL),
          ('Testosterone Cypionate', 'Testosterone', 'hormone', 'intramuscular', '200', 'mg/mL', true, 'III'),
          ('Levothyroxine', 'Levothyroxine', 'hormone', 'oral', '50', 'mcg', false, NULL),
          ('Sermorelin', 'Sermorelin', 'peptide', 'subcutaneous', '0.3', 'mg', false, NULL),
          ('Tirzepatide', 'Tirzepatide', 'GLP-1', 'subcutaneous', '2.5', 'mg', false, NULL),
          ('Semaglutide', 'Semaglutide', 'GLP-1', 'subcutaneous', '0.25', 'mg', false, NULL),
          ('Ibuprofen', 'Ibuprofen', 'NSAID', 'oral', '400', 'mg', false, NULL),
          ('Naproxen', 'Naproxen', 'NSAID', 'oral', '500', 'mg', false, NULL),
          ('Acetaminophen', 'Acetaminophen', 'analgesic', 'oral', '500', 'mg', false, NULL),
          ('Cetirizine', 'Cetirizine', 'antihistamine', 'oral', '10', 'mg', false, NULL),
          ('Loratadine', 'Loratadine', 'antihistamine', 'oral', '10', 'mg', false, NULL),
          ('Omeprazole', 'Omeprazole', 'PPI', 'oral', '20', 'mg', false, NULL),
          ('Metformin', 'Metformin', 'antidiabetic', 'oral', '500', 'mg', false, NULL)
        ) AS v(name, generic_name, category, route, default_dose, default_unit, is_controlled, schedule_class)
        WHERE NOT EXISTS (SELECT 1 FROM public.medications m WHERE m.name = v.name);
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
      const medCount = await sql`SELECT count(*)::int AS n FROM public.medications`;
      out.medications_count = medCount[0]?.n ?? 0;
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
