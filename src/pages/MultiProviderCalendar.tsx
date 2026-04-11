import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format, addDays, startOfWeek, isSameDay, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8 AM - 7 PM

export default function MultiProviderCalendar() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [selectedDay, setSelectedDay] = useState(new Date());

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const { data: providers = [] } = useQuery({
    queryKey: ["providers-calendar"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name").eq("is_active", true).order("last_name");
      return data || [];
    },
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms-calendar"],
    queryFn: async () => {
      const { data } = await supabase.from("rooms").select("id, name").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const rangeStart = viewMode === "day" ? format(selectedDay, "yyyy-MM-dd") : format(weekStart, "yyyy-MM-dd");
  const rangeEnd = viewMode === "day" ? format(addDays(selectedDay, 1), "yyyy-MM-dd") : format(addDays(weekStart, 7), "yyyy-MM-dd");

  const { data: appointments = [] } = useQuery({
    queryKey: ["calendar-appts", rangeStart, rangeEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("id, scheduled_at, duration_minutes, status, provider_id, room_id, patients(first_name, last_name), treatments(name)")
        .gte("scheduled_at", `${rangeStart}T00:00:00`)
        .lt("scheduled_at", `${rangeEnd}T23:59:59`)
        .neq("status", "cancelled")
        .order("scheduled_at");
      return data || [];
    },
  });

  const statusColor = (s: string) => {
    if (s === "completed") return "bg-emerald-500/20 border-emerald-500/40 text-emerald-700";
    if (s === "checked_in" || s === "roomed") return "bg-blue-500/20 border-blue-500/40 text-blue-700";
    if (s === "no_show") return "bg-destructive/20 border-destructive/40 text-destructive";
    return "bg-primary/10 border-primary/30 text-primary";
  };

  const getApptForSlot = (providerId: string, hour: number, day: Date) => {
    return appointments.filter((a: any) => {
      if (a.provider_id !== providerId) return false;
      const d = parseISO(a.scheduled_at);
      return isSameDay(d, day) && d.getHours() === hour;
    });
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Provider Calendar</h1>
          <p className="text-sm text-muted-foreground">Multi-provider schedule grid</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={viewMode} onValueChange={(v: "day" | "week") => setViewMode(v)}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => viewMode === "day" ? setSelectedDay(d => addDays(d, -1)) : setWeekStart(d => addDays(d, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {viewMode === "day" ? format(selectedDay, "EEE, MMM d") : `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d")}`}
          </span>
          <Button variant="outline" size="icon" onClick={() => viewMode === "day" ? setSelectedDay(d => addDays(d, 1)) : setWeekStart(d => addDays(d, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setSelectedDay(new Date()); setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 })); }}>Today</Button>
        </div>
      </div>

      {viewMode === "day" ? (
        <Card>
          <CardHeader><CardTitle>Day View — {format(selectedDay, "EEEE, MMMM d, yyyy")}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="grid" style={{ gridTemplateColumns: `80px repeat(${providers.length}, minmax(140px, 1fr))` }}>
              {/* Header */}
              <div className="border-b border-r p-2 bg-muted/50 text-xs font-medium">Time</div>
              {providers.map(p => (
                <div key={p.id} className="border-b p-2 bg-muted/50 text-xs font-medium text-center">{p.first_name} {p.last_name?.charAt(0)}.</div>
              ))}
              {/* Time slots */}
              {HOURS.map(hour => (
                <>
                  <div key={`h-${hour}`} className="border-b border-r p-2 text-xs text-muted-foreground">{format(new Date(2000, 0, 1, hour), "h a")}</div>
                  {providers.map(p => {
                    const appts = getApptForSlot(p.id, hour, selectedDay);
                    return (
                      <div key={`${p.id}-${hour}`} className="border-b min-h-[48px] p-0.5">
                        {appts.map((a: any) => (
                          <div key={a.id} className={cn("rounded px-1.5 py-0.5 text-[10px] border mb-0.5", statusColor(a.status))}>
                            <p className="font-medium truncate">{(a.patients as any)?.first_name} {(a.patients as any)?.last_name?.charAt(0)}.</p>
                            <p className="truncate opacity-70">{(a.treatments as any)?.name || "—"}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Week View</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="grid" style={{ gridTemplateColumns: `120px repeat(${weekDays.length}, minmax(100px, 1fr))` }}>
              <div className="border-b border-r p-2 bg-muted/50 text-xs font-medium">Provider</div>
              {weekDays.map(d => (
                <div key={d.toISOString()} className={cn("border-b p-2 bg-muted/50 text-xs font-medium text-center", isSameDay(d, new Date()) && "bg-primary/10")}>
                  {format(d, "EEE d")}
                </div>
              ))}
              {providers.map(p => (
                <>
                  <div key={`p-${p.id}`} className="border-b border-r p-2 text-xs font-medium">{p.first_name} {p.last_name?.charAt(0)}.</div>
                  {weekDays.map(d => {
                    const dayAppts = appointments.filter((a: any) => a.provider_id === p.id && isSameDay(parseISO(a.scheduled_at), d));
                    return (
                      <div key={`${p.id}-${d.toISOString()}`} className="border-b min-h-[40px] p-0.5">
                        {dayAppts.length > 0 && (
                          <Badge variant="secondary" className="text-[10px]">{dayAppts.length} appt{dayAppts.length > 1 ? "s" : ""}</Badge>
                        )}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Room utilization summary */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Room Utilization</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            {rooms.map(room => {
              const roomAppts = appointments.filter((a: any) => a.room_id === room.id);
              return (
                <div key={room.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{room.name}</p>
                  <p className="text-2xl font-bold">{roomAppts.length}</p>
                  <p className="text-[10px] text-muted-foreground">bookings</p>
                </div>
              );
            })}
            {rooms.length === 0 && <p className="text-sm text-muted-foreground col-span-4">No rooms configured</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
