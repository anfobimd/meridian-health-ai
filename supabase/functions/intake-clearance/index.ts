// supabase/functions/intake-clearance/index.ts
//
// Medical staff review queue for patient intake clearance before marketplace
// appointments proceed. State machine:
//   sent → client_submitted → pending_review → approved
//                                    ↓ (loop)
//                             changes_requested
//                                    ↓ (terminal)
//                                 rejected → refund triggered
//
// Actions:
//   "list_queue"        — list pending/all clearance requests
//   "get_detail"        — single clearance with intake response
//   "approve"           — approve, notify patient + provider
//   "request_changes"   — admin notes, resubmit loop
//   "reject"            — reject, cancel appointment, trigger refund
//   "submit_intake"     — patient submits intake (moves to pending_review)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { action } = body;

    // Auth check for admin/provider actions
    const authHeader = req.headers.get("Authorization");
    const userClient = authHeader
      ? createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
      : null;
    const { data: { user } } = userClient ? await userClient.auth.getUser() : { data: { user: null } };

    // ─── LIST QUEUE ──────────────────────────────────────────────────────
    if (action === "list_queue") {
      const { status = "pending_review", limit = 50 } = body;
      const { data, error } = await admin
        .from("intake_clearance_requests")
        .select(`
          id, status, created_at, submitted_at, pending_review_at,
          admin_notes, resubmission_count,
          patient:patients(id, first_name, last_name, date_of_birth, email),
          appointment:appointments(id, scheduled_start, treatment_id)
        `)
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return new Response(JSON.stringify({ requests: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── GET DETAIL ──────────────────────────────────────────────────────
    if (action === "get_detail") {
      const { id } = body;
      const { data: req_row, error } = await admin
        .from("intake_clearance_requests")
        .select(`
          *,
          patient:patients(*),
          appointment:appointments(*),
          template:intake_form_templates(*)
        `)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!req_row) return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      // Audit log the view (HIPAA)
      if (user) {
        await admin.from("audit_logs").insert({
          user_id: user.id,
          resource_type: "intake_clearance_request",
          resource_id: id,
          action: "viewed",
          details: { patient_id: req_row.patient_id },
        });
      }

      return new Response(JSON.stringify(req_row), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SUBMIT INTAKE (patient-facing) ───────────────────────────────────
    if (action === "submit_intake") {
      const { appointment_id, template_id, responses, signature_data } = body;
      if (!appointment_id) {
        return new Response(JSON.stringify({ error: "appointment_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find or create clearance request
      let { data: existing } = await admin
        .from("intake_clearance_requests")
        .select("*")
        .eq("appointment_id", appointment_id)
        .maybeSingle();

      let clearanceId = existing?.id;
      if (!existing) {
        const { data: appt } = await admin
          .from("appointments").select("patient_id").eq("id", appointment_id).single();
        const { data: newClearance, error: insErr } = await admin
          .from("intake_clearance_requests")
          .insert({
            appointment_id,
            patient_id: appt?.patient_id,
            template_id: template_id || null,
            status: "pending_review",
            submitted_at: new Date().toISOString(),
            pending_review_at: new Date().toISOString(),
          })
          .select().single();
        if (insErr) throw insErr;
        clearanceId = newClearance.id;
      } else {
        await admin
          .from("intake_clearance_requests")
          .update({
            status: "pending_review",
            submitted_at: new Date().toISOString(),
            pending_review_at: new Date().toISOString(),
            resubmission_count: existing.status === "changes_requested" ? existing.resubmission_count + 1 : existing.resubmission_count,
          })
          .eq("id", existing.id);
      }

      // Record e_consent if signature provided
      if (signature_data) {
        const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signature_data));
        const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
        await admin.from("signature_audit_log").insert({
          resource_type: "intake_form",
          resource_id: clearanceId,
          action: "signed",
          signature_hash: hash,
          ip_address: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null,
          user_agent: req.headers.get("user-agent"),
          details: { responses_count: Object.keys(responses || {}).length },
        });
      }

      return new Response(JSON.stringify({ submitted: true, clearance_id: clearanceId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── APPROVE ─────────────────────────────────────────────────────────
    if (action === "approve") {
      const { id } = body;
      if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      const { data: updated, error } = await admin
        .from("intake_clearance_requests")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .in("status", ["client_submitted", "pending_review"])
        .select(`*, appointment:appointments(*), patient:patients(*)`)
        .single();

      if (error) throw error;

      // Trigger approval email via send-email
      if (updated?.patient?.email) {
        await admin.functions.invoke("send-email", {
          body: {
            action: "send_template",
            to: updated.patient.email,
            template_id: "clearance_approved",
            dynamic_data: {
              first_name: updated.patient.first_name,
              appointment_date: updated.appointment?.scheduled_start,
            },
          },
        }).catch(e => console.error("Email send failed:", e));
      }

      await admin.from("audit_logs").insert({
        user_id: user.id,
        resource_type: "intake_clearance_request",
        resource_id: id,
        action: "approved",
      });

      return new Response(JSON.stringify(updated), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── REQUEST CHANGES ─────────────────────────────────────────────────
    if (action === "request_changes") {
      const { id, admin_notes } = body;
      if (!admin_notes?.trim()) {
        return new Response(JSON.stringify({ error: "admin_notes required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: updated, error } = await admin
        .from("intake_clearance_requests")
        .update({
          status: "changes_requested",
          admin_notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(`*, patient:patients(*)`)
        .single();
      if (error) throw error;

      if (updated?.patient?.email) {
        await admin.functions.invoke("send-email", {
          body: {
            action: "send_template",
            to: updated.patient.email,
            template_id: "clearance_changes",
            dynamic_data: {
              first_name: updated.patient.first_name,
              admin_notes,
            },
          },
        }).catch(e => console.error("Email send failed:", e));
      }

      return new Response(JSON.stringify(updated), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── REJECT (cancel + refund) ────────────────────────────────────────
    if (action === "reject") {
      const { id, admin_notes } = body;
      if (!admin_notes?.trim()) {
        return new Response(JSON.stringify({ error: "admin_notes required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      const { data: clearance } = await admin
        .from("intake_clearance_requests")
        .select(`*, appointment:appointments(id, deposit_payment_id, deposit_amount), patient:patients(*)`)
        .eq("id", id)
        .single();

      // 1. Mark clearance rejected
      await admin
        .from("intake_clearance_requests")
        .update({
          status: "rejected",
          admin_notes,
          rejected_at: new Date().toISOString(),
          rejected_by: user.id,
        })
        .eq("id", id);

      // 2. Cancel appointment
      if (clearance?.appointment?.id) {
        await admin.from("appointments").update({ status: "cancelled" }).eq("id", clearance.appointment.id);
      }

      // 3. Trigger refund if deposit exists
      let refundAmount: number | null = null;
      if (clearance?.appointment?.deposit_payment_id) {
        try {
          const refundResp = await admin.functions.invoke("stripe-refund", {
            body: {
              payment_intent_id: clearance.appointment.deposit_payment_id,
              reason: "requested_by_customer",
              metadata: { clearance_id: id, reason: "MD rejection" },
            },
          });
          refundAmount = clearance.appointment.deposit_amount;
          await admin.from("intake_clearance_requests").update({
            deposit_refunded: true,
            deposit_refund_amount: refundAmount,
          }).eq("id", id);
        } catch (e) {
          console.error("Refund failed:", e);
        }
      }

      // 4. Notify patient
      if (clearance?.patient?.email) {
        await admin.functions.invoke("send-email", {
          body: {
            action: "send_template",
            to: clearance.patient.email,
            template_id: "clearance_rejected",
            dynamic_data: {
              first_name: clearance.patient.first_name,
              reason: admin_notes,
              refund_amount: refundAmount,
            },
          },
        }).catch(e => console.error("Email send failed:", e));
      }

      await admin.from("audit_logs").insert({
        user_id: user.id,
        resource_type: "intake_clearance_request",
        resource_id: id,
        action: "rejected",
        details: { refund_amount: refundAmount },
      });

      return new Response(JSON.stringify({ rejected: true, refund_amount: refundAmount }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[intake-clearance] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
