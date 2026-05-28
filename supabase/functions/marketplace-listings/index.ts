// supabase/functions/marketplace-listings/index.ts
//
// Public read-only endpoint backing the patient-facing marketplace.
// Returns ONLY public-safe fields; never exposes earnings, internal notes,
// or staff-only metadata. RLS on providers/availability/skills is intact —
// this function is the controlled read surface.
//
// v4 — Strict per-clinic timezone:
//   provider_availability.start_time/end_time are clinic-local wall-clock times.
//   The timezone is resolved STRICTLY from the provider's primary clinic
//   (provider_clinic_assignments.is_primary=true → clinics.timezone). No
//   hardcoded fallback — admins must set the timezone on each clinic via
//   Settings. If unset, /slots returns a 422 with a clear message so the
//   booking UI can surface the misconfiguration instead of silently guessing.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { addMinutes, parseISO, isAfter, isBefore } from "https://esm.sh/date-fns@3.6.0";
import { fromZonedTime } from "https://esm.sh/date-fns-tz@3.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function slugify(first: string, last: string): string {
  return `${first}-${last}`.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

/**
 * Compose the UTC moment for `timeStr` (HH:MM, clinic-local wall clock) on the
 * calendar date represented by `date` (a UTC-anchored Date from parseISO of an
 * ISO date string). The returned Date is a true UTC instant.
 */
function setTimeOnDate(date: Date, timeStr: string, tz: string): Date {
  const [h, m] = timeStr.split(":").map((n: string) => parseInt(n, 10));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return fromZonedTime(`${year}-${month}-${day}T${hh}:${mm}:00`, tz);
}

function rangesOverlap(aS: Date, aE: Date, bS: Date, bE: Date): boolean {
  return isBefore(aS, bE) && isAfter(aE, bS);
}

function generateSlots(start: Date, end: Date, breakStart: Date | null, breakEnd: Date | null, durationMinutes: number) {
  const slots: { start: string; end: string }[] = [];
  const INTERVAL = 15;
  let cursor = new Date(start);
  while (true) {
    const slotEnd = addMinutes(cursor, durationMinutes);
    if (isAfter(slotEnd, end)) break;
    if (breakStart && breakEnd && rangesOverlap(cursor, slotEnd, breakStart, breakEnd)) {
      cursor = addMinutes(cursor, INTERVAL);
      continue;
    }
    slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString() });
    cursor = addMinutes(cursor, INTERVAL);
  }
  return slots;
}

/**
 * Strict resolution: the provider's primary clinic's timezone is the single
 * source of truth. No hardcoded fallback. Returns null if no primary clinic
 * assignment exists or the assigned clinic has no timezone set — callers must
 * surface that as a configuration error, not silently default.
 */
async function resolveProviderTz(admin: any, providerId: string): Promise<string | null> {
  const { data: assignment } = await admin
    .from("provider_clinic_assignments")
    .select("clinics:clinic_id(timezone)")
    .eq("provider_id", providerId)
    .eq("is_primary", true)
    .maybeSingle();
  return (assignment?.clinics as any)?.timezone ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "providers";

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // ── /providers ─ list all marketplace-enabled providers w/ active membership ──
    if (path === "providers") {
      const { data: providers, error } = await admin
        .from("providers")
        .select("id, first_name, last_name, credentials, specialty, marketplace_bio, user_id")
        .eq("is_active", true)
        .eq("marketplace_enabled", true)
        .order("last_name");
      if (error) throw error;

      const ids = (providers || []).map((p: any) => p.id);
      const userIds = (providers || []).map((p: any) => p.user_id).filter(Boolean);

      let skillsByProvider: Record<string, any[]> = {};
      let activeMembershipIds = new Set<string>();
      let avatarByUserId: Record<string, string> = {};

      if (ids.length > 0) {
        const [skillsRes, membershipsRes] = await Promise.all([
          admin.from("provider_skills").select("provider_id, skill_name, modality, certification_level").in("provider_id", ids),
          admin.from("provider_memberships").select("provider_id, tier").eq("is_active", true).in("provider_id", ids),
        ]);
        activeMembershipIds = new Set((membershipsRes.data || []).map((m: any) => m.provider_id));
        for (const s of (skillsRes.data || [])) {
          if (!skillsByProvider[s.provider_id]) skillsByProvider[s.provider_id] = [];
          skillsByProvider[s.provider_id].push(s);
        }
      }

      if (userIds.length > 0) {
        const { data: profiles } = await admin
          .from("profiles")
          .select("user_id, avatar_url")
          .in("user_id", userIds);
        for (const p of (profiles || [])) {
          if (p.avatar_url) avatarByUserId[p.user_id] = p.avatar_url;
        }
      }

      const result = (providers || [])
        .filter((p: any) => activeMembershipIds.has(p.id))
        .map((p: any) => ({
          id: p.id,
          slug: slugify(p.first_name, p.last_name),
          first_name: p.first_name,
          last_name: p.last_name,
          credentials: p.credentials,
          specialty: p.specialty,
          bio: p.marketplace_bio,
          avatar_url: p.user_id ? (avatarByUserId[p.user_id] || null) : null,
          skills: skillsByProvider[p.id] || [],
        }));

      return new Response(JSON.stringify({ providers: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── /provider ─ single provider by slug ────────────────────────────────────
    if (path === "provider") {
      const slug = url.searchParams.get("slug");
      if (!slug) return new Response(JSON.stringify({ error: "slug required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { data: providers } = await admin
        .from("providers")
        .select("id, first_name, last_name, credentials, specialty, marketplace_bio, user_id")
        .eq("is_active", true)
        .eq("marketplace_enabled", true);

      const provider = (providers || []).find((p: any) => slugify(p.first_name, p.last_name) === slug);
      if (!provider) {
        return new Response(JSON.stringify({ error: "Provider not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: membership } = await admin
        .from("provider_memberships")
        .select("tier")
        .eq("provider_id", provider.id)
        .eq("is_active", true)
        .maybeSingle();

      if (!membership) {
        return new Response(JSON.stringify({ error: "Provider not currently accepting bookings" }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: skills } = await admin
        .from("provider_skills")
        .select("skill_name, modality, certification_level")
        .eq("provider_id", provider.id);

      let avatar_url: string | null = null;
      if (provider.user_id) {
        const { data: profile } = await admin
          .from("profiles")
          .select("avatar_url")
          .eq("user_id", provider.user_id)
          .maybeSingle();
        avatar_url = profile?.avatar_url || null;
      }

      return new Response(JSON.stringify({
        provider: {
          id: provider.id,
          slug,
          first_name: provider.first_name,
          last_name: provider.last_name,
          credentials: provider.credentials,
          specialty: provider.specialty,
          bio: provider.marketplace_bio,
          avatar_url,
          skills: skills || [],
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── /treatments ─ public catalog ─────────────────────────────────────────
    if (path === "treatments") {
      const { data, error } = await admin
        .from("treatments")
        .select("id, name, duration_minutes, price, category, description")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return new Response(JSON.stringify({ treatments: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── /slots ─ available slots for a provider on a given date ──────────────
    if (path === "slots") {
      const slug = url.searchParams.get("slug");
      const dateStr = url.searchParams.get("date");
      const treatmentId = url.searchParams.get("treatment_id");
      if (!slug || !dateStr || !treatmentId) {
        return new Response(JSON.stringify({ error: "slug, date, and treatment_id are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: providers } = await admin
        .from("providers")
        .select("id, first_name, last_name")
        .eq("is_active", true)
        .eq("marketplace_enabled", true);
      const provider = (providers || []).find((p: any) => slugify(p.first_name, p.last_name) === slug);
      if (!provider) {
        return new Response(JSON.stringify({ error: "Provider not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: treatment } = await admin
        .from("treatments")
        .select("id, duration_minutes")
        .eq("id", treatmentId)
        .single();
      if (!treatment) {
        return new Response(JSON.stringify({ error: "Treatment not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Resolve clinic timezone strictly from the provider's primary clinic.
      // Surface a configuration error if unset rather than silently guessing.
      const tz = await resolveProviderTz(admin, provider.id);
      if (!tz) {
        return new Response(JSON.stringify({
          error: "This provider's primary clinic has no timezone configured. An admin can set it in Settings.",
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const date = parseISO(dateStr);
      const dayOfWeek = date.getUTCDay();

      const { data: overrides } = await admin
        .from("provider_availability_overrides")
        .select("*")
        .eq("provider_id", provider.id)
        .eq("override_date", dateStr);

      let workingBlocks: { start: Date; end: Date; breakStart: Date | null; breakEnd: Date | null }[] = [];

      const offOverride = (overrides || []).find((o: any) => !o.is_available);
      if (offOverride) {
        return new Response(JSON.stringify({ slots: [], clinic_timezone: tz }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const customOverride = (overrides || []).find((o: any) => o.is_available && o.start_time && o.end_time);
      if (customOverride) {
        workingBlocks.push({
          start: setTimeOnDate(date, customOverride.start_time, tz),
          end: setTimeOnDate(date, customOverride.end_time, tz),
          breakStart: null,
          breakEnd: null,
        });
      } else {
        const { data: avail } = await admin
          .from("provider_availability")
          .select("*")
          .eq("provider_id", provider.id)
          .eq("day_of_week", dayOfWeek)
          .eq("is_active", true);
        workingBlocks = (avail || []).map((b: any) => ({
          start: setTimeOnDate(date, b.start_time, tz),
          end: setTimeOnDate(date, b.end_time, tz),
          breakStart: b.break_start ? setTimeOnDate(date, b.break_start, tz) : null,
          breakEnd: b.break_end ? setTimeOnDate(date, b.break_end, tz) : null,
        }));
      }

      const allSlots = workingBlocks.flatMap((b) =>
        generateSlots(b.start, b.end, b.breakStart, b.breakEnd, treatment.duration_minutes || 30),
      );

      // Conflict-check window: clinic-local midnight → midnight in UTC instants.
      const dayStartUtc = setTimeOnDate(date, "00:00", tz);
      const dayEndUtc = setTimeOnDate(date, "23:59", tz);
      const { data: existing } = await admin
        .from("appointments")
        .select("scheduled_at, duration_minutes")
        .eq("provider_id", provider.id)
        .gte("scheduled_at", dayStartUtc.toISOString())
        .lt("scheduled_at", dayEndUtc.toISOString())
        .neq("status", "cancelled")
        .neq("status", "no_show");

      const available = allSlots.filter((s) => {
        const sStart = parseISO(s.start);
        const sEnd = parseISO(s.end);
        return !(existing || []).some((apt: any) => {
          const aStart = parseISO(apt.scheduled_at);
          const aEnd = addMinutes(aStart, apt.duration_minutes ?? 30);
          return rangesOverlap(sStart, sEnd, aStart, aEnd);
        });
      });

      return new Response(JSON.stringify({ slots: available, clinic_timezone: tz }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown path. Use ?path=providers|provider|treatments|slots" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("marketplace-listings error:", msg, err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
