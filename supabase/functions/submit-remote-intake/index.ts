import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletion } from "../_shared/bedrock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Handle "mark opened" ping — early return
    if (body._markOpened && body.token) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await supabaseAdmin.from("intake_invitations").update({
        opened_at: new Date().toISOString(),
        status: "opened",
      }).eq("token", body.token).eq("status", "sent");
      return new Response(JSON.stringify({ success: true, opened: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle token lookup — returns patient demographics for pre-fill (replaces anon SELECT on intake_invitations)
    if (body._lookupToken && body.token) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: inv } = await supabaseAdmin
        .from("intake_invitations")
        .select("focus_areas, patients(first_name, last_name, email, phone, date_of_birth, gender)")
        .eq("token", body.token)
        .single();
      if (!inv) {
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, invitation: inv }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      firstName, lastName, email, phone, dob, sex,
      weightLbs, heightIn, menoStatus,
      focus, symptoms, goals, medications, priorTherapy,
      contraindications, allergies, labValues,
      generalSig, telehealthSig, generalConsentText, telehealthConsentText,
      userAgent,
      invitation_token, existing_patient_id,
    } = body;

    // Basic validation
    if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      return new Response(JSON.stringify({ error: "Name and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!generalSig || !telehealthSig) {
      return new Response(JSON.stringify({ error: "Both consent signatures are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let patientId: string;

    if (existing_patient_id) {
      const { data: existingPatient, error: epErr } = await supabaseAdmin
        .from("patients")
        .select("id")
        .eq("id", existing_patient_id)
        .single();

      if (epErr || !existingPatient) {
        const { data: patient, error: pErr } = await supabaseAdmin.from("patients").insert({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone?.trim() || null,
          date_of_birth: dob || null,
          gender: sex || null,
          is_active: true,
        }).select("id").single();
        if (pErr) throw pErr;
        patientId = patient.id;
      } else {
        patientId = existingPatient.id;
        await supabaseAdmin.from("patients").update({
          phone: phone?.trim() || undefined,
          date_of_birth: dob || undefined,
          gender: sex || undefined,
        }).eq("id", patientId);
      }
    } else {
      const { data: patient, error: pErr } = await supabaseAdmin.from("patients").insert({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        date_of_birth: dob || null,
        gender: sex || null,
        is_active: true,
      }).select("id").single();
      if (pErr) throw pErr;
      patientId = patient.id;
    }

    // Build lab data
    const labData: Record<string, number | null> = {};
    const labKeys = ["lab_tt", "lab_ft", "lab_e2", "lab_tsh", "lab_hgb", "lab_hct", "lab_a1c", "lab_psa",
      "lab_fsh", "lab_lh", "lab_p4", "lab_shbg", "lab_dhea", "lab_ft3", "lab_ft4", "lab_igf1",
      "lab_b12", "lab_vitd", "lab_crp", "lab_alt", "lab_ast", "lab_glc", "lab_fins", "lab_rbc",
      "lab_crt", "lab_prl", "lab_calcitonin", "lab_igfbp3", "lab_folate"];
    
    if (labValues && typeof labValues === "object") {
      for (const key of labKeys) {
        const v = labValues[key];
        labData[key] = v != null && v !== "" ? parseFloat(String(v)) : null;
      }
    }

    // Create intake form
    const { data: intakeForm, error: ifErr } = await supabaseAdmin.from("intake_forms").insert({
      patient_id: patientId,
      form_type: "remote_hormone",
      responses: {
        focus: focus || [],
        symptoms: symptoms || [],
        goals: goals || [],
        medications: medications || "",
        priorTherapy: priorTherapy || "",
        contraindications: contraindications || [],
        allergies: allergies || "",
        sex, weightLbs, heightIn, menoStatus,
        consent: { general: true, telehealth: true, timestamp: new Date().toISOString() },
      },
      submitted_at: new Date().toISOString(),
    }).select("id").single();

    if (ifErr) console.error("Intake form error:", ifErr);

    // Create hormone visit with labs
    const { data: hormoneVisit, error: hvErr } = await supabaseAdmin.from("hormone_visits").insert({
      patient_id: patientId,
      ...labData,
      intake_symptoms: symptoms || [],
      intake_goals: goals || [],
      intake_focus: focus || [],
      peptide_categories: (focus || []).filter((f: string) => f.startsWith("peptide_")),
      peptide_contraindications: contraindications || [],
    }).select("id").single();

    if (hvErr) console.error("Hormone visit error:", hvErr);

    // Save e-consents
    const consents = [];
    if (generalSig) {
      consents.push({
        patient_id: patientId,
        consent_type: "general",
        consent_text: generalConsentText || "General consent",
        signature_data: generalSig,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
        user_agent: userAgent || null,
      });
    }
    if (telehealthSig) {
      consents.push({
        patient_id: patientId,
        consent_type: "telehealth",
        consent_text: telehealthConsentText || "Telehealth consent",
        signature_data: telehealthSig,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
        user_agent: userAgent || null,
      });
    }
    if (consents.length > 0) {
      await supabaseAdmin.from("e_consents").insert(consents);
    }

    // Update invitation if token provided
    if (invitation_token) {
      try {
        await supabaseAdmin.from("intake_invitations").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          intake_form_id: intakeForm?.id || null,
        }).eq("token", invitation_token);
      } catch (e) {
        console.error("Invitation update error:", e);
      }
    }

    // Auto-create front desk notification
    try {
      await supabaseAdmin.from("patient_communication_log").insert({
        patient_id: patientId,
        direction: "inbound",
        channel: "portal",
        subject: "Remote Intake Submitted — Book Telehealth",
        body: `${firstName} ${lastName} submitted a remote intake form. Focus areas: ${(focus || []).join(", ") || "Hormone optimization"}. Ready for telehealth appointment booking.`,
        is_read: false,
      });
    } catch (e) {
      console.error("Auto-task creation error:", e);
    }

    // ── Auto-trigger AI hormone recommendation (fire-and-forget) ──
    if (hormoneVisit?.id) {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        // Fire-and-forget: call ai-hormone-rec in background
        (async () => {
          try {
            const visitPayload = {
              ...labData,
              intake_symptoms: symptoms || [],
              intake_goals: goals || [],
              intake_focus: focus || [],
              peptide_categories: (focus || []).filter((f: string) => f.startsWith("peptide_")),
              peptide_contraindications: contraindications || [],
              visit_date: new Date().toISOString(),
            };

            const patientPayload = {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              gender: sex || null,
              sex: sex || null,
              weight_lbs: weightLbs || null,
              height_in: heightIn || null,
              focus: focus || [],
              symptoms: symptoms || [],
              goals: goals || [],
              contraindications: contraindications || [],
              medications: medications || "",
            };

            const aiRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-hormone-rec`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                patient: patientPayload,
                visit: visitPayload,
                priorVisits: [],
              }),
            });

            if (aiRes.ok) {
              const rec = await aiRes.json();
              // Save AI recommendation and sections to the hormone visit
              await supabaseAdmin.from("hormone_visits").update({
                ai_recommendation: rec.summary || "AI recommendation generated",
                ai_sections: {
                  summary: rec.summary || "",
                  treatment_recommendation: rec.treatment_recommendation || "",
                  monitoring_plan: rec.monitoring_plan || "",
                  risk_flags: rec.risk_flags || "",
                },
              }).eq("id", hormoneVisit.id);
              console.log("AI hormone rec auto-generated for visit", hormoneVisit.id);
            } else {
              console.error("AI hormone rec failed:", aiRes.status, await aiRes.text());
            }
          } catch (aiErr) {
            console.error("AI hormone rec error:", aiErr);
          }
        })();
      }
    }

    return new Response(JSON.stringify({ success: true, patientId, intakeFormId: intakeForm?.id || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("submit-remote-intake error:", err);
    return new Response(JSON.stringify({ error: "Submission failed. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});