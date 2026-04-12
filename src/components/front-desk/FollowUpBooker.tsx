import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { addDays, format } from "date-fns";
import { CalendarPlus, Loader2, Sparkles } from "lucide-react";

export function FollowUpBooker({
  patientId,
  patientName,
  suggestion,
  suggestedDays,
  treatmentId,
  providerId,
}: {
  patientId: string;
  patientName: string;
  suggestion: string;
  suggestedDays: number | null;
  treatmentId?: string;
  providerId?: string;
}) {
  const suggestedDate = suggestedDays
    ? format(addDays(new Date(), suggestedDays), "yyyy-MM-dd")
    : format(addDays(new Date(), 14), "yyyy-MM-dd");

  const [date, setDate] = useState(suggestedDate);
  const [time, setTime] = useState("10:00");
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);

  const handleBook = async () => {
    setBooking(true);
    try {
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
      const { error } = await supabase.from("appointments").insert({
        patient_id: patientId,
        scheduled_at: scheduledAt,
        treatment_id: treatmentId || null,
        provider_id: providerId || null,
        duration_minutes: 30,
        status: "booked" as any,
        notes: "Follow-up (AI suggested)",
      });
      if (error) throw error;
      setBooked(true);
      toast.success(`Follow-up booked for ${patientName} on ${format(new Date(scheduledAt), "MMM d 'at' h:mm a")}`);
    } catch {
      toast.error("Failed to book follow-up");
    } finally {
      setBooking(false);
    }
  };

  if (booked) {
    return (
      <div className="flex items-center gap-2 text-sm text-success bg-success/10 rounded-md p-2">
        <CalendarPlus className="h-4 w-4" />Follow-up booked for {format(new Date(`${date}T${time}`), "MMM d")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <CalendarPlus className="h-3 w-3" />Follow-Up
      </h4>
      {suggestion && (
        <p className="text-xs bg-muted/50 rounded-md p-2 flex items-start gap-1.5">
          <Sparkles className="h-3 w-3 text-primary mt-0.5 shrink-0" />
          <span>{suggestion}</span>
        </p>
      )}
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-[10px]">Date</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="w-24 space-y-1">
          <Label className="text-[10px]">Time</Label>
          <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="h-8 text-xs" />
        </div>
      </div>
      <Button size="sm" className="w-full" onClick={handleBook} disabled={booking}>
        {booking ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CalendarPlus className="h-3.5 w-3.5 mr-1" />}
        Book Follow-Up
      </Button>
    </div>
  );
}
