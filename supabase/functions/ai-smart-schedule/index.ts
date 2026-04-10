import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { mode } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // ===== MARKETPLACE: Generate Bio =====
    if (mode === "generate_bio") {
      const { provider } = body;
      const prompt = `Write a professional, warm marketplace bio (2-3 sentences) for this aesthetic medicine provider:
Name: ${provider.first_name} ${provider.last_name}
Credentials: ${provider.credentials || "N/A"}
Specialty: ${provider.specialty || "Aesthetics"}
Skills: ${(provider.skills || []).join(", ") || "General aesthetics"}

Return JSON: {"bio": "..."}`;

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Return only valid JSON, no markdown." },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!aiResp.ok) throw new Error(`AI error: ${aiResp.status}`);
      const aiData = await aiResp.json();
      const content = aiData.choices?.[0]?.message?.content ?? "{}";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const result = JSON.parse(cleaned);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== MARKETPLACE: Match Providers =====
    if (mode === "marketplace_match") {
      const { treatment_id, preferred_date } = body;

      const [
        { data: treatment },
        { data: mpProviders },
        { data: skills },
        { data: availability },
        { data: memberships },
      ] = await Promise.all([
        sb.from("treatments").select("*").eq("id", treatment_id).single(),
        sb.from("providers").select("*").eq("is_active", true).eq("marketplace_enabled", true),
        sb.from("provider_skills").select("*"),
        sb.from("provider_availability").select("*").eq("is_active", true),
        sb.from("provider_memberships").select("*").eq("is_active", true),
      ]);

      const prompt = `You are a medspa provider matching AI. Rank these marketplace providers for the requested treatment.

TREATMENT: ${treatment?.name || "Unknown"} (${treatment?.category || "general"})

AVAILABLE PROVIDERS:
${(mpProviders ?? []).map((p: any) => {
  const pSkills = (skills ?? []).filter((s: any) => s.provider_id === p.id);
  const pAvail = (availability ?? []).filter((a: any) => a.provider_id === p.id);
  const pMembership = (memberships ?? []).find((m: any) => m.provider_id === p.id);
  return `- ${p.first_name} ${p.last_name} (${p.credentials || "N/A"}, ${p.specialty || "General"})
  Skills: ${pSkills.map((s: any) => `${s.skill_name}[${s.certification_level}]`).join(", ") || "none listed"}
  Availability: ${pAvail.map((a: any) => `Day${a.day_of_week} ${a.start_time}-${a.end_time}`).join(", ") || "not set"}
  Membership: ${pMembership ? pMembership.tier : "none"}
  ID: ${p.id}`;
}).join("\n\n")}

PREFERRED DATE: ${preferred_date || "flexible"}

Return JSON:
{
  "matches": [
    {"provider_id": "uuid", "provider_name": "Name", "score": 95, "reasoning": "Why this provider is a good match"}
  ]
}
Rank by skill match, certification level, and availability overlap. Return top 5 max.`;

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Return only valid JSON, no markdown." },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!aiResp.ok) throw new Error(`AI error: ${aiResp.status}`);
      const aiData = await aiResp.json();
      const content = aiData.choices?.[0]?.message?.content ?? "{}";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const result = JSON.parse(cleaned);
      return new Response(JSON.stringify({ ...result, treatment_id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== ORIGINAL: Room/Book scheduling =====
    const { action, appointment_id, treatment_id, scheduled_at, duration_minutes, patient_id } = body;

    const [
      { data: rooms },
      { data: devices },
      { data: requirements },
      { data: providers },
    ] = await Promise.all([
      sb.from("rooms").select("*, providers:assigned_provider_id(id, first_name, last_name, specialty)").eq("is_active", true).order("sort_order"),
      sb.from("devices").select("*, rooms:room_id(id, name)").eq("is_active", true),
      sb.from("treatment_device_requirements").select("*"),
      sb.from("providers").select("*").eq("is_active", true),
    ]);

    const requiredDeviceIds = (requirements ?? [])
      .filter((r: any) => r.treatment_id === treatment_id && r.is_required)
      .map((r: any) => r.device_id);

    const requiredDevices = (devices ?? []).filter((d: any) => requiredDeviceIds.includes(d.id));

    let conflicts: any[] = [];
    if (scheduled_at && requiredDeviceIds.length > 0) {
      const startTime = new Date(scheduled_at);
      const endTime = new Date(startTime.getTime() + (duration_minutes || 30) * 60000);
      const { data: overlapping } = await sb
        .from("appointments")
        .select("id, device_id, room_id, scheduled_at, duration_minutes, patients(first_name, last_name)")
        .in("device_id", requiredDeviceIds)
        .in("status", ["booked", "checked_in", "roomed", "in_progress"])
        .gte("scheduled_at", new Date(startTime.getTime() - 4 * 3600000).toISOString())
        .lte("scheduled_at", endTime.toISOString());
      conflicts = (overlapping ?? []).filter((apt: any) => {
        const aptStart = new Date(apt.scheduled_at);
        const aptEnd = new Date(aptStart.getTime() + (apt.duration_minutes || 30) * 60000);
        return aptStart < endTime && aptEnd > startTime;
      });
    }

    let occupiedRoomIds: string[] = [];
    if (scheduled_at) {
      const startTime = new Date(scheduled_at);
      const endTime = new Date(startTime.getTime() + (duration_minutes || 30) * 60000);
      const { data: roomAppts } = await sb
        .from("appointments")
        .select("room_id, scheduled_at, duration_minutes")
        .not("room_id", "is", null)
        .in("status", ["booked", "checked_in", "roomed", "in_progress"])
        .gte("scheduled_at", new Date(startTime.getTime() - 4 * 3600000).toISOString())
        .lte("scheduled_at", endTime.toISOString());
      occupiedRoomIds = (roomAppts ?? [])
        .filter((apt: any) => {
          const aptStart = new Date(apt.scheduled_at);
          const aptEnd = new Date(aptStart.getTime() + (apt.duration_minutes || 30) * 60000);
          return aptStart < endTime && aptEnd > startTime;
        })
        .map((apt: any) => apt.room_id);
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayAppts } = await sb
      .from("appointments")
      .select("provider_id")
      .gte("scheduled_at", todayStart.toISOString())
      .in("status", ["booked", "checked_in", "roomed", "in_progress"]);

    const providerLoad: Record<string, number> = {};
    (todayAppts ?? []).forEach((a: any) => {
      if (a.provider_id) providerLoad[a.provider_id] = (providerLoad[a.provider_id] || 0) + 1;
    });

    const prompt = `You are a medical clinic scheduling assistant. Given the following context, recommend the best room, device, and provider assignment.

ACTION: ${action} (either "book" for new booking or "room" for rooming a checked-in patient)

AVAILABLE ROOMS:
${(rooms ?? []).map((r: any) => `- ${r.name} (${r.room_type}) ${r.providers ? `— assigned to ${r.providers.first_name} ${r.providers.last_name}` : "— no assigned provider"} ${occupiedRoomIds.includes(r.id) ? "[OCCUPIED]" : "[AVAILABLE]"}`).join("\n")}

AVAILABLE DEVICES:
${(devices ?? []).map((d: any) => `- ${d.name} (${d.device_type}) ${d.rooms ? `in ${d.rooms.name}` : "not in a room"}`).join("\n")}

REQUIRED DEVICES FOR THIS TREATMENT: ${requiredDevices.length > 0 ? requiredDevices.map((d: any) => d.name).join(", ") : "None"}

DEVICE CONFLICTS: ${conflicts.length > 0 ? conflicts.map((c: any) => `${c.patients?.first_name} ${c.patients?.last_name} already using device at overlapping time`).join("; ") : "None"}

PROVIDERS (with today's patient load):
${(providers ?? []).map((p: any) => `- ${p.first_name} ${p.last_name} (${p.specialty || "General"}) — ${providerLoad[p.id] || 0} patients today`).join("\n")}

Respond with a JSON object (no markdown) with these keys:
- "has_conflict": boolean
- "conflict_message": string or null
- "recommended_room_id": string or null
- "recommended_room_name": string or null
- "room_reasoning": string
- "recommended_device_id": string or null
- "recommended_provider_id": string or null
- "recommended_provider_name": string or null
- "provider_reasoning": string`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a clinical scheduling AI. Return only valid JSON, no markdown fences." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content ?? "{}";
    let recommendation;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      recommendation = JSON.parse(cleaned);
    } catch {
      recommendation = { error: "Failed to parse AI recommendation", raw: content };
    }

    // Post-process: resolve AI-returned names back to real UUIDs
    if (recommendation && !recommendation.error) {
      // Resolve room ID
      if (recommendation.recommended_room_id && rooms) {
        const matchedRoom = (rooms as any[]).find((r: any) =>
          r.id === recommendation.recommended_room_id ||
          r.name?.toLowerCase() === String(recommendation.recommended_room_id).toLowerCase() ||
          r.name?.toLowerCase() === String(recommendation.recommended_room_name).toLowerCase()
        );
        if (matchedRoom) {
          recommendation.recommended_room_id = matchedRoom.id;
          recommendation.recommended_room_name = matchedRoom.name;
        } else {
          recommendation.recommended_room_id = null;
        }
      }
      // Resolve provider ID
      if (recommendation.recommended_provider_id && providers) {
        const matchedProvider = (providers as any[]).find((p: any) =>
          p.id === recommendation.recommended_provider_id ||
          `${p.first_name} ${p.last_name}`.toLowerCase() === String(recommendation.recommended_provider_id).toLowerCase() ||
          `${p.first_name} ${p.last_name}`.toLowerCase() === String(recommendation.recommended_provider_name).toLowerCase()
        );
        if (matchedProvider) {
          recommendation.recommended_provider_id = matchedProvider.id;
          recommendation.recommended_provider_name = `${matchedProvider.first_name} ${matchedProvider.last_name}`;
        } else {
          recommendation.recommended_provider_id = null;
        }
      }
    }

    return new Response(JSON.stringify(recommendation), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-smart-schedule error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
