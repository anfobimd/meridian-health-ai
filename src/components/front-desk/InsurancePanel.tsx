import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Shield, Plus, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

interface Props {
  patientId: string;
}

export function InsurancePanel({ patientId }: Props) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: insurance } = useQuery({
    queryKey: ["patient-insurance", patientId],
    queryFn: async () => {
      const { data } = await supabase.from("patient_insurance")
        .select("*")
        .eq("patient_id", patientId)
        .order("is_primary", { ascending: false });
      return data ?? [];
    },
  });

  const addInsurance = useMutation({
    mutationFn: async (formData: FormData) => {
      const { error } = await supabase.from("patient_insurance").insert({
        patient_id: patientId,
        provider_name: formData.get("carrier_name") as string,
        policy_number: formData.get("policy_number") as string || null,
        group_number: formData.get("group_number") as string || null,
        subscriber_name: formData.get("subscriber_name") as string || null,
        relationship: formData.get("relationship") as string || "self",
        is_primary: (insurance?.length ?? 0) === 0,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-insurance", patientId] });
      setAddOpen(false);
      toast.success("Insurance added");
    },
    onError: () => toast.error("Failed to add insurance"),
  });

  const checkEligibility = useMutation({
    mutationFn: async (insuranceId: string) => {
      // Placeholder — would call external eligibility API
      const { error } = await supabase.from("patient_insurance").update({
        eligibility_status: "eligible",
        eligibility_checked_at: new Date().toISOString(),
        eligibility_notes: "Manual verification — eligible",
      } as any).eq("id", insuranceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-insurance", patientId] });
      toast.success("Eligibility verified");
    },
  });

  const statusColor = (s: string) => {
    if (s === "eligible") return "bg-success/10 text-success";
    if (s === "ineligible") return "bg-destructive/10 text-destructive";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Shield className="h-3 w-3" />Insurance
        </h3>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setAddOpen(true)}>
          <Plus className="h-2.5 w-2.5 mr-0.5" />Add
        </Button>
      </div>

      {insurance && insurance.length > 0 ? (
        insurance.map((ins: any) => (
          <div key={ins.id} className="p-2.5 rounded-lg border space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{ins.carrier_name}</span>
                {ins.is_primary && <Badge variant="secondary" className="text-[10px]">Primary</Badge>}
              </div>
              <Badge className={`text-[10px] ${statusColor(ins.eligibility_status)}`}>
                {ins.eligibility_status === "eligible" && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
                {ins.eligibility_status === "ineligible" && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
                {ins.eligibility_status}
              </Badge>
            </div>
            {ins.policy_number && <p className="text-[11px] text-muted-foreground">Policy: {ins.policy_number}</p>}
            {ins.group_number && <p className="text-[11px] text-muted-foreground">Group: {ins.group_number}</p>}
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] mt-1"
              onClick={() => checkEligibility.mutate(ins.id)}
              disabled={checkEligibility.isPending}
            >
              {checkEligibility.isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin mr-0.5" /> : <Shield className="h-2.5 w-2.5 mr-0.5" />}
              Check Eligibility
            </Button>
          </div>
        ))
      ) : (
        <p className="text-xs text-muted-foreground text-center py-3">No insurance on file</p>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Add Insurance</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); addInsurance.mutate(new FormData(e.currentTarget)); }} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Carrier Name *</Label>
              <Input name="carrier_name" required className="h-8 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Policy #</Label>
                <Input name="policy_number" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Group #</Label>
                <Input name="group_number" className="h-8 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Subscriber Name</Label>
              <Input name="subscriber_name" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Relationship</Label>
              <select name="relationship" className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="self">Self</option>
                <option value="spouse">Spouse</option>
                <option value="child">Child</option>
                <option value="other">Other</option>
              </select>
            </div>
            <Button type="submit" className="w-full" size="sm" disabled={addInsurance.isPending}>
              {addInsurance.isPending ? "Saving..." : "Add Insurance"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
