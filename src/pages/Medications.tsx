import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pill, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["Hormone", "Injectable", "Oral", "Topical", "Peptide", "Supplement", "Controlled", "Other"];
const ROUTES = ["oral", "sublingual", "injectable", "topical", "transdermal", "subcutaneous", "intramuscular", "other"];

export default function Medications() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [category, setCategory] = useState("general");
  const [route, setRoute] = useState("oral");
  const [isControlled, setIsControlled] = useState(false);
  const queryClient = useQueryClient();

  const { data: medications, isLoading } = useQuery({
    queryKey: ["medications", showInactive],
    queryFn: async () => {
      let q = supabase.from("medications").select("*").order("name");
      if (!showInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const addMedication = useMutation({
    mutationFn: async (formData: FormData) => {
      const med = {
        name: formData.get("name") as string,
        generic_name: formData.get("generic_name") as string || null,
        category,
        route,
        default_dose: formData.get("default_dose") as string || null,
        default_unit: formData.get("default_unit") as string || null,
        is_controlled: isControlled,
        schedule_class: isControlled ? (formData.get("schedule_class") as string || null) : null,
        notes: formData.get("notes") as string || null,
      };
      const { error } = await supabase.from("medications").insert(med);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medications"] });
      setDialogOpen(false);
      setIsControlled(false);
      setCategory("general");
      setRoute("oral");
      toast.success("Medication added");
    },
    onError: () => toast.error("Failed to add medication"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("medications").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medications"] });
      toast.success("Updated");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Medications & Formulary</h1>
          <p className="text-muted-foreground">Manage clinic medication catalog</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)}>
            {showInactive ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
            {showInactive ? "Hide Inactive" : "Show Inactive"}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Medication</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add Medication</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addMedication.mutate(new FormData(e.currentTarget)); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Brand Name *</Label>
                    <Input name="name" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Generic Name</Label>
                    <Input name="generic_name" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c.toLowerCase()}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Route</Label>
                    <Select value={route} onValueChange={setRoute}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROUTES.map(r => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Default Dose</Label>
                    <Input name="default_dose" placeholder="e.g. 200" />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Input name="default_unit" placeholder="e.g. mg, mL, IU" />
                  </div>
                </div>
                <div className="flex items-center gap-4 pt-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Switch checked={isControlled} onCheckedChange={setIsControlled} />
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Controlled Substance
                  </label>
                </div>
                {isControlled && (
                  <div className="space-y-2">
                    <Label>DEA Schedule</Label>
                    <Select name="schedule_class" defaultValue="III">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["II", "III", "IV", "V"].map(s => <SelectItem key={s} value={s}>Schedule {s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input name="notes" placeholder="Special instructions, storage requirements..." />
                </div>
                <Button type="submit" className="w-full" disabled={addMedication.isPending}>
                  {addMedication.isPending ? "Adding..." : "Add Medication"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-28" /></Card>)}
        </div>
      ) : medications && medications.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {medications.map((m: any) => (
            <Card key={m.id} className={!m.is_active ? "opacity-60" : ""}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{m.name}</p>
                      {m.is_controlled && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          <AlertTriangle className="h-3 w-3 mr-0.5" />C{m.schedule_class}
                        </Badge>
                      )}
                    </div>
                    {m.generic_name && <p className="text-sm text-muted-foreground italic">{m.generic_name}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge variant="outline">{m.category}</Badge>
                      <Badge variant="secondary" className="text-xs">{m.route}</Badge>
                      {m.default_dose && (
                        <span className="text-xs text-muted-foreground">{m.default_dose} {m.default_unit}</span>
                      )}
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Switch
                      checked={m.is_active}
                      onCheckedChange={(v) => toggleActive.mutate({ id: m.id, is_active: v })}
                      className="scale-75"
                    />
                  </label>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Pill className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No medications in formulary</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
