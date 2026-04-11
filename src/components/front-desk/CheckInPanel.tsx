import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { PatientBriefCard } from "./PatientBriefCard";
import { IdentityVerifyPanel } from "./IdentityVerifyPanel";
import { ConsentWorkflow } from "./ConsentWorkflow";
import { InsurancePanel } from "./InsurancePanel";
import {
  CheckCircle2, Loader2, DoorOpen, AlertTriangle, FileCheck, Sparkles, ShieldCheck,
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
  const [tab, setTab] = useState("checkin");

  const { data: rooms } = useQuery({
    queryKey: ["rooms-list"],
    queryFn: async () => {
      const { data } = await supabase.from("rooms").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: pendingConsents } = useQuery({
    queryKey: ["pending-consents", appointment?.patients?.id],
    enabled: !!appointment?.patients?.id,
    queryFn: async () => {
      const { data } = await supabase.from("e_consents")
        .select("id")
        .eq("patient_id", appointment.patients.id);
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

  const hasConsents = (pendingConsents?.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />Check In — {patientName}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="checkin" className="text-xs">Check-In</TabsTrigger>
            <TabsTrigger value="identity" className="text-xs">ID Verify</TabsTrigger>
            <TabsTrigger value="consent" className="text-xs">Consent</TabsTrigger>
            <TabsTrigger value="insurance" className="text-xs">Insurance</TabsTrigger>
          </TabsList>

          <TabsContent value="checkin" className="space-y-4 mt-3">
            {/* Consent Status */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <FileCheck className="h-3 w-3" />Consent Status
              </Label>
              {hasConsents ? (
                <Badge variant="secondary" className="text-xs bg-success/10 text-success">
                  <CheckCircle2 className="h-3 w-3 mr-1" />{pendingConsents!.length} consent(s) on file
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />No consents — collect before check-in
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
          </TabsContent>

          <TabsContent value="identity" className="mt-3">
            {appointment?.patients && (
              <IdentityVerifyPanel patient={appointment.patients} />
            )}
          </TabsContent>

          <TabsContent value="consent" className="mt-3">
            {appointment?.patients?.id && (
              <ConsentWorkflow
                patientId={appointment.patients.id}
                patientName={patientName}
                appointmentId={appointment.id}
              />
            )}
          </TabsContent>

          <TabsContent value="insurance" className="mt-3">
            {appointment?.patients?.id && (
              <InsurancePanel patientId={appointment.patients.id} />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
