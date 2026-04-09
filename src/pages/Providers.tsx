import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, UserCog } from "lucide-react";
import { toast } from "sonner";

export default function Providers() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: providers, isLoading } = useQuery({
    queryKey: ["providers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("providers").select("*").order("last_name");
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Providers</h1>
          <p className="text-muted-foreground">Staff and provider management</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Provider</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Provider</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); addProvider.mutate(new FormData(e.currentTarget)); }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input name="first_name" required />
                </div>
                <div className="space-y-2">
                  <Label>Last Name *</Label>
                  <Input name="last_name" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Specialty</Label>
                <Input name="specialty" placeholder="e.g. Dermatology, Aesthetics" />
              </div>
              <div className="space-y-2">
                <Label>Credentials</Label>
                <Input name="credentials" placeholder="e.g. MD, DO, NP, PA" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input name="email" type="email" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input name="phone" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>NPI Number</Label>
                <Input name="npi" />
              </div>
              <Button type="submit" className="w-full" disabled={addProvider.isPending}>
                {addProvider.isPending ? "Adding..." : "Add Provider"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-28" /></Card>)}
        </div>
      ) : providers && providers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <UserCog className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Dr. {p.first_name} {p.last_name}{p.credentials ? `, ${p.credentials}` : ""}</p>
                    {p.specialty && <p className="text-sm text-muted-foreground">{p.specialty}</p>}
                    {p.email && <p className="text-xs text-muted-foreground mt-1">{p.email}</p>}
                    <div className="flex gap-1.5 mt-2">
                      <Badge variant={p.is_active ? "secondary" : "outline"}>
                        {p.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {(p as any).marketplace_enabled && (
                        <Badge variant="default" className="text-xs">Marketplace</Badge>
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
    </div>
  );
}
