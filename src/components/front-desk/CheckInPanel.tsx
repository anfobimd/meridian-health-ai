import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { PatientBriefCard } from "./PatientBriefCard";
import {
  CheckCircle2, Loader2, DoorOpen, AlertTriangle, FileCheck, Sparkles,
} from "lucide-react";

export function CheckInPanel({ appointment, open, onOpenChange }: {
  appointment: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [roomId, setRoomId] = useState(appointment?.room_id || "");
  const [notes, setNotes] = useState("");
  const [showBrief, setShowBrief] = useState(false);
  const [checking, setChecking] = useState(false);

  const { data: rooms } = useQuery({
    queryKey: ["rooms-list"],
    queryFn: async () => {
      const { data } = await supabase.from("rooms").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: pendingConsents } = useQuery({
    queryKey: ["pending-consents", appointment?.id],
    enabled: !!appointment?.id,
    queryFn: async () => {
      const { data } = await supabase.from("patient_consents")
        .select("id, consent_text, status")
        .eq("appointment_id", appointment.id)
        .eq("status", "pending");
      return data ?? [];
    },
  });

  const patientName = `${appointment?.patients?.first_name || ""} ${appointment?.patients?.last_name || ""}`.trim();

  const handleCheckIn = async () => {
    setChecking(true);
    try {
      const updates: any = {
        status: "checked_in" as any,
        checked_in_at: new Date().toISOString(),
      };
      if (roomId) updates.room_id = roomId;
      if (notes) updates.notes = [appointment?.notes, notes].filter(Boolean).join(" | ");

      const { error } = await supabase.from("appointments").update(updates).eq("id", appointment.id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["frontdesk-today"] });
      toast.success(`${patientName} checked in`);
      onOpenChange(false);
    } catch {
      toast.error("Check-in failed");
    } finally {
      setChecking(false);
    }
  };

  const hasPendingConsents = (pendingConsents?.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />Check In — {patientName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Consent Status */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <FileCheck className="h-3 w-3" />Consent Status
            </Label>
            {hasPendingConsents ? (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />{pendingConsents!.length} consent(s) pending
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs bg-success/10 text-success">
                <CheckCircle2 className="h-3 w-3 mr-1" />All consents signed
              </Badge>
            )}
          </div>

          {/* Room Assignment */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <DoorOpen className="h-3 w-3" />Room Assignment
            </Label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="">— No Room —</option>
              {rooms?.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Check-in Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Check-In Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes for this visit…"
              className="h-16 text-sm"
            />
          </div>

          <Separator />

          {/* AI Patient Brief */}
          {showBrief ? (
            <PatientBriefCard
              patientId={appointment?.patient_id}
              patientName={patientName}
              onClose={() => setShowBrief(false)}
            />
          ) : (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setShowBrief(true)}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5 text-primary" />View AI Patient Brief
            </Button>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleCheckIn} disabled={checking}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Check In
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
