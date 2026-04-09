import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Stethoscope } from "lucide-react";
import { toast } from "sonner";

export default function Treatments() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: treatments, isLoading } = useQuery({
    queryKey: ["treatments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("treatments").select("*").order("name");
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
      };
      const { error } = await supabase.from("treatments").insert(treatment);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      setDialogOpen(false);
      toast.success("Treatment added");
    },
    onError: () => toast.error("Failed to add treatment"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Treatments</h1>
          <p className="text-muted-foreground">Service catalog</p>
        </div>
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
              <Button type="submit" className="w-full" disabled={addTreatment.isPending}>
                {addTreatment.isPending ? "Adding..." : "Add Treatment"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-28" /></Card>)}
        </div>
      ) : treatments && treatments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {treatments.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      {t.category && <Badge variant="outline">{t.category}</Badge>}
                      <span className="text-xs text-muted-foreground">{t.duration_minutes} min</span>
                    </div>
                  </div>
                  {t.price && <span className="text-sm font-semibold">${Number(t.price).toFixed(2)}</span>}
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
