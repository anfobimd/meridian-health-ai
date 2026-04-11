import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface Props {
  patient: any;
  onVerified?: () => void;
}

export function IdentityVerifyPanel({ patient, onVerified }: Props) {
  const queryClient = useQueryClient();
  const [dobInput, setDobInput] = useState("");
  const [dobMatch, setDobMatch] = useState<boolean | null>(null);
  const [verifying, setVerifying] = useState(false);

  const verifyDob = () => {
    const match = dobInput === patient?.date_of_birth;
    setDobMatch(match);
    if (!match) toast.error("DOB does not match records");
  };

  const confirmIdentity = useMutation({
    mutationFn: async () => {
      setVerifying(true);
      const { error } = await supabase.from("patients").update({
        photo_id_verified: true,
        photo_id_verified_at: new Date().toISOString(),
      } as any).eq("id", patient.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient", patient.id] });
      toast.success("Identity verified");
      onVerified?.();
    },
    onError: () => toast.error("Failed to verify identity"),
    onSettled: () => setVerifying(false),
  });

  const isVerified = patient?.photo_id_verified;

  return (
    <div className="space-y-3 p-4 rounded-lg border bg-muted/20">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" />Identity Verification
        </h3>
        {isVerified ? (
          <Badge variant="secondary" className="bg-success/10 text-success text-[10px]">
            <CheckCircle2 className="h-3 w-3 mr-0.5" />Verified
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-warning">
            <AlertTriangle className="h-3 w-3 mr-0.5" />Not Verified
          </Badge>
        )}
      </div>

      {!isVerified && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Confirm DOB (ask patient)</Label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={dobInput}
                onChange={e => { setDobInput(e.target.value); setDobMatch(null); }}
                className="h-8 text-xs"
              />
              <Button variant="outline" size="sm" onClick={verifyDob} className="text-xs h-8">
                Check
              </Button>
            </div>
            {dobMatch === true && <p className="text-xs text-success">✓ DOB matches</p>}
            {dobMatch === false && <p className="text-xs text-destructive">✗ DOB mismatch</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Photo ID Check</Label>
            <p className="text-[11px] text-muted-foreground">Visually confirm government-issued photo ID matches patient</p>
          </div>

          <Button
            size="sm"
            className="w-full text-xs"
            disabled={dobMatch !== true || verifying}
            onClick={() => confirmIdentity.mutate()}
          >
            {verifying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
            Confirm Identity Verified
          </Button>
        </>
      )}
    </div>
  );
}
