import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Loader2, CreditCard, TrendingUp } from "lucide-react";
import { toast } from "sonner";

const TIERS = [
  { id: "single", label: "Single Modality", price: 500, description: "1 modality (Injectables, Weight Loss, or Laser)" },
  { id: "double", label: "Double Modality", price: 750, description: "2 modalities — most popular" },
  { id: "triple", label: "Triple Modality", price: 1000, description: "All 3 modalities — best value" },
  { id: "founding", label: "Founding Member", price: 500, description: "All modalities at Year 1 locked rate" },
];

interface MembershipEnrollPanelProps {
  patientId: string;
  patientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MembershipEnrollPanel({ patientId, patientName, open, onOpenChange }: MembershipEnrollPanelProps) {
  const [aiRec, setAiRec] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const fetchRecommendation = async () => {
    setLoadingAi(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-smart-schedule", {
        body: { mode: "membership_recommend", data: { patient_id: patientId } },
      });
      if (error) throw error;
      setAiRec(data);
    } catch {
      toast.error("Failed to get AI recommendation");
    }
    setLoadingAi(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Membership — {patientName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Button variant="outline" size="sm" className="w-full" onClick={fetchRecommendation} disabled={loadingAi}>
            {loadingAi ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            AI Recommend Optimal Tier
          </Button>

          {aiRec && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-medium text-primary flex items-center gap-1"><Sparkles className="h-3 w-3" />AI Analysis</p>
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground">{aiRec.recommended_tier}</Badge>
                  {aiRec.projected_annual_savings > 0 && (
                    <Badge variant="outline" className="text-success text-[9px]">
                      <TrendingUp className="h-2.5 w-2.5 mr-0.5" />Save ${aiRec.projected_annual_savings}/yr
                    </Badge>
                  )}
                  {aiRec.break_even_months > 0 && (
                    <span className="text-[10px] text-muted-foreground">Break-even: {aiRec.break_even_months} months</span>
                  )}
                </div>
                <p className="text-xs">{aiRec.reasoning}</p>
                {aiRec.spending_summary && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="text-center p-1.5 bg-background rounded border">
                      <p className="text-[10px] text-muted-foreground">6-Month Spend</p>
                      <p className="text-sm font-mono font-bold">${aiRec.spending_summary.total_6mo}</p>
                    </div>
                    <div className="text-center p-1.5 bg-background rounded border">
                      <p className="text-[10px] text-muted-foreground">Avg/Visit</p>
                      <p className="text-sm font-mono font-bold">${Math.round(aiRec.spending_summary.avg_per_visit)}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tier Comparison */}
          <div className="space-y-2">
            {TIERS.map((tier) => (
              <Card key={tier.id} className={aiRec?.recommended_tier === tier.id ? "border-primary/50 bg-primary/5" : ""}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{tier.label}</span>
                      {aiRec?.recommended_tier === tier.id && <Badge className="text-[9px] bg-primary">Recommended</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{tier.description}</p>
                  </div>
                  <span className="text-lg font-mono font-bold">${tier.price}<span className="text-xs text-muted-foreground">/mo</span></span>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-[10px] text-muted-foreground text-center">
            Enrollment managed in Membership Billing. Use this panel for patient-facing consultation.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
