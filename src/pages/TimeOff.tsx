import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, CalendarOff, Trash2, Check, X } from "lucide-react";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  approved: "bg-primary/10 text-primary",
  rejected: "bg-destructive/10 text-destructive",
};

export default function TimeOff() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
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

  const { data: timeOffs, isLoading } = useQuery({
    queryKey: ["provider-time-off"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_time_off")
        .select("*, providers!provider_time_off_provider_id_fkey(first_name, last_name)")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!myProviderId) throw new Error("No provider record linked");
      const { error } = await supabase.from("provider_time_off").insert({
        provider_id: myProviderId,
        start_date: startDate,
        end_date: endDate,
        reason: reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Time-off requested" });
      qc.invalidateQueries({ queryKey: ["provider-time-off"] });
      setDialogOpen(false);
      setStartDate("");
      setEndDate("");
      setReason("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("provider_time_off")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Status updated" });
      qc.invalidateQueries({ queryKey: ["provider-time-off"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("provider_time_off").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Request deleted" });
      qc.invalidateQueries({ queryKey: ["provider-time-off"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const isAdmin = role === "admin" || role === "super_admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Time Off</h1>
          <p className="text-sm text-muted-foreground">Request and manage schedule blocks</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={!myProviderId}>
              <Plus className="mr-2 h-4 w-4" /> Request Time Off
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Time Off</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>End Date</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Reason (optional)</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Vacation, personal, etc." rows={2} />
              </div>
              <Button
                className="w-full"
                onClick={() => createMutation.mutate()}
                disabled={!startDate || !endDate || createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !timeOffs?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <CalendarOff className="mx-auto h-10 w-10 mb-2" />
            <p>No time-off requests yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {timeOffs.map((t: any) => (
            <Card key={t.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">
                      {t.providers?.first_name} {t.providers?.last_name}
                    </p>
                    <Badge className={statusColors[t.status] || ""}>{t.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(t.start_date), "MMM d, yyyy")} — {format(new Date(t.end_date), "MMM d, yyyy")}
                  </p>
                  {t.reason && <p className="text-xs text-muted-foreground">{t.reason}</p>}
                </div>
                <div className="flex gap-1">
                  {isAdmin && t.status === "pending" && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateStatusMutation.mutate({ id: t.id, status: "approved" })}
                      >
                        <Check className="h-4 w-4 text-primary" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateStatusMutation.mutate({ id: t.id, status: "rejected" })}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                  {t.status === "pending" && t.provider_id === myProviderId && (
                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(t.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
