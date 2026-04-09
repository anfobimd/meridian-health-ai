import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pill } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

export default function Protocols() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ["protocol-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("protocol_templates").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: enrollments, isLoading: enrollmentsLoading } = useQuery({
    queryKey: ["protocol-enrollments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("protocol_enrollments")
        .select("*, patients(first_name, last_name), providers(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const addTemplate = useMutation({
    mutationFn: async (formData: FormData) => {
      const { error } = await supabase.from("protocol_templates").insert({
        name: formData.get("name") as string,
        category: formData.get("category") as string || null,
        compound: formData.get("compound") as string || null,
        default_dose: formData.get("dose") as string || null,
        default_frequency: formData.get("frequency") as string || null,
        default_route: formData.get("route") as string || null,
        default_duration_weeks: parseInt(formData.get("duration") as string) || null,
        description: formData.get("description") as string || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["protocol-templates"] });
      setDialogOpen(false);
      toast.success("Protocol template created");
    },
    onError: () => toast.error("Failed to create template"),
  });

  const statusColors: Record<string, string> = {
    active: "bg-success/10 text-success",
    paused: "bg-warning/10 text-warning",
    completed: "bg-primary/10 text-primary",
    discontinued: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Protocols</h1>
          <p className="text-muted-foreground">Treatment protocol templates and patient enrollments</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Template</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Protocol Template</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); addTemplate.mutate(new FormData(e.currentTarget)); }} className="space-y-4">
              <div className="space-y-2"><Label>Name *</Label><Input name="name" required placeholder="e.g. TRT Standard, GLP-1 Weight Loss" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Category</Label><Input name="category" placeholder="TRT, GLP-1, HRT" /></div>
                <div className="space-y-2"><Label>Compound</Label><Input name="compound" placeholder="Testosterone Cypionate" /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label>Dose</Label><Input name="dose" placeholder="200mg" /></div>
                <div className="space-y-2"><Label>Frequency</Label><Input name="frequency" placeholder="Weekly" /></div>
                <div className="space-y-2"><Label>Route</Label><Input name="route" placeholder="IM, SubQ" /></div>
              </div>
              <div className="space-y-2"><Label>Duration (weeks)</Label><Input name="duration" type="number" /></div>
              <div className="space-y-2"><Label>Description</Label><Input name="description" /></div>
              <Button type="submit" className="w-full" disabled={addTemplate.isPending}>
                {addTemplate.isPending ? "Creating..." : "Create Template"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Templates ({templates?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="enrollments">Active Enrollments ({enrollments?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          {templatesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1,2].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-28" /></Card>)}</div>
          ) : templates && templates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((t: any) => (
                <Card key={t.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Pill className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{t.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[t.compound, t.default_dose, t.default_frequency, t.default_route].filter(Boolean).join(" • ") || "No defaults set"}
                        </p>
                        {t.category && <Badge variant="outline" className="mt-2 text-xs">{t.category}</Badge>}
                        {t.default_duration_weeks && <span className="text-xs text-muted-foreground ml-2">{t.default_duration_weeks} weeks</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card><CardContent className="py-12 text-center"><Pill className="h-12 w-12 mx-auto text-muted-foreground/50" /><p className="mt-4 text-muted-foreground">No protocol templates yet</p></CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="enrollments">
          {enrollmentsLoading ? (
            <div className="space-y-3">{[1,2].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-20" /></Card>)}</div>
          ) : enrollments && enrollments.length > 0 ? (
            <div className="space-y-3">
              {enrollments.map((e: any) => (
                <Card key={e.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{e.patients?.first_name} {e.patients?.last_name} — {e.protocol_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[e.compound, e.dose, e.frequency, e.route].filter(Boolean).join(" • ")}
                        {e.start_date && ` • Started ${format(parseISO(e.start_date), "MMM d, yyyy")}`}
                      </p>
                    </div>
                    <Badge variant="secondary" className={statusColors[e.status] ?? ""}>{e.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">No active enrollments</p></CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
