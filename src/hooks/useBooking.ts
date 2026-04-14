// src/hooks/useBooking.ts
//
// React hook for the marketplace booking engine edge function.
// Creates a booking with slot validation, Stripe deposit, and intake email.
//
// Usage:
//   const { createBooking } = useBooking();
//   const result = await createBooking.mutateAsync({ slug: "dr-smith", ... });
//   // result.stripe_client_secret → pass to Stripe.js to confirm payment

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BookingRequest {
  slug: string;
  treatment_id: string;
  scheduled_start: string; // ISO8601
  first_name: string;
  last_name: string;
  date_of_birth: string; // YYYY-MM-DD
  email: string;
  phone?: string;
  client_source?: "spa_acquired" | "provider_acquired";
  notes?: string;
}

export interface BookingResponse {
  confirmation_code: string;
  appointment_id: string;
  marketplace_appt_id: string | null;
  scheduled_start: string;
  scheduled_end: string;
  provider: {
    id: string;
    name: string;
    slug: string;
  };
  treatment: {
    id: string;
    name: string;
    duration_minutes: number;
  };
  patient_id: string;
  service_amount: number;
  deposit_amount: number;
  balance_amount: number;
  client_source: string;
  stripe_client_secret: string | null;
  intake_required: boolean;
  intake_treatment_id: string;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useBooking() {
  const queryClient = useQueryClient();

  const createBooking = useMutation({
    mutationFn: async (params: BookingRequest): Promise<BookingResponse> => {
      const { data, error } = await supabase.functions.invoke("booking-engine", {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as BookingResponse;
    },
    onSuccess: (data) => {
      // Invalidate appointment and marketplace queries so lists refresh
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      toast.success(`Booking confirmed! Code: ${data.confirmation_code}`);
    },
    onError: (e: Error) => {
      // Handle specific error types
      if (e.message?.includes("no longer available")) {
        toast.error("That time slot was just taken. Please choose another time.");
      } else if (e.message?.includes("subscription")) {
        toast.error("This provider is not currently accepting bookings.");
      } else {
        toast.error(e.message || "Booking failed");
      }
    },
  });

  return { createBooking };
}
