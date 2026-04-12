import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const {
      firstName, lastName, email, phone, dob, sex,
      weightLbs, heightIn, menoStatus,
      focus, symptoms, goals, medications, priorTherapy,
      contraindications, allergies, labValues,
      generalSig, telehealthSig, generalConsentText, telehealthConsentText,
      userAgent,
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

    // Email format validation
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

    // Create patient
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
      patient_id: patient.id,
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
    await supabaseAdmin.from("hormone_visits").insert({
      patient_id: patient.id,
      ...labData,
      intake_symptoms: symptoms || [],
      intake_goals: goals || [],
      intake_focus: focus || [],
      peptide_categories: (focus || []).filter((f: string) => f.startsWith("peptide_")),
      peptide_contraindications: contraindications || [],
    });

    // Save e-consents
    const consents = [];
    if (generalSig) {
      consents.push({
        patient_id: patient.id,
        consent_type: "general",
        consent_text: generalConsentText || "General consent",
        signature_data: generalSig,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
        user_agent: userAgent || null,
      });
    }
    if (telehealthSig) {
      consents.push({
        patient_id: patient.id,
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

    // Auto-create front desk notification/task for telehealth booking
    try {
      await supabaseAdmin.from("patient_communication_log").insert({
        patient_id: patient.id,
        direction: "inbound",
        channel: "portal",
        subject: "Remote Intake Submitted — Book Telehealth",
        body: `${firstName} ${lastName} submitted a remote intake form. Focus areas: ${(focus || []).join(", ") || "Hormone optimization"}. Ready for telehealth appointment booking.`,
        is_read: false,
      });
    } catch (e) {
      console.error("Auto-task creation error:", e);
    }

    return new Response(JSON.stringify({ success: true, patientId: patient.id, intakeFormId: intakeForm?.id || null }), {
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
