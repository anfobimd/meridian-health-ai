// src/hooks/useHormoneRecommendation.ts
//
// React hook for the upgraded ai-hormone-rec edge function.
// Supports: default recommendation, prescribe_check, and clearance_review.
//
// UPGRADE: Added clearance_review mode from Phase 2 merge.
//
// Usage:
//   const { getRecommendation, prescribeCheck, clearanceReview } = useHormoneRecommendation();
//
//   // Full recommendation (existing Lovable behavior)
//   const rec = await getRecommendation.mutateAsync({ patient, visit, priorVisits });
//
//   // Prescription validation (existing)
//   const check = await prescribeCheck.mutateAsync({ patient_id, medication_name, ... });
//
//   // Treatment clearance triage (NEW — from Piyush)
//   const triage = await clearanceReview.mutateAsync({ clearance_id: "uuid" });

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HormoneRecRequest {
  patient: {
    first_name?: string;
    last_name?: string;
    gender?: string;
    sex?: string;
    weight_lbs?: number;
    height_in?: number;
    focus?: string[];
    symptoms?: string[];
    goals?: string[];
    contraindications?: Record<string, boolean> | string[];
    medications?: string | string[];
  };
  visit: Record<string, unknown>; // lab_* fields + visit metadata
  priorVisits?: Record<string, unknown>[];
}

export interface HormoneRecResponse {
  summary: string;
  treatment_recommendation: string;
  monitoring_plan: string;
  risk_flags: string;
  lab_trends?: string;
  clearance_needed?: boolean;
}

export interface PrescribeCheckRequest {
  patient_id: string;
  medication_name: string;
  current_dosage?: string;
  route?: string;
  frequency?: string;
}

export interface PrescribeCheckResponse {
  suggested_dosage: string;
  titration_schedule?: string;
  monitoring_labs: string[];
  contraindications: string[];
  notes?: string;
  safety_level: "safe" | "caution" | "contraindicated";
}

export interface ClearanceReviewRequest {
  clearance_id: string;
}

export interface ClearanceTriageResponse {
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  recommendation: "clear" | "clear_with_conditions" | "defer" | "decline" | "physician_review";
  conditions?: string;
  contraindications_found?: string[];
  lab_concerns?: string[];
  triage_summary: string;
  monitoring_needed?: string[];
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useHormoneRecommendation() {
  const queryClient = useQueryClient();

  /** Full hormone + peptide recommendation (existing Lovable behavior) */
  const getRecommendation = useMutation({
    mutationFn: async (params: HormoneRecRequest): Promise<HormoneRecResponse> => {
      const { data, error } = await supabase.functions.invoke("ai-hormone-rec", {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as HormoneRecResponse;
    },
    onSuccess: () => {
      toast.success("AI recommendation generated");
    },
    onError: (e: Error) => {
      if (e.message?.includes("Rate limited")) {
        toast.error("AI is busy — please try again in a moment.");
      } else {
        toast.error(e.message || "Recommendation failed");
      }
    },
  });

  /** Prescription safety check (existing) */
  const prescribeCheck = useMutation({
    mutationFn: async (params: PrescribeCheckRequest): Promise<PrescribeCheckResponse> => {
      const { data, error } = await supabase.functions.invoke("ai-hormone-rec", {
        body: { mode: "prescribe_check", data: params },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as PrescribeCheckResponse;
    },
    onSuccess: (data) => {
      if (data.safety_level === "contraindicated") {
        toast.error("Contraindication detected — review required");
      } else if (data.safety_level === "caution") {
        toast.warning("Caution advised — see notes");
      } else {
        toast.success("Prescription validated");
      }
    },
    onError: (e: Error) => {
      toast.error(e.message || "Prescription check failed");
    },
  });

  /** Treatment clearance AI triage (NEW — from Piyush's clearance workflow) */
  const clearanceReview = useMutation({
    mutationFn: async (params: ClearanceReviewRequest): Promise<ClearanceTriageResponse> => {
      const { data, error } = await supabase.functions.invoke("ai-hormone-rec", {
        body: { mode: "clearance_review", ...params },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as ClearanceTriageResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["clearances"] });
      queryClient.invalidateQueries({ queryKey: ["intake-submissions"] });

      if (data.risk_level === "critical") {
        toast.error(`Critical risk (${data.risk_score}/100) — ${data.recommendation}`);
      } else if (data.risk_level === "high") {
        toast.warning(`High risk (${data.risk_score}/100) — physician review needed`);
      } else {
        toast.success(`Triage complete: ${data.recommendation} (risk ${data.risk_score}/100)`);
      }
    },
    onError: (e: Error) => {
      toast.error(e.message || "Clearance review failed");
    },
  });

  return { getRecommendation, prescribeCheck, clearanceReview };
}
