import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format } from "date-fns";
import { QueueCard } from "@/components/front-desk/QueueCard";
import { ActionBar } from "@/components/front-desk/ActionBar";
import { QuickDock } from "@/components/front-desk/QuickDock";
import { InvitationTracker } from "@/components/front-desk/InvitationTracker";
import { CheckInPanel } from "@/components/front-desk/CheckInPanel";
import {
  UserPlus, CheckCircle2, DoorOpen, Play, Flag, Clock, Users,
  Loader2, AlertTriangle, Search, RefreshCw,
} from "lucide-react";

type QueueStatus = "booked" | "checked_in" | "roomed" | "in_progress" | "completed" | "no_show" | "cancelled";

const QUEUE_COLUMNS: { status: QueueStatus; label: string; icon: React.ElementType; color: string }[] = [
  { status: "booked", label: "Scheduled", icon: Clock, color: "border-t-primary" },
  { status: "checked_in", label: "Waiting", icon: Users, color: "border-t-warning" },
  { status: "roomed", label: "Roomed", icon: DoorOpen, color: "border-t-info" },
  { status: "in_progress", label: "In Progress", icon: Play, color: "border-t-accent" },
  { status: "completed", label: "Completed", icon: CheckCircle2, color: "border-t-success" },
  { status: "no_show", label: "No-Show", icon: AlertTriangle, color: "border-t-destructive" },
];

type StatusFilter = "all" | "checked_in" | "completed" | "no_show";

export default function FrontDesk() {
  const queryClient = useQueryClient();
  const [walkinOpen, setWalkinOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchParams, setSearchParams] = useSearchParams();
  const focusedPatientId = searchParams.get("patientId");
  const returnTo = searchParams.get("returnTo") || undefined;
  const [focusOpen, setFocusOpen] = useState(false);

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["frontdesk-today"],
    queryFn: async () => {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(id, first_name, last_name, date_of_birth, phone, no_show_count), providers(id, first_name, last_name), treatments(id, name, duration_minutes), rooms:room_id(id, name)")
        .gte("scheduled_at", start)
        .lt("scheduled_at", end)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15000,
  });

  // When ?patientId=… is present, build a check-in context for that patient
  // (uses today's appointment if one exists, otherwise a minimal patient-only stub).
  const { data: focusedPatient } = useQuery({
    queryKey: ["fd-focused-patient", focusedPatientId],
    enabled: !!focusedPatientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, first_name, last_name, date_of_birth, phone, no_show_count")
        .eq("id", focusedPatientId!)
        .maybeSingle();
      return data;
    },
  });

  const focusedAppointment = useMemo(() => {
    if (!focusedPatientId) return null;
    const todayApt = (appointments ?? []).find(
      (a: any) => a.patient_id === focusedPatientId || a.patients?.id === focusedPatientId,
    );
    if (todayApt) return todayApt;
    if (!focusedPatient) return null;
    // Synthetic appointment so CheckInPanel can render consent for this patient.
    return {
      id: null,
      patient_id: focusedPatient.id,
      patients: focusedPatient,
      treatments: null,
      providers: null,
      rooms: null,
      status: "booked",
      notes: "",
    };
  }, [focusedPatientId, focusedPatient, appointments]);

  useEffect(() => {
    if (focusedPatientId && focusedAppointment) setFocusOpen(true);
  }, [focusedPatientId, focusedAppointment]);

  const { data: patients } = useQuery({
    queryKey: ["all-patients-fd"],
    queryFn: async () => {
      const { data } = await supabase.from("patients").select("id, first_name, last_name, date_of_birth, phone").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const { data: treatments } = useQuery({
    queryKey: ["all-treatments-fd"],
    queryFn: async () => {
      const { data } = await supabase.from("treatments").select("id, name, duration_minutes").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "checked_in") updates.checked_in_at = new Date().toISOString();
      if (status === "roomed") updates.roomed_at = new Date().toISOString();
      if (status === "completed") updates.completed_at = new Date().toISOString();
      const { error } = await supabase.from("appointments").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["frontdesk-today"] });
      toast.success("Status updated");
    },
  });

  // Reverts a single mark-as-no-show: restore prior status, decrement counter.
  // Pulled out so both the toast Undo action and the after-the-fact "Restore"
  // button on no-show rows share the same code path.
  const restoreFromNoShow = async (
    appointmentId: string,
    targetStatus: string,
    patientId: string | null | undefined,
    decrementNoShowCount: boolean,
  ) => {
    const updates: {
      status: string;
      checked_in_at?: string;
      completed_at?: string;
    } = { status: targetStatus };
    if (targetStatus === "checked_in") updates.checked_in_at = new Date().toISOString();
    if (targetStatus === "completed") updates.completed_at = new Date().toISOString();
    // Cast on .update() because `status` is a generated DB enum and we're
    // passing dynamic values; the values are constrained by RESTORE_TARGETS
    // which only contains valid appointment_status enum members.
    const { error } = await supabase
      .from("appointments")
      .update(updates as never)
      .eq("id", appointmentId);
    if (error) throw error;

    if (decrementNoShowCount && patientId) {
      // Floor at 0 so we never go negative if there's a race or an old fix-up.
      const { data: p } = await supabase
        .from("patients")
        .select("no_show_count")
        .eq("id", patientId)
        .single();
      const next = Math.max(0, (p?.no_show_count ?? 0) - 1);
      await supabase.from("patients").update({ no_show_count: next }).eq("id", patientId);
    }
  };

  const markNoShow = useMutation({
    mutationFn: async (id: string) => {
      const apt = appointments?.find((a: any) => a.id === id);
      const prevStatus = (apt?.status as string) ?? "booked";
      const patientId = apt?.patients?.id ?? null;

      const { error } = await supabase.from("appointments").update({ status: "no_show" as any }).eq("id", id);
      if (error) throw error;

      if (patientId) {
        await supabase.from("patients").update({
          no_show_count: (apt.patients.no_show_count || 0) + 1,
        }).eq("id", patientId);
      }

      return { id, prevStatus, patientId };
    },
    onSuccess: ({ id, prevStatus, patientId }) => {
      queryClient.invalidateQueries({ queryKey: ["frontdesk-today"] });
      // Toast with an Undo action. Sonner keeps the toast visible for the
      // configured duration (10s); clicking Undo within that window reverts
      // both the status and the patient's no_show_count.
      toast.success("Marked as no-show", {
        duration: 10_000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await restoreFromNoShow(id, prevStatus, patientId, true);
              queryClient.invalidateQueries({ queryKey: ["frontdesk-today"] });
              toast.success("No-show undone");
            } catch (e) {
              toast.error(`Undo failed: ${e instanceof Error ? e.message : String(e)}`);
            }
          },
        },
      });
    },
  });

  // After-the-fact restore (used by the No-Show filter view, when the toast
  // is gone). Lets front-desk pick which status the appointment should
  // actually be in — common case is "patient called, they DID show" so it
  // becomes 'completed', but we also support 'booked' (mistake, reschedule)
  // and 'checked_in' (they're here now, late).
  const restoreNoShow = useMutation({
    mutationFn: async ({ id, targetStatus, patientId }: { id: string; targetStatus: string; patientId: string | null }) => {
      await restoreFromNoShow(id, targetStatus, patientId, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["frontdesk-today"] });
      toast.success("No-show reversed");
    },
    onError: (e: Error) => toast.error(`Restore failed: ${e.message}`),
  });

  const createWalkin = useMutation({
    mutationFn: async (formData: FormData) => {
      const existingId = formData.get("existing_patient_id") as string;
      let patientId = existingId;
      if (!existingId) {
        // Phase 3 #5: guard against creating ghost patient records. Without
        // an existing patient AND without first/last name, the previous
        // form would silently insert {first_name: "", last_name: ""} into
        // patients, producing rows that can't be searched or contacted.
        const firstName = (formData.get("first_name") as string ?? "").trim();
        const lastName = (formData.get("last_name") as string ?? "").trim();
        if (!firstName || !lastName) {
          throw new Error("First name and last name are required for new walk-ins");
        }
        const { data: newPatient, error: patErr } = await supabase.from("patients").insert({
          first_name: firstName,
          last_name: lastName,
          date_of_birth: formData.get("dob") as string || null,
          phone: formData.get("phone") as string || null,
        }).select("id").single();
        if (patErr) throw patErr;
        patientId = newPatient.id;
      }
      const { error } = await supabase.from("appointments").insert({
        patient_id: patientId,
        scheduled_at: new Date().toISOString(),
        status: "checked_in" as any,
        checked_in_at: new Date().toISOString(),
        treatment_id: (formData.get("treatment_id") as string) || null,
        duration_minutes: 30,
        notes: "Walk-in",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["frontdesk-today"] });
      queryClient.invalidateQueries({ queryKey: ["all-patients-fd"] });
      setWalkinOpen(false);
      toast.success("Walk-in checked in");
    },
    onError: () => toast.error("Failed to create walk-in"),
  });

  const filtered = appointments?.filter((apt: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${apt.patients?.first_name} ${apt.patients?.last_name}`.toLowerCase();
    return name.includes(q) || apt.treatments?.name?.toLowerCase().includes(q);
  }) ?? [];

  const stats = {
    total: filtered.length,
    waiting: filtered.filter((a: any) => a.status === "checked_in").length,
    completed: filtered.filter((a: any) => a.status === "completed").length,
    noShow: filtered.filter((a: any) => a.status === "no_show").length,
  };

  return (
    <div className="space-y-4 pb-16">
      {/* AI Action Bar */}
      <ActionBar />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Front Desk</h1>
          <p className="text-muted-foreground text-sm">
            Today — {format(new Date(), "EEEE, MMMM d")} · {stats.total} appointments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search patients..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 w-48" />
          </div>
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["frontdesk-today"] })}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* KPI Strip — click a card to filter the queue */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { key: "all" as const, label: "Total", value: stats.total, icon: Users,
            iconBg: "bg-primary/10", iconText: "text-primary",
            activeRing: "ring-2 ring-primary bg-primary/5" },
          { key: "checked_in" as const, label: "Waiting", value: stats.waiting, icon: Clock,
            iconBg: "bg-warning/10", iconText: "text-warning",
            activeRing: "ring-2 ring-warning bg-warning/5" },
          { key: "completed" as const, label: "Completed", value: stats.completed, icon: CheckCircle2,
            iconBg: "bg-success/10", iconText: "text-success",
            activeRing: "ring-2 ring-success bg-success/5" },
          { key: "no_show" as const, label: "No-Show", value: stats.noShow, icon: AlertTriangle,
            iconBg: "bg-destructive/10", iconText: "text-destructive",
            activeRing: "ring-2 ring-destructive bg-destructive/5" },
        ]).map((kpi) => {
          const active = statusFilter === kpi.key;
          return (
            <button
              key={kpi.key}
              type="button"
              onClick={() => setStatusFilter(active && kpi.key !== "all" ? "all" : kpi.key)}
              aria-pressed={active ? "true" : "false"}
              title={kpi.key === "all" ? "Show all appointments" : `Filter to ${kpi.label}`}
              className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
            >
              <Card className={`p-3 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer ${active ? kpi.activeRing : ""}`}>
                <div className="flex items-center gap-2">
                  <div className={`h-8 w-8 rounded-lg ${kpi.iconBg} flex items-center justify-center`}>
                    <kpi.icon className={`h-4 w-4 ${kpi.iconText}`} />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium uppercase">{kpi.label}</p>
                    <p className="text-lg font-bold">{kpi.value}</p>
                  </div>
                </div>
              </Card>
            </button>
          );
        })}
      </div>
      {statusFilter !== "all" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Filtered to <strong className="text-foreground">{
              statusFilter === "checked_in" ? "Waiting" : statusFilter === "completed" ? "Completed" : "No-Show"
            }</strong>
          </span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setStatusFilter("all")}>
            Clear filter
          </Button>
        </div>
      )}

      {/* Queue Board */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className={`grid grid-cols-1 gap-4 ${statusFilter === "all" ? "md:grid-cols-3 lg:grid-cols-6" : ""}`}>
          {QUEUE_COLUMNS.filter((col) => statusFilter === "all" || col.status === statusFilter).map((col) => {
            const colApts = filtered.filter((a: any) => a.status === col.status);
            return (
              <div key={col.status} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <col.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{col.label}</span>
                  <Badge variant="secondary" className="ml-auto text-[11px] h-5">{colApts.length}</Badge>
                </div>
                <div className={`space-y-2 min-h-[120px] rounded-lg border-t-2 ${col.color} bg-muted/20 p-2`}>
                  {colApts.length === 0 && (
                    <p className="text-[11px] text-muted-foreground/50 text-center py-6">No patients</p>
                  )}
                  {colApts.map((apt: any) => (
                    <QueueCard
                      key={apt.id}
                      apt={apt}
                      onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
                      onNoShow={(id) => markNoShow.mutate(id)}
                      onRestore={(id, targetStatus) =>
                        restoreNoShow.mutate({
                          id,
                          targetStatus,
                          patientId: apt.patients?.id ?? null,
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Invitation Tracker */}
      <InvitationTracker />

      {/* Walk-In Dialog */}
      <Dialog open={walkinOpen} onOpenChange={setWalkinOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Quick Walk-In</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createWalkin.mutate(new FormData(e.currentTarget)); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Existing Patient</Label>
              <select name="existing_patient_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">— New Patient —</option>
                {patients?.map((p) => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
              </select>
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">Or create a new patient (first &amp; last name required):</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="walkin-first" className="text-xs">First Name</Label>
                <Input id="walkin-first" name="first_name" autoComplete="given-name" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="walkin-last" className="text-xs">Last Name</Label>
                <Input id="walkin-last" name="last_name" autoComplete="family-name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">DOB</Label><Input name="dob" type="date" /></div>
              <div className="space-y-1"><Label className="text-xs">Phone</Label><Input name="phone" type="tel" /></div>
            </div>
            <div className="space-y-2">
              <Label>Treatment</Label>
              <select name="treatment_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">General Visit</option>
                {treatments?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <Button type="submit" className="w-full" disabled={createWalkin.isPending}>
              {createWalkin.isPending ? "Processing..." : "Check In Walk-In"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick Action Dock */}
      <QuickDock onWalkIn={() => setWalkinOpen(true)} patients={patients || []} />

      {/* Auto-opened consent panel when navigated here with ?patientId=… */}
      {focusedAppointment && (
        <CheckInPanel
          appointment={focusedAppointment}
          open={focusOpen}
          onOpenChange={(o) => {
            setFocusOpen(o);
            if (!o) {
              // Clear the deep-link params so the panel doesn't re-open on re-render.
              const next = new URLSearchParams(searchParams);
              next.delete("patientId");
              next.delete("returnTo");
              setSearchParams(next, { replace: true });
            }
          }}
          defaultTab="consent"
          returnTo={returnTo}
        />
      )}
    </div>
  );
}
