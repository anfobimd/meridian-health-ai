import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CalendarOff, Clock, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ProviderSchedule() {
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<any>(null);
  const [editDay, setEditDay] = useState(1);
  const queryClient = useQueryClient();

  const { data: providers } = useQuery({
    queryKey: ["providers-schedule"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name, credentials").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms-schedule"],
    queryFn: async () => {
      const { data } = await supabase.from("rooms").select("id, name").eq("is_active", true).order("sort_order");
      return data ?? [];
    },
  });

  const { data: availability, isLoading: loadingAvail } = useQuery({
    queryKey: ["provider-availability", selectedProviderId],
    enabled: !!selectedProviderId,
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_availability")
        .select("*")
        .eq("provider_id", selectedProviderId)
        .eq("is_active", true)
        .order("day_of_week")
        .order("start_time");
      return data ?? [];
    },
  });

  const { data: overrides } = useQuery({
    queryKey: ["provider-overrides", selectedProviderId],
    enabled: !!selectedProviderId,
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_availability_overrides")
        .select("*")
        .eq("provider_id", selectedProviderId)
        .gte("override_date", format(new Date(), "yyyy-MM-dd"))
        .order("override_date");
      return data ?? [];
    },
  });

  const upsertAvailability = useMutation({
    mutationFn: async (formData: FormData) => {
      const payload = {
        provider_id: selectedProviderId,
        day_of_week: parseInt(formData.get("day_of_week") as string),
        start_time: formData.get("start_time") as string,
        end_time: formData.get("end_time") as string,
        break_start: (formData.get("break_start") as string) || null,
        break_end: (formData.get("break_end") as string) || null,
        room_preference_id: (formData.get("room_preference_id") as string) || null,
        is_active: true,
      };
      if (editingSlot?.id) {
        const { error } = await supabase.from("provider_availability").update(payload).eq("id", editingSlot.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("provider_availability").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-availability", selectedProviderId] });
      setEditDialogOpen(false);
      setEditingSlot(null);
      toast.success("Schedule saved");
    },
    onError: () => toast.error("Failed to save schedule"),
  });

  const deleteAvailability = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("provider_availability").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-availability", selectedProviderId] });
      toast.success("Shift removed");
    },
  });

  const addOverride = useMutation({
    mutationFn: async (formData: FormData) => {
      const isAvail = formData.get("is_available") === "on";
      const payload = {
        provider_id: selectedProviderId,
        override_date: formData.get("override_date") as string,
        is_available: isAvail,
        start_time: isAvail ? (formData.get("start_time") as string) || null : null,
        end_time: isAvail ? (formData.get("end_time") as string) || null : null,
        reason: (formData.get("reason") as string) || null,
      };
      const { error } = await supabase.from("provider_availability_overrides").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-overrides", selectedProviderId] });
      setOverrideDialogOpen(false);
      toast.success("Override added");
    },
    onError: () => toast.error("Failed to add override"),
  });

  const openEditSlot = (day: number, slot?: any) => {
    setEditDay(day);
    setEditingSlot(slot ?? null);
    setEditDialogOpen(true);
  };

  const slotsByDay = DAYS.map((_, i) => (availability ?? []).filter((a) => a.day_of_week === i));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Provider Schedule</h1>
          <p className="text-muted-foreground">Manage recurring availability and overrides</p>
        </div>
        <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            {providers?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                Dr. {p.last_name}, {p.first_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedProviderId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">Select a provider to manage their schedule</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="weekly">
          <TabsList>
            <TabsTrigger value="weekly">Weekly Schedule</TabsTrigger>
            <TabsTrigger value="overrides">Overrides & PTO</TabsTrigger>
          </TabsList>

          <TabsContent value="weekly" className="mt-4">
            <div className="grid grid-cols-7 gap-2">
              {DAYS.map((day, i) => (
                <Card key={day} className="min-h-[180px]">
                  <CardHeader className="pb-2 px-3 pt-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-semibold">{SHORT_DAYS[i]}</CardTitle>
                      <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Add slot to ${day}`} onClick={() => openEditSlot(i)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-1.5">
                    {slotsByDay[i].length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">Off</p>
                    ) : (
                      slotsByDay[i].map((slot) => (
                        <div
                          key={slot.id}
                          className="rounded-md bg-primary/10 px-2 py-1.5 text-[11px] group relative cursor-pointer"
                          onClick={() => openEditSlot(i, slot)}
                        >
                          <p className="font-medium text-primary">
                            {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                          </p>
                          {slot.break_start && (
                            <p className="text-muted-foreground">Break: {slot.break_start.slice(0, 5)}–{slot.break_end?.slice(0, 5)}</p>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteAvailability.mutate(slot.id); }}
                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 transition-opacity"
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </button>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="overrides" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setOverrideDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Override
              </Button>
            </div>
            {(overrides ?? []).length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <CalendarOff className="h-10 w-10 mx-auto text-muted-foreground/50" />
                  <p className="mt-3 text-sm text-muted-foreground">No upcoming overrides</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {overrides!.map((o) => (
                  <Card key={o.id}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{format(parseISO(o.override_date), "EEE, MMM d yyyy")}</p>
                        <p className="text-xs text-muted-foreground">
                          {o.is_available
                            ? `Custom: ${o.start_time?.slice(0, 5) ?? "?"}–${o.end_time?.slice(0, 5) ?? "?"}`
                            : "Day Off"}
                          {o.reason && ` — ${o.reason}`}
                        </p>
                      </div>
                      <Badge variant={o.is_available ? "secondary" : "destructive"}>
                        {o.is_available ? "Modified" : "PTO"}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Edit Shift Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSlot ? "Edit" : "Add"} Shift — {DAYS[editDay]}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); upsertAvailability.mutate(new FormData(e.currentTarget)); }}
            className="space-y-4"
          >
            <input type="hidden" name="day_of_week" value={editDay} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start Time</Label>
                <Input name="start_time" type="time" required defaultValue={editingSlot?.start_time?.slice(0, 5) ?? "09:00"} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Time</Label>
                <Input name="end_time" type="time" required defaultValue={editingSlot?.end_time?.slice(0, 5) ?? "17:00"} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Break Start</Label>
                <Input name="break_start" type="time" defaultValue={editingSlot?.break_start?.slice(0, 5) ?? ""} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Break End</Label>
                <Input name="break_end" type="time" defaultValue={editingSlot?.break_end?.slice(0, 5) ?? ""} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Preferred Room</Label>
              <select
                name="room_preference_id"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                defaultValue={editingSlot?.room_preference_id ?? ""}
              >
                <option value="">None</option>
                {rooms?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <Button type="submit" className="w-full" disabled={upsertAvailability.isPending}>
              {upsertAvailability.isPending ? "Saving…" : "Save Shift"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Schedule Override</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); addOverride.mutate(new FormData(e.currentTarget)); }}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input name="override_date" type="date" required />
            </div>
            <div className="flex items-center gap-2">
              <Switch name="is_available" id="is_available" />
              <Label htmlFor="is_available" className="text-sm">Available (custom hours)</Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start Time</Label>
                <Input name="start_time" type="time" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Time</Label>
                <Input name="end_time" type="time" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reason</Label>
              <Input name="reason" placeholder="e.g. PTO, conference, half-day" />
            </div>
            <Button type="submit" className="w-full" disabled={addOverride.isPending}>
              {addOverride.isPending ? "Adding…" : "Add Override"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
