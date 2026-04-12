import { useState, useEffect } from "react";
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
  CheckCircle2, Loader2, DoorOpen, AlertTriangle, FileCheck, Sparkles, ShieldAlert,
  Package, Heart,
} from "lucide-react";

export function CheckInPanel({ appointment, open, onOpenChange }: {
  appointment: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [roomId, setRoomId] = useState(appointment?.room_id || "");
  const [notes, setNotes] = useState("");
  const [showBrief, setShowBrief] = useState(true); // Auto-show AI brief
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

  // Check for active package credits
  const { data: packageCredits } = useQuery({
    queryKey: ["package-credits-checkin", appointment?.patients?.id],
    enabled: !!appointment?.patients?.id,
    queryFn: async () => {
      const { data } = await supabase.from("patient_package_purchases")
        .select("id, sessions_total, sessions_used, expires_at, packages:package_id(name)")
        .eq("patient_id", appointment.patients.id)
        .eq("status", "active");
      return (data ?? []).filter((p: any) => (p.sessions_total - (p.sessions_used || 0)) > 0);
    },
  });

  // Clearance check for invasive procedures
  const treatmentCategory = appointment?.treatments?.category?.toLowerCase() || "";
  const treatmentName = appointment?.treatments?.name?.toLowerCase() || "";
  const isInvasive = ["laser", "filler", "botox", "injection", "peel", "microneedling", "prp"].some(
    k => treatmentName.includes(k) || treatmentCategory.includes(k)
  );

  // Churn risk: check if patient hasn't visited in 90+ days
  const { data: lastVisit } = useQuery({
    queryKey: ["last-visit", appointment?.patients?.id],
    enabled: !!appointment?.patients?.id,
    queryFn: async () => {
      const { data } = await supabase.from("appointments")
        .select("completed_at")
        .eq("patient_id", appointment.patients.id)
        .eq("status", "completed" as any)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const daysSinceLastVisit = lastVisit?.completed_at
    ? Math.floor((Date.now() - new Date(lastVisit.completed_at).getTime()) / 86400000)
    : null;
  const isReturning = daysSinceLastVisit !== null && daysSinceLastVisit >= 90;

  const patientName = `${appointment?.patients?.first_name || ""} ${appointment?.patients?.last_name || ""}`.trim();

  const hasConsents = (pendingConsents?.length ?? 0) > 0;

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

          <TabsContent value="checkin" className="space-y-3 mt-3">
            {/* Churn Risk Re-engagement */}
            {isReturning && (
              <div className="flex items-start gap-2 bg-accent/10 rounded-md p-2.5 text-xs">
                <Heart className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Returning Patient — {daysSinceLastVisit} days since last visit</p>
                  <p className="text-muted-foreground">Consider a warm welcome and review any lapsed treatment plans.</p>
                </div>
              </div>
            )}

            {/* Clearance Warning */}
            {isInvasive && !hasConsents && (
              <div className="flex items-start gap-2 bg-destructive/10 rounded-md p-2.5 text-xs">
                <ShieldAlert className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-destructive">Clearance Required</p>
                  <p className="text-muted-foreground">This is an invasive procedure. Collect consent and verify clearance before check-in.</p>
                </div>
              </div>
            )}

            {/* Package Credits */}
            {(packageCredits?.length ?? 0) > 0 && (
              <div className="flex items-start gap-2 bg-primary/5 rounded-md p-2.5 text-xs">
                <Package className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Package Credits Available</p>
                  {packageCredits!.map(p => (
                    <p key={p.id} className="text-muted-foreground">
                      {p.package_name}: {p.sessions_total - (p.sessions_used || 0)} sessions remaining
                    </p>
                  ))}
                </div>
              </div>
            )}

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

            {/* AI Patient Brief — auto-loaded */}
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
