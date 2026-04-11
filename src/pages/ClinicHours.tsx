import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Clock, CalendarOff, Trash2, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function ClinicHours() {
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false);
  const [holidayDate, setHolidayDate] = useState<Date | undefined>();
  const queryClient = useQueryClient();

  const { data: hours, isLoading } = useQuery({
    queryKey: ["clinic-hours"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clinic_hours").select("*").order("day_of_week");
      if (error) throw error;
      return data;
    },
  });

  const { data: holidays } = useQuery({
    queryKey: ["clinic-holidays"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clinic_holidays").select("*").order("holiday_date");
      if (error) throw error;
      return data;
    },
  });

  const updateHours = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; open_time?: string; close_time?: string; is_closed?: boolean }) => {
      const { error } = await supabase.from("clinic_hours").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-hours"] });
      toast.success("Hours updated");
    },
  });

  const addHoliday = useMutation({
    mutationFn: async (formData: FormData) => {
      if (!holidayDate) throw new Error("Date required");
      const { error } = await supabase.from("clinic_holidays").insert({
        name: formData.get("name") as string,
        holiday_date: format(holidayDate, "yyyy-MM-dd"),
        is_full_day: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-holidays"] });
      setHolidayDialogOpen(false);
      setHolidayDate(undefined);
      toast.success("Holiday added");
    },
    onError: (e: any) => toast.error(e.message?.includes("duplicate") ? "Date already added" : "Failed to add"),
  });

  const removeHoliday = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clinic_holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-holidays"] });
      toast.success("Holiday removed");
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clinic Hours & Closures</h1>
        <p className="text-muted-foreground">Configure operating hours and holiday schedule</p>
      </div>

      <Tabs defaultValue="hours">
        <TabsList>
          <TabsTrigger value="hours">Weekly Hours</TabsTrigger>
          <TabsTrigger value="holidays">Holiday Closures</TabsTrigger>
        </TabsList>

        <TabsContent value="hours" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> Weekly Operating Hours
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="animate-pulse space-y-3">
                  {[...Array(7)].map((_, i) => <div key={i} className="h-12 bg-muted rounded" />)}
                </div>
              ) : (
                <div className="space-y-3">
                  {hours?.map((h: any) => (
                    <div key={h.id} className="flex items-center gap-4 rounded-md border p-3">
                      <div className="w-24 flex-shrink-0">
                        <span className="text-sm font-medium">{DAYS[h.day_of_week]}</span>
                      </div>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Switch
                          checked={!h.is_closed}
                          onCheckedChange={(open) => updateHours.mutate({ id: h.id, is_closed: !open })}
                        />
                        <span className="text-xs text-muted-foreground">{h.is_closed ? "Closed" : "Open"}</span>
                      </label>
                      {!h.is_closed && (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            type="time"
                            value={h.open_time}
                            onChange={(e) => updateHours.mutate({ id: h.id, open_time: e.target.value })}
                            className="w-32 text-sm"
                          />
                          <span className="text-xs text-muted-foreground">to</span>
                          <Input
                            type="time"
                            value={h.close_time}
                            onChange={(e) => updateHours.mutate({ id: h.id, close_time: e.target.value })}
                            className="w-32 text-sm"
                          />
                        </div>
                      )}
                      {h.is_closed && (
                        <Badge variant="outline" className="text-muted-foreground">
                          <CalendarOff className="h-3 w-3 mr-1" /> Closed
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holidays" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarOff className="h-4 w-4" /> Holiday Closures
              </CardTitle>
              <Dialog open={holidayDialogOpen} onOpenChange={setHolidayDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Holiday</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Holiday Closure</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); addHoliday.mutate(new FormData(e.currentTarget)); }} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Holiday Name *</Label>
                      <Input name="name" required placeholder="e.g. New Year's Day" />
                    </div>
                    <div className="space-y-2">
                      <Label>Date *</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left", !holidayDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {holidayDate ? format(holidayDate, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={holidayDate}
                            onSelect={setHolidayDate}
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <Button type="submit" className="w-full" disabled={!holidayDate || addHoliday.isPending}>
                      {addHoliday.isPending ? "Adding..." : "Add Holiday"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {holidays && holidays.length > 0 ? (
                <div className="space-y-2">
                  {holidays.map((h: any) => (
                    <div key={h.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium">{h.name}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(h.holiday_date + "T00:00:00"), "EEEE, MMMM d, yyyy")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Full Day</Badge>
                        <Button variant="ghost" size="sm" onClick={() => removeHoliday.mutate(h.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No holidays configured</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
