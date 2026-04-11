import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Stethoscope, ShieldCheck, FileCheck, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function Treatments() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: treatments, isLoading } = useQuery({
    queryKey: ["treatments", showInactive],
    queryFn: async () => {
      let q = supabase.from("treatments").select("*").order("name");
      if (!showInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const addTreatment = useMutation({
    mutationFn: async (formData: FormData) => {
      const treatment = {
        name: formData.get("name") as string,
        description: formData.get("description") as string || null,
        category: formData.get("category") as string || null,
        duration_minutes: parseInt(formData.get("duration") as string) || 30,
        price: parseFloat(formData.get("price") as string) || null,
        requires_gfe: formData.get("requires_gfe") === "on",
        requires_md_review: formData.get("requires_md_review") === "on",
      };
      const { error } = await supabase.from("treatments").insert(treatment);
      if (error) throw error;
      // Audit log
      await supabase.from("audit_logs").insert({
        user_id: user?.id,
        action: "create",
        table_name: "treatments",
        new_values: treatment,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      setDialogOpen(false);
      toast.success("Treatment added");
    },
    onError: () => toast.error("Failed to add treatment"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("treatments").update({ is_active }).eq("id", id);
      if (error) throw error;
      await supabase.from("audit_logs").insert({
        user_id: user?.id,
        action: "update",
        table_name: "treatments",
        record_id: id,
        new_values: { is_active },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      toast.success("Treatment updated");
    },
  });

  const toggleFlag = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: boolean }) => {
      const { error } = await supabase.from("treatments").update({ [field]: value }).eq("id", id);
      if (error) throw error;
      await supabase.from("audit_logs").insert({
        user_id: user?.id,
        action: "update",
        table_name: "treatments",
        record_id: id,
        new_values: { [field]: value },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Treatments</h1>
          <p className="text-muted-foreground">Service catalog with compliance flags</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)}>
            {showInactive ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
            {showInactive ? "Hide Inactive" : "Show Inactive"}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Treatment</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Treatment</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addTreatment.mutate(new FormData(e.currentTarget)); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input name="name" required />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input name="description" />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input name="category" placeholder="e.g. Injectables, Laser, Hormone Therapy" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Duration (min)</Label>
                    <Input name="duration" type="number" defaultValue={30} />
                  </div>
                  <div className="space-y-2">
                    <Label>Price ($)</Label>
                    <Input name="price" type="number" step="0.01" />
                  </div>
                </div>
                <div className="flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" name="requires_gfe" className="rounded border-input" />
                    <ShieldCheck className="h-4 w-4 text-amber-500" />
                    Requires GFE
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" name="requires_md_review" className="rounded border-input" />
                    <FileCheck className="h-4 w-4 text-blue-500" />
                    Requires MD Review
                  </label>
                </div>
                <Button type="submit" className="w-full" disabled={addTreatment.isPending}>
                  {addTreatment.isPending ? "Adding..." : "Add Treatment"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-32" /></Card>)}
        </div>
      ) : treatments && treatments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {treatments.map((t: any) => (
            <Card key={t.id} className={!t.is_active ? "opacity-60" : ""}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{t.name}</p>
                      {!t.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                    </div>
                    {t.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {t.category && <Badge variant="outline">{t.category}</Badge>}
                      <span className="text-xs text-muted-foreground">{t.duration_minutes} min</span>
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <Switch
                          checked={t.requires_gfe}
                          onCheckedChange={(v) => toggleFlag.mutate({ id: t.id, field: "requires_gfe", value: v })}
                          className="scale-75"
                        />
                        <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />
                        GFE
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <Switch
                          checked={t.requires_md_review}
                          onCheckedChange={(v) => toggleFlag.mutate({ id: t.id, field: "requires_md_review", value: v })}
                          className="scale-75"
                        />
                        <FileCheck className="h-3.5 w-3.5 text-blue-500" />
                        MD
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer ml-auto">
                        <Switch
                          checked={t.is_active}
                          onCheckedChange={(v) => toggleActive.mutate({ id: t.id, is_active: v })}
                          className="scale-75"
                        />
                        Active
                      </label>
                    </div>
                  </div>
                  {t.price && <span className="text-sm font-semibold ml-2">${Number(t.price).toFixed(2)}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Stethoscope className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No treatments yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
