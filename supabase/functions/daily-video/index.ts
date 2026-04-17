// supabase/functions/daily-video/index.ts
//
// Daily.co video room management for telehealth appointments.
// Actions:
//   "create_room"      — create Daily.co room, store in video_sessions, return URL + token
//   "get_join_token"   — generate time-limited patient join token (no login required)
//   "end_session"      — end active room, mark session complete
//   "list_sessions"    — list past sessions for an appointment/encounter
//
// Requires DAILY_API_KEY secret configured in Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAILY_API_BASE = "https://api.daily.co/v1";

interface CreateRoomOpts {
  appointment_id?: string;
  encounter_id?: string;
  patient_id: string;
  max_participants?: number;
  expires_in_minutes?: number;
  enable_recording?: boolean;
}

async function dailyFetch(path: string, init: RequestInit = {}) {
  const apiKey = Deno.env.get("DAILY_API_KEY");
  if (!apiKey) throw new Error("DAILY_API_KEY not configured");
  const res = await fetch(`${DAILY_API_BASE}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Daily.co ${path} failed: ${data?.error || JSON.stringify(data)}`);
  return data;
}

function genRoomName(patientId: string): string {
  const random = crypto.randomUUID().slice(0, 8);
  return `meridian-${patientId.slice(0, 8)}-${random}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { action } = body;

    // ─── CREATE ROOM ──────────────────────────────────────────────────────
    if (action === "create_room") {
      const {
        appointment_id,
        encounter_id,
        patient_id,
        max_participants = 4,
        expires_in_minutes = 120,
        enable_recording = false,
      }: CreateRoomOpts = body;

      if (!patient_id) {
        return new Response(
          JSON.stringify({ error: "patient_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const roomName = genRoomName(patient_id);
      const expiresAt = Math.floor(Date.now() / 1000) + expires_in_minutes * 60;

      const room = await dailyFetch("/rooms", {
        method: "POST",
        body: JSON.stringify({
          name: roomName,
          privacy: "private",
          properties: {
            max_participants,
            exp: expiresAt,
            enable_recording: enable_recording ? "cloud" : undefined,
            enable_screenshare: true,
            enable_chat: true,
            start_video_off: false,
            start_audio_off: false,
          },
        }),
      });

      // Generate provider join token (authenticated)
      const providerToken = await dailyFetch("/meeting-tokens", {
        method: "POST",
        body: JSON.stringify({
          properties: {
            room_name: roomName,
            is_owner: true,
            exp: expiresAt,
          },
        }),
      });

      // Record in DB
      const { data: session, error: insertErr } = await admin
        .from("video_sessions")
        .insert({
          room_name: roomName,
          room_url: room.url,
          appointment_id: appointment_id || null,
          encounter_id: encounter_id || null,
          patient_id,
          provider_token: providerToken.token,
          expires_at: new Date(expiresAt * 1000).toISOString(),
          status: "active",
          recording_enabled: enable_recording,
        })
        .select()
        .single();

      if (insertErr) {
        // Room created in Daily but DB insert failed — delete room to clean up
        await dailyFetch(`/rooms/${roomName}`, { method: "DELETE" }).catch(() => {});
        throw new Error(`DB insert failed: ${insertErr.message}`);
      }

      // If appointment linked, update it with the room URL
      if (appointment_id) {
        await admin
          .from("appointments")
          .update({ video_room_url: room.url })
          .eq("id", appointment_id);
      }

      return new Response(
        JSON.stringify({
          session_id: session.id,
          room_name: roomName,
          room_url: room.url,
          provider_token: providerToken.token,
          expires_at: session.expires_at,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── GET PATIENT JOIN TOKEN ──────────────────────────────────────────
    if (action === "get_join_token") {
      const { room_name, participant_name } = body;
      if (!room_name) {
        return new Response(
          JSON.stringify({ error: "room_name is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Verify the session exists and is still active
      const { data: session, error: fetchErr } = await admin
        .from("video_sessions")
        .select("*")
        .eq("room_name", room_name)
        .eq("status", "active")
        .maybeSingle();

      if (fetchErr || !session) {
        return new Response(
          JSON.stringify({ error: "Room not found or no longer active" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (new Date(session.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: "Room has expired" }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const token = await dailyFetch("/meeting-tokens", {
        method: "POST",
        body: JSON.stringify({
          properties: {
            room_name,
            is_owner: false,
            user_name: participant_name || "Patient",
            exp: Math.floor(new Date(session.expires_at).getTime() / 1000),
          },
        }),
      });

      return new Response(
        JSON.stringify({
          token: token.token,
          room_url: session.room_url,
          expires_at: session.expires_at,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── END SESSION ─────────────────────────────────────────────────────
    if (action === "end_session") {
      const { room_name } = body;
      if (!room_name) {
        return new Response(
          JSON.stringify({ error: "room_name is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Delete room in Daily.co
      await dailyFetch(`/rooms/${room_name}`, { method: "DELETE" }).catch(() => {});

      // Mark session ended in DB
      const { data: session } = await admin
        .from("video_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("room_name", room_name)
        .select()
        .maybeSingle();

      return new Response(
        JSON.stringify({ ended: true, session }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── LIST SESSIONS ───────────────────────────────────────────────────
    if (action === "list_sessions") {
      const { appointment_id, encounter_id, patient_id, limit = 20 } = body;
      let q = admin.from("video_sessions").select("*").order("created_at", { ascending: false }).limit(limit);
      if (appointment_id) q = q.eq("appointment_id", appointment_id);
      if (encounter_id) q = q.eq("encounter_id", encounter_id);
      if (patient_id) q = q.eq("patient_id", patient_id);
      const { data, error } = await q;
      if (error) throw error;
      return new Response(JSON.stringify({ sessions: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}. Valid: create_room, get_join_token, end_session, list_sessions` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[daily-video] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
