import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Clock, CheckCircle2, DoorOpen, CircleDot } from "lucide-react";
import { format } from "date-fns";

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  booked: { label: "Scheduled", icon: Clock, color: "bg-muted text-muted-foreground" },
  confirmed: { label: "Confirmed", icon: CircleDot, color: "bg-info/10 text-info dark:bg-info dark:text-info" },
  checked_in: { label: "Checked In", icon: CheckCircle2, color: "bg-primary/10 text-primary" },
  roomed: { label: "Roomed", icon: DoorOpen, color: "bg-accent text-accent-foreground" },
  in_progress: { label: "In Progress", icon: CircleDot, color: "bg-warning/10 text-warning dark:bg-warning dark:text-warning" },
  completed: { label: "Completed", icon: CheckCircle2, color: "bg-primary/10 text-primary" },
};

export default function ProviderCheckIn() {
  const { user } = useAuth();
  const [myProviderId, setMyProviderId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setMyProviderId(data?.id ?? null));
  }, [user]);

  const today = format(new Date(), "yyyy-MM-dd");

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["provider-checkin", myProviderId, today],
    enabled: !!myProviderId,
    queryFn: async () => {
      const startOfDay = `${today}T00:00:00`;
      const endOfDay = `${today}T23:59:59`;
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(first_name, last_name, phone), treatments(name)")
        .eq("provider_id", myProviderId!)
        .gte("scheduled_at", startOfDay)
        .lte("scheduled_at", endOfDay)
        .order("scheduled_at");
      if (error) throw error;
      return data;
    },
  });

  const checkedIn = appointments?.filter((a: any) => ["checked_in", "roomed", "in_progress", "completed"].includes(a.status)).length ?? 0;
  const total = appointments?.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today's Patients</h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(), "EEEE, MMMM d, yyyy")} — {checkedIn}/{total} checked in
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !myProviderId ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Users className="mx-auto h-10 w-10 mb-2" />
            <p>No provider record linked to your account.</p>
          </CardContent>
        </Card>
      ) : !appointments?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Users className="mx-auto h-10 w-10 mb-2" />
            <p>No appointments scheduled for today.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {appointments.map((a: any) => {
            const config = statusConfig[a.status] || statusConfig.booked;
            const StatusIcon = config.icon;
            return (
              <Card key={a.id} className={a.status === "checked_in" ? "border-primary/30" : ""}>
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusIcon className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">
                        {a.patients?.first_name} {a.patients?.last_name}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(new Date(a.scheduled_at), "h:mm a")}</span>
                        {a.duration_minutes && <span>• {a.duration_minutes} min</span>}
                        {a.treatments?.name && <span>• {a.treatments.name}</span>}
                      </div>
                      {a.checked_in_at && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Checked in at {format(new Date(a.checked_in_at), "h:mm a")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={config.color}>{config.label}</Badge>
                    {a.room_id && (
                      <Badge variant="outline" className="text-[11px]">
                        <DoorOpen className="h-3 w-3 mr-1" /> Room
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
