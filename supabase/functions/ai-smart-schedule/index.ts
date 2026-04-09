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
    const { action, appointment_id, treatment_id, scheduled_at, duration_minutes, patient_id } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Fetch context data
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

    // If treatment selected, find required devices
    const requiredDeviceIds = (requirements ?? [])
      .filter((r: any) => r.treatment_id === treatment_id && r.is_required)
      .map((r: any) => r.device_id);

    const requiredDevices = (devices ?? []).filter((d: any) => requiredDeviceIds.includes(d.id));

    // Check for device conflicts at the requested time
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

    // Find occupied rooms at the requested time
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

    // Count today's appointments per provider for load balancing
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

    // Build AI prompt
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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
- "has_conflict": boolean — true if a device would be double-booked
- "conflict_message": string or null — explanation of the conflict
- "recommended_room_id": string or null — UUID of best room
- "recommended_room_name": string or null
- "room_reasoning": string — why this room
- "recommended_device_id": string or null — UUID if treatment needs a device
- "recommended_provider_id": string or null — UUID of best provider
- "recommended_provider_name": string or null
- "provider_reasoning": string — why this provider`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
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
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content ?? "{}";

    // Parse JSON from AI (handle possible markdown fences)
    let recommendation;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      recommendation = JSON.parse(cleaned);
    } catch {
      recommendation = { error: "Failed to parse AI recommendation", raw: content };
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
