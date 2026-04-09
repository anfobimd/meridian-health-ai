import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Calendar, ClipboardList, Stethoscope, Clock, AlertTriangle } from "lucide-react";
import { format, isToday, parseISO } from "date-fns";

const statusColors: Record<string, string> = {
  booked: "bg-primary/10 text-primary",
  checked_in: "bg-warning/10 text-warning",
  in_progress: "bg-accent/10 text-accent",
  completed: "bg-success/10 text-success",
  no_show: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export default function Dashboard() {
  const { data: patients } = useQuery({
    queryKey: ["patients-count"],
    queryFn: async () => {
      const { count } = await supabase.from("patients").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: todayAppointments } = useQuery({
    queryKey: ["today-appointments"],
    queryFn: async () => {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
      const { data } = await supabase
        .from("appointments")
        .select("*, patients(first_name, last_name), providers(first_name, last_name), treatments(name)")
        .gte("scheduled_at", start)
        .lt("scheduled_at", end)
        .order("scheduled_at", { ascending: true });
      return data ?? [];
    },
  });

  const { data: recentNotes } = useQuery({
    queryKey: ["recent-notes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clinical_notes")
        .select("*, patients(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["providers-count"],
    queryFn: async () => {
      const { count } = await supabase.from("providers").select("*", { count: "exact", head: true }).eq("is_active", true);
      return count ?? 0;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to Meridian EHR — {format(new Date(), "EEEE, MMMM d, yyyy")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Patients" value={patients ?? 0} icon={Users} />
        <StatCard title="Today's Appointments" value={todayAppointments?.length ?? 0} icon={Calendar} />
        <StatCard title="Draft Notes" value={recentNotes?.filter((n: any) => n.status === "draft").length ?? 0} icon={ClipboardList} />
        <StatCard title="Active Providers" value={providers ?? 0} icon={Stethoscope} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-primary" />
              Today's Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayAppointments && todayAppointments.length > 0 ? (
              <div className="space-y-3">
                {todayAppointments.map((apt: any) => (
                  <div key={apt.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">
                        {apt.patients?.first_name} {apt.patients?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {apt.treatments?.name ?? "General"} • Dr. {apt.providers?.last_name ?? "Unassigned"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(apt.scheduled_at), "h:mm a")}
                      </span>
                      <Badge variant="secondary" className={statusColors[apt.status] ?? ""}>
                        {apt.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No appointments scheduled for today</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-primary" />
              Recent Clinical Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentNotes && recentNotes.length > 0 ? (
              <div className="space-y-3">
                {recentNotes.map((note: any) => (
                  <div key={note.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">
                        {note.patients?.first_name} {note.patients?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(note.created_at), "MMM d, yyyy")}
                        {note.ai_generated && " • AI Generated"}
                      </p>
                    </div>
                    <Badge variant="secondary" className={note.status === "draft" ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}>
                      {note.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No clinical notes yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
