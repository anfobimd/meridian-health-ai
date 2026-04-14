// src/hooks/useLabExtraction.ts
//
// React hook for the upgraded ai-extract-labs edge function.
// Supports both vision mode (image/PDF) and text mode (CSV, HL7, paste).
//
// UPGRADE: Now includes text extraction mode and optional auto-upsert.
//
// Usage:
//   const { extractFromImage, extractFromText } = useLabExtraction();
//
//   // Vision mode (existing Lovable behavior)
//   const labs = await extractFromImage.mutateAsync({ mediaType: "image/png", base64Data: "..." });
//
//   // Text mode (NEW — from Piyush)
//   const labs = await extractFromText.mutateAsync({ text: "Total Testosterone: 450 ng/dL\n..." });
//
//   // With auto-upsert to database
//   const labs = await extractFromText.mutateAsync({
//     text: "...",
//     patient_id: "uuid",
//     encounter_id: "uuid",
//   });

import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LabValues {
  [key: string]: number | null;
  // Core hormone keys: tt, ft, e2, p4, lh, fsh, shbg, prl, psa, dhea
  // Thyroid: tsh, ft3, ft4
  // CBC: hgb, hct, rbc
  // Metabolic: glc, a1c
  // Liver: alt, ast
  // Renal: crt
  // Extended: igf1, fins, crp, igfbp3, calcitonin, b12, folate, vitd
}

export interface VisionExtractionRequest {
  mediaType: string; // e.g. "image/png", "image/jpeg", "application/pdf"
  base64Data: string;
  patient_id?: string; // if provided, auto-upserts to lab_results
  encounter_id?: string;
  lab_order_id?: string;
}

export interface TextExtractionRequest {
  text: string;
  patient_id?: string;
  encounter_id?: string;
  lab_order_id?: string;
}

export interface VisionExtractionResponse {
  labs: LabValues;
  upserted: number;
}

export interface TextExtractionResponse {
  labs: LabValues;
  patientName: string | null;
  collectionDate: string | null;
  source: "hl7" | "csv" | "text";
  upserted: number;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useLabExtraction() {
  /** Vision mode: extract labs from image or PDF (existing Lovable behavior) */
  const extractFromImage = useMutation({
    mutationFn: async (params: VisionExtractionRequest): Promise<VisionExtractionResponse> => {
      const { data, error } = await supabase.functions.invoke("ai-extract-labs", {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as VisionExtractionResponse;
    },
    onSuccess: (data) => {
      const count = Object.values(data.labs).filter((v) => v !== null).length;
      toast.success(`Extracted ${count} lab values from document`);
      if (data.upserted > 0) {
        toast.info(`${data.upserted} values saved to patient record`);
      }
    },
    onError: (e: Error) => {
      if (e.message?.includes("Rate limited")) {
        toast.error("AI is busy — please try again in a moment.");
      } else if (e.message?.includes("credits")) {
        toast.error("AI credits exhausted — contact admin.");
      } else {
        toast.error(e.message || "Lab extraction failed");
      }
    },
  });

  /** Text mode: extract labs from CSV, HL7, or pasted text (NEW — from Piyush) */
  const extractFromText = useMutation({
    mutationFn: async (params: TextExtractionRequest): Promise<TextExtractionResponse> => {
      const { data, error } = await supabase.functions.invoke("ai-extract-labs", {
        body: { mode: "text", ...params },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as TextExtractionResponse;
    },
    onSuccess: (data) => {
      const count = Object.keys(data.labs).length;
      const sourceLabel = data.source === "hl7" ? "HL7 message" : data.source === "csv" ? "CSV data" : "text";
      toast.success(`Extracted ${count} lab values from ${sourceLabel}`);
      if (data.patientName) {
        toast.info(`Patient name detected: ${data.patientName}`);
      }
      if (data.upserted > 0) {
        toast.info(`${data.upserted} values saved to patient record`);
      }
    },
    onError: (e: Error) => {
      toast.error(e.message || "Text extraction failed");
    },
  });

  return { extractFromImage, extractFromText };
}

// ─── Helper: Apply extracted labs to form state ──────────────────────────────

/**
 * Applies extracted lab values to a form state object.
 * Maps bare keys (tt, ft, e2...) to prefixed keys (lab_tt, lab_ft, lab_e2...).
 * Compatible with HormoneIntake.tsx's setLabValues pattern.
 *
 * Usage:
 *   const applied = applyLabsToForm(data.labs, existingFormValues);
 *   setLabValues(applied);
 */
export function applyLabsToForm(
  labs: LabValues,
  existing: Record<string, string> = {},
): Record<string, string> {
  const result = { ...existing };
  for (const [key, val] of Object.entries(labs)) {
    if (val != null && val !== undefined) {
      result[`lab_${key}`] = String(val);
    }
  }
  return result;
}
