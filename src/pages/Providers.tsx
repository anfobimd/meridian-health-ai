import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, UserCog, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Providers() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clearanceDialogOpen, setClearanceDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedTreatment, setSelectedTreatment] = useState("");
  const queryClient = useQueryClient();

  const { data: providers, isLoading } = useQuery({
    queryKey: ["providers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("providers").select("*").order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: treatments } = useQuery({
    queryKey: ["treatments-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("treatments").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: clearances } = useQuery({
    queryKey: ["provider-clearances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("provider_clearances").select("*, treatments(name)").eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const addProvider = useMutation({
    mutationFn: async (formData: FormData) => {
      const provider = {
        first_name: formData.get("first_name") as string,
        last_name: formData.get("last_name") as string,
        specialty: formData.get("specialty") as string || null,
        credentials: formData.get("credentials") as string || null,
        email: formData.get("email") as string || null,
        phone: formData.get("phone") as string || null,
        npi: formData.get("npi") as string || null,
      };
      const { error } = await supabase.from("providers").insert(provider);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      setDialogOpen(false);
      toast.success("Provider added");
    },
    onError: () => toast.error("Failed to add provider"),
  });

  const addClearance = useMutation({
    mutationFn: async () => {
      if (!selectedProvider || !selectedTreatment) return;
      const { error } = await supabase.from("provider_clearances").insert({
        provider_id: selectedProvider,
        treatment_id: selectedTreatment,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-clearances"] });
      setSelectedTreatment("");
      toast.success("Clearance added");
    },
    onError: (e: any) => toast.error(e.message?.includes("duplicate") ? "Already cleared" : "Failed to add clearance"),
  });

  const removeClearance = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("provider_clearances").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-clearances"] });
      toast.success("Clearance removed");
    },
  });

  const getClearancesForProvider = (providerId: string) =>
    clearances?.filter((c: any) => c.provider_id === providerId) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Providers</h1>
          <p className="text-muted-foreground">Staff, clearances, and credentials</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Provider</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Provider</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); addProvider.mutate(new FormData(e.currentTarget)); }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>First Name *</Label><Input name="first_name" required /></div>
                <div className="space-y-2"><Label>Last Name *</Label><Input name="last_name" required /></div>
              </div>
              <div className="space-y-2"><Label>Specialty</Label><Input name="specialty" placeholder="e.g. Dermatology, Aesthetics" /></div>
              <div className="space-y-2"><Label>Credentials</Label><Input name="credentials" placeholder="e.g. MD, DO, NP, PA" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Email</Label><Input name="email" type="email" /></div>
                <div className="space-y-2"><Label>Phone</Label><Input name="phone" /></div>
              </div>
              <div className="space-y-2"><Label>NPI Number</Label><Input name="npi" /></div>
              <Button type="submit" className="w-full" disabled={addProvider.isPending}>
                {addProvider.isPending ? "Adding..." : "Add Provider"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">Provider Roster</TabsTrigger>
          <TabsTrigger value="clearances">Procedure Clearances</TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-28" /></Card>)}
            </div>
          ) : providers && providers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {providers.map((p: any) => (
                <Card key={p.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <UserCog className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">Dr. {p.first_name} {p.last_name}{p.credentials ? `, ${p.credentials}` : ""}</p>
                        {p.specialty && <p className="text-sm text-muted-foreground">{p.specialty}</p>}
                        {p.email && <p className="text-xs text-muted-foreground mt-1">{p.email}</p>}
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          <Badge variant={p.is_active ? "default" : "outline"} className={p.is_active ? "bg-success text-success-foreground hover:bg-success/90" : ""}>
                            {p.is_active ? "Active" : "Inactive"}
                          </Badge>
                          {getClearancesForProvider(p.id).length > 0 && (
                            <Badge variant="outline" className="text-xs text-primary border-primary/20">
                              <ShieldCheck className="h-3 w-3 mr-0.5" />
                              {getClearancesForProvider(p.id).length} clearances
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <UserCog className="h-12 w-12 mx-auto text-muted-foreground/50" />
                <p className="mt-4 text-muted-foreground">No providers yet</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="clearances" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Manage Procedure Clearances</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label className="text-xs">Provider</Label>
                  <Select value={selectedProvider || ""} onValueChange={setSelectedProvider}>
                    <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                    <SelectContent>
                      {providers?.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>Dr. {p.first_name} {p.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label className="text-xs">Treatment</Label>
                  <Select value={selectedTreatment} onValueChange={setSelectedTreatment}>
                    <SelectTrigger><SelectValue placeholder="Select treatment" /></SelectTrigger>
                    <SelectContent>
                      {treatments?.map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => addClearance.mutate()}
                  disabled={!selectedProvider || !selectedTreatment || addClearance.isPending}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-1" />Add
                </Button>
              </div>

              {selectedProvider && (
                <div className="space-y-2 pt-2">
                  <p className="text-sm font-medium">Current Clearances</p>
                  {getClearancesForProvider(selectedProvider).length > 0 ? (
                    <div className="space-y-1.5">
                      {getClearancesForProvider(selectedProvider).map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            <span className="text-sm">{c.treatments?.name}</span>
                            <span className="text-xs text-muted-foreground">
                              Since {new Date(c.cleared_at).toLocaleDateString()}
                            </span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeClearance.mutate(c.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No clearances assigned</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
