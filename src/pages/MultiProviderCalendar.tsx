import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format, addDays, startOfWeek, isSameDay, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, AlertTriangle, Loader2, Brain, Clock, ExternalLink } from "lucide-react";
import { getNoShowRisk } from "@/lib/no-show-risk";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8);

export default function MultiProviderCalendar() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [delays, setDelays] = useState<any[]>([]);
  const [utilization, setUtilization] = useState<any[]>([]);
  const [loadingDelays, setLoadingDelays] = useState(false);
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);

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
        .select("id, scheduled_at, duration_minutes, status, provider_id, room_id, patients(first_name, last_name, no_show_count), treatments(name)")
        .gte("scheduled_at", `${rangeStart}T00:00:00`)
        .lt("scheduled_at", `${rangeEnd}T23:59:59`)
        .neq("status", "cancelled")
        .order("scheduled_at");
      return data || [];
    },
  });

  // Running-behind detection (day view only)
  useEffect(() => {
    if (viewMode !== "day") return;
    const checkDelays = async () => {
      setLoadingDelays(true);
      try {
        const { data } = await supabase.functions.invoke("ai-schedule-optimizer", {
          body: { mode: "running_behind", data: { date: format(selectedDay, "yyyy-MM-dd") } },
        });
        setDelays(data?.delays || []);
        setUtilization(data?.utilization || []);
      } catch { /* non-fatal */ }
      setLoadingDelays(false);
    };
    checkDelays();
    const interval = setInterval(checkDelays, 120000); // refresh every 2 min
    return () => clearInterval(interval);
  }, [selectedDay, viewMode]);

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

  const getDelayForProvider = (providerId: string) => delays.filter(d => {
    const appt = appointments.find((a: any) => a.id === d.appointment_id);
    return appt && (appt as any).provider_id === providerId;
  });

  const getUtilForProvider = (providerId: string) => utilization.find(u => u.provider_id === providerId);

  return (
    <div className="space-y-6">
<div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Provider Calendar</h1>
          <p className="text-sm text-muted-foreground">Multi-provider schedule grid with AI delay detection</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={viewMode} onValueChange={(v: "day" | "week") => setViewMode(v)}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" aria-label={viewMode === "day" ? "Previous day" : "Previous week"} onClick={() => viewMode === "day" ? setSelectedDay(d => addDays(d, -1)) : setWeekStart(d => addDays(d, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {viewMode === "day" ? format(selectedDay, "EEE, MMM d") : `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d")}`}
          </span>
          <Button variant="outline" size="icon" aria-label={viewMode === "day" ? "Next day" : "Next week"} onClick={() => viewMode === "day" ? setSelectedDay(d => addDays(d, 1)) : setWeekStart(d => addDays(d, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setSelectedDay(new Date()); setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 })); }}>Today</Button>
        </div>
      </div>

      {/* Running-behind alerts */}
      {viewMode === "day" && delays.length > 0 && (
        <Card className="border-warning/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Running Behind — {delays.length} delay{delays.length > 1 ? "s" : ""} detected
              {loadingDelays && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {delays.map((d, i) => (
                <div key={i} className={cn("flex items-center justify-between p-2 rounded border text-xs",
                  d.severity === "critical" ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5"
                )}>
                  <div>
                    <span className="font-medium">{d.patient}</span>
                    <span className="text-muted-foreground ml-2">w/ {d.provider} • {d.treatment}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={d.severity === "critical" ? "destructive" : "secondary"} className="text-[9px]">
                      {d.delay_minutes} min late
                    </Badge>
                  </div>
                </div>
              ))}
              {delays.some(d => d.severity === "critical") && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Brain className="h-2.5 w-2.5" />Consider reassigning patients or adjusting downstream appointments
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === "day" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Day View — {format(selectedDay, "EEEE, MMMM d, yyyy")}</span>
              {loadingDelays && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="grid" style={{ gridTemplateColumns: `80px repeat(${providers.length}, minmax(140px, 1fr))` }}>
              {/* Header with utilization scores */}
              <div className="border-b border-r p-2 bg-muted/50 text-xs font-medium">Time</div>
              {providers.map(p => {
                const util = getUtilForProvider(p.id);
                const provDelays = getDelayForProvider(p.id);
                return (
                  <div key={p.id} className={cn("border-b p-2 bg-muted/50 text-xs font-medium text-center", provDelays.length > 0 && "bg-warning/10")}>
                    <div>{p.first_name} {p.last_name?.charAt(0)}.</div>
                    {util && (
                      <div className="flex items-center justify-center gap-1 mt-0.5">
                        <Badge variant="outline" className={cn("text-[8px]",
                          util.utilization_pct >= 80 ? "text-success border-success/30" :
                          util.utilization_pct >= 50 ? "text-primary border-primary/30" :
                          "text-muted-foreground"
                        )}>
                          {util.utilization_pct}% done
                        </Badge>
                        {provDelays.length > 0 && (
                          <Badge variant="destructive" className="text-[8px]">
                            <Clock className="h-2 w-2 mr-0.5" />{provDelays.length}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Time slots */}
              {HOURS.map(hour => (
                <div key={`row-${hour}`} className="contents">
                  <div className="border-b border-r p-2 text-xs text-muted-foreground">{format(new Date(2000, 0, 1, hour), "h a")}</div>
                  {providers.map(p => {
                    const appts = getApptForSlot(p.id, hour, selectedDay);
                    const hasDelay = delays.some(d => d.appointment_id && appts.some((a: any) => a.id === d.appointment_id));
                    const isEmpty = appts.length === 0;
                    return (
                      <div
                        key={`${p.id}-${hour}`}
                        className={cn(
                          "border-b min-h-[48px] p-0.5 transition-colors",
                          hasDelay && "bg-warning/5",
                          // Hover feedback (QA #20). Empty slots get a soft
                          // primary tint + cursor-pointer to signal "click
                          // to book"; populated slots get a subtle muted
                          // tint so the user knows the row is interactive.
                          isEmpty
                            ? "hover:bg-primary/5 hover:cursor-pointer"
                            : "hover:bg-muted/40",
                        )}
                        title={isEmpty ? `${p.first_name} ${p.last_name} — ${format(new Date(2000, 0, 1, hour), "h a")} (available)` : undefined}
                      >
                        {appts.map((a: any) => {
                          const delay = delays.find(d => d.appointment_id === a.id);
                          const risk = getNoShowRisk((a.patients as any)?.no_show_count);
                          return (
                            <div
                              key={a.id}
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] border mb-0.5 transition-all hover:shadow-sm hover:scale-[1.02] hover:cursor-pointer",
                                statusColor(a.status),
                                delay && "ring-1 ring-warning",
                              )}
                              title={`${(a.patients as any)?.first_name} ${(a.patients as any)?.last_name} • ${(a.treatments as any)?.name || ""} • ${format(parseISO(a.scheduled_at), "h:mm a")}`}
                            >
                              <p className="font-medium truncate flex items-center gap-1">
                                <span className="truncate">{(a.patients as any)?.first_name} {(a.patients as any)?.last_name?.charAt(0)}.</span>
                                {risk && (
                                  <Badge
                                    variant={risk.variant}
                                    className="text-[9px] h-4 px-1 shrink-0"
                                    title={`${(a.patients as any)?.no_show_count} prior no-show(s)`}
                                  >
                                    {risk.label}
                                  </Badge>
                                )}
                              </p>
                              <p className="truncate opacity-70">{(a.treatments as any)?.name || "—"}</p>
                              {delay && <p className="text-warning font-medium">⚠ {delay.delay_minutes}m late</p>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
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
                <div key={`row-${p.id}`} className="contents">
                  <div className="border-b border-r p-2 text-xs font-medium">{p.first_name} {p.last_name?.charAt(0)}.</div>
                  {weekDays.map(d => {
                    const dayAppts = appointments.filter((a: any) => a.provider_id === p.id && isSameDay(parseISO(a.scheduled_at), d));
                    const isEmpty = dayAppts.length === 0;
                    const cellRisk = dayAppts
                      .map((a: any) => getNoShowRisk((a.patients as any)?.no_show_count))
                      .reduce<ReturnType<typeof getNoShowRisk>>((acc, r) => {
                        if (!r) return acc;
                        if (!acc) return r;
                        return acc.level === "high" ? acc : r;
                      }, null);
                    const riskCount = dayAppts.filter((a: any) => getNoShowRisk((a.patients as any)?.no_show_count)).length;
                    return (
                      <div
                        key={`${p.id}-${d.toISOString()}`}
                        className={cn(
                          "border-b min-h-[40px] p-0.5 transition-colors",
                          isEmpty
                            ? "hover:bg-primary/5 hover:cursor-pointer"
                            : "hover:bg-muted/40 hover:cursor-pointer",
                        )}
                        title={`${p.first_name} ${p.last_name} — ${format(d, "EEE MMM d")}${isEmpty ? " (available)" : ` • ${dayAppts.length} appt(s)`}`}
                      >
                        {dayAppts.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <Badge variant="secondary" className="text-[10px]">{dayAppts.length} appt{dayAppts.length > 1 ? "s" : ""}</Badge>
                            {cellRisk && (
                              <Badge
                                variant={cellRisk.variant}
                                className="text-[9px] h-4 px-1"
                                title={`${riskCount} patient(s) with no-show history`}
                              >
                                {cellRisk.label}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Room utilization + provider utilization summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Room Utilization</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {rooms.map(room => {
                const roomAppts = appointments.filter((a: any) => a.room_id === room.id);
                const hasBookings = roomAppts.length > 0;
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => hasBookings && setOpenRoomId(room.id)}
                    disabled={!hasBookings}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-all",
                      hasBookings
                        ? "hover:bg-muted/50 hover:shadow-sm hover:border-primary/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        : "cursor-default opacity-70",
                    )}
                    title={hasBookings ? `View ${roomAppts.length} booking${roomAppts.length === 1 ? "" : "s"} in ${room.name}` : "No bookings"}
                  >
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      {room.name}
                      {hasBookings && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                    </p>
                    <p className="text-2xl font-bold">{roomAppts.length}</p>
                    <p className="text-[10px] text-muted-foreground">{roomAppts.length === 1 ? "booking" : "bookings"}{hasBookings ? " — click to view" : ""}</p>
                  </button>
                );
              })}
              {rooms.length === 0 && <p className="text-sm text-muted-foreground col-span-2">No rooms configured</p>}
            </div>
          </CardContent>
        </Card>

        {/* QA #36 — Room booking details dialog */}
        <Dialog open={!!openRoomId} onOpenChange={(o) => { if (!o) setOpenRoomId(null); }}>
          <DialogContent className="max-w-md">
            {(() => {
              const room = rooms.find(r => r.id === openRoomId);
              const roomAppts = appointments
                .filter((a: any) => a.room_id === openRoomId)
                .sort((a: any, b: any) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
              const providerName = (id: string | null) => {
                const p = providers.find((pp: any) => pp.id === id);
                return p ? `${p.first_name} ${p.last_name}` : "Unassigned";
              };
              return (
                <>
                  <DialogHeader>
                    <DialogTitle>{room?.name ?? "Room"} bookings</DialogTitle>
                    <DialogDescription>
                      {viewMode === "day"
                        ? format(selectedDay, "EEEE, MMMM d")
                        : `Week of ${format(weekStart, "MMM d")}`}
                      {" — "}
                      {roomAppts.length} {roomAppts.length === 1 ? "booking" : "bookings"}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {roomAppts.map((a: any) => (
                      <div key={a.id} className="rounded-md border p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {a.patients?.first_name} {a.patients?.last_name}
                          </span>
                          <Badge variant="outline" className="text-[10px] capitalize">{a.status?.replace(/_/g, " ")}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(parseISO(a.scheduled_at), "h:mm a")}</span>
                          {a.duration_minutes && <span>· {a.duration_minutes} min</span>}
                          {a.treatments?.name && <span>· {a.treatments.name}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">Provider: {providerName(a.provider_id)}</div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {viewMode === "day" && utilization.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-1"><Brain className="h-3.5 w-3.5 text-primary" />Provider Utilization</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {utilization.map(u => (
                  <div key={u.provider_id} className="flex items-center justify-between">
                    <span className="text-sm">{u.provider_name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full",
                          u.utilization_pct >= 80 ? "bg-success" : u.utilization_pct >= 50 ? "bg-primary" : "bg-warning"
                        )} style={{ width: `${u.utilization_pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-16 text-right">{u.completed}/{u.total_today}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
