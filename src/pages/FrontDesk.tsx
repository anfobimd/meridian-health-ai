import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format, parseISO, differenceInMinutes, isToday } from "date-fns";
import {
  UserPlus, CheckCircle2, DoorOpen, Play, Flag, Clock, Users,
  ArrowRight, Loader2, Sparkles, AlertTriangle, Search, RefreshCw,
} from "lucide-react";

type QueueStatus = "booked" | "checked_in" | "roomed" | "in_progress" | "completed" | "no_show" | "cancelled";

const QUEUE_COLUMNS: { status: QueueStatus; label: string; icon: React.ElementType; color: string }[] = [
  { status: "booked", label: "Scheduled", icon: Clock, color: "border-t-primary" },
  { status: "checked_in", label: "Waiting", icon: Users, color: "border-t-warning" },
  { status: "roomed", label: "Roomed", icon: DoorOpen, color: "border-t-info" },
  { status: "in_progress", label: "In Progress", icon: Play, color: "border-t-accent" },
  { status: "completed", label: "Completed", icon: CheckCircle2, color: "border-t-success" },
];

const statusBadgeClass: Record<string, string> = {
  booked: "bg-primary/10 text-primary",
  checked_in: "bg-warning/10 text-warning",
  roomed: "bg-info/10 text-info",
  in_progress: "bg-accent/10 text-accent-foreground",
  completed: "bg-success/10 text-success",
  no_show: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export default function FrontDesk() {
  const queryClient = useQueryClient();
  const [walkinOpen, setWalkinOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Today's appointments
  const { data: appointments, isLoading } = useQuery({
    queryKey: ["frontdesk-today"],
    queryFn: async () => {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(id, first_name, last_name, date_of_birth, phone), providers(id, first_name, last_name), treatments(id, name, duration_minutes), rooms:room_id(id, name)")
        .gte("scheduled_at", start)
        .lt("scheduled_at", end)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15000, // auto-refresh every 15s
  });

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

  const markNoShow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").update({ status: "no_show" as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["frontdesk-today"] });
      toast.success("Marked as no-show");
    },
  });

  // Walk-in: create patient + appointment in one step
  const createWalkin = useMutation({
    mutationFn: async (formData: FormData) => {
      const existingId = formData.get("existing_patient_id") as string;
      let patientId = existingId;

      if (!existingId) {
        const { data: newPatient, error: patErr } = await supabase.from("patients").insert({
          first_name: formData.get("first_name") as string,
          last_name: formData.get("last_name") as string,
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

  const nextAction = (status: string): { label: string; nextStatus: string; icon: React.ElementType } | null => {
    const map: Record<string, { label: string; nextStatus: string; icon: React.ElementType }> = {
      booked: { label: "Check In", nextStatus: "checked_in", icon: CheckCircle2 },
      checked_in: { label: "Room", nextStatus: "roomed", icon: DoorOpen },
      roomed: { label: "Start", nextStatus: "in_progress", icon: Play },
      in_progress: { label: "Complete", nextStatus: "completed", icon: Flag },
    };
    return map[status] || null;
  };

  const getWaitTime = (apt: any): string | null => {
    if (apt.status === "checked_in" && apt.checked_in_at) {
      const mins = differenceInMinutes(new Date(), parseISO(apt.checked_in_at));
      return `${mins}m`;
    }
    return null;
  };

  const filtered = appointments?.filter((apt: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${apt.patients?.first_name} ${apt.patients?.last_name}`.toLowerCase();
    return name.includes(q) || apt.treatments?.name?.toLowerCase().includes(q);
  }) ?? [];

  // KPI stats
  const stats = {
    total: filtered.length,
    waiting: filtered.filter((a: any) => a.status === "checked_in").length,
    completed: filtered.filter((a: any) => a.status === "completed").length,
    noShow: filtered.filter((a: any) => a.status === "no_show").length,
  };

  const avgWait = (() => {
    const waitingApts = filtered.filter((a: any) => a.status === "checked_in" && a.checked_in_at);
    if (!waitingApts.length) return 0;
    const total = waitingApts.reduce((sum: number, a: any) => sum + differenceInMinutes(new Date(), parseISO(a.checked_in_at)), 0);
    return Math.round(total / waitingApts.length);
  })();

  return (
    <div className="space-y-5">
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
            <Input
              placeholder="Search patients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 w-48"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["frontdesk-today"] })}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Dialog open={walkinOpen} onOpenChange={setWalkinOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><UserPlus className="h-3.5 w-3.5 mr-1.5" />Walk-In</Button>
            </DialogTrigger>
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
                <p className="text-xs text-muted-foreground">Or create a new patient:</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">First Name</Label><Input name="first_name" /></div>
                  <div className="space-y-1"><Label className="text-xs">Last Name</Label><Input name="last_name" /></div>
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
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center"><Users className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase">Total</p>
              <p className="text-lg font-bold">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center"><Clock className="h-4 w-4 text-warning" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase">Waiting</p>
              <p className="text-lg font-bold">{stats.waiting} <span className="text-xs font-normal text-muted-foreground">{avgWait > 0 && `(~${avgWait}m avg)`}</span></p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center"><CheckCircle2 className="h-4 w-4 text-success" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase">Completed</p>
              <p className="text-lg font-bold">{stats.completed}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center"><AlertTriangle className="h-4 w-4 text-destructive" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase">No-Show</p>
              <p className="text-lg font-bold">{stats.noShow}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Queue Board */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {QUEUE_COLUMNS.map((col) => {
            const colApts = filtered.filter((a: any) => a.status === col.status);
            return (
              <div key={col.status} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <col.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{col.label}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px] h-5">{colApts.length}</Badge>
                </div>
                <div className={`space-y-2 min-h-[120px] rounded-lg border-t-2 ${col.color} bg-muted/20 p-2`}>
                  {colApts.length === 0 && (
                    <p className="text-[11px] text-muted-foreground/50 text-center py-6">No patients</p>
                  )}
                  {colApts.map((apt: any) => {
                    const action = nextAction(apt.status);
                    const waitTime = getWaitTime(apt);
                    return (
                      <Card key={apt.id} className="shadow-sm">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm leading-tight">
                                {apt.patients?.first_name} {apt.patients?.last_name}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {format(parseISO(apt.scheduled_at), "h:mm a")}
                                {apt.treatments?.name && ` · ${apt.treatments.name}`}
                              </p>
                            </div>
                            {waitTime && (
                              <Badge variant="outline" className="text-[10px] text-warning border-warning/30">
                                <Clock className="h-2.5 w-2.5 mr-0.5" />{waitTime}
                              </Badge>
                            )}
                          </div>
                          {apt.providers && (
                            <p className="text-[10px] text-muted-foreground">Dr. {apt.providers.last_name}</p>
                          )}
                          {apt.rooms && (
                            <p className="text-[10px] text-muted-foreground">Room: {apt.rooms.name}</p>
                          )}
                          <div className="flex gap-1.5">
                            {action && (
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-[11px] flex-1"
                                onClick={() => updateStatus.mutate({ id: apt.id, status: action.nextStatus })}
                              >
                                <action.icon className="h-3 w-3 mr-1" />{action.label}
                              </Button>
                            )}
                            {apt.status === "booked" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-[11px] text-destructive"
                                onClick={() => markNoShow.mutate(apt.id)}
                              >
                                No-Show
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
