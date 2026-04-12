import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Sparkles, Loader2, CreditCard, TrendingUp, DollarSign, CalendarDays } from "lucide-react";
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

  // Fetch patient spend history for local projection
  const { data: spendData } = useQuery({
    queryKey: ["patient-spend-history", patientId],
    enabled: !!patientId && open,
    queryFn: async () => {
      const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString();
      const { data } = await supabase.from("invoices")
        .select("total_amount, created_at")
        .eq("patient_id", patientId)
        .gte("created_at", sixMonthsAgo);
      const invoices = data ?? [];
      const total = invoices.reduce((s, i: any) => s + (i.total_amount || 0), 0);
      return {
        total_6mo: Math.round(total),
        visit_count: invoices.length,
        avg_per_visit: invoices.length > 0 ? Math.round(total / invoices.length) : 0,
        monthly_avg: Math.round(total / 6),
      };
    },
  });

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

  // Local savings projection per tier
  const projections = TIERS.map(tier => {
    const monthlySpend = spendData?.monthly_avg || 0;
    const annualSpendNoMembership = monthlySpend * 12;
    const annualMemberCost = tier.price * 12;
    // Assume ~15% avg member discount on services
    const annualWithDiscount = annualSpendNoMembership * 0.85 + annualMemberCost;
    const savings = annualSpendNoMembership - annualWithDiscount;
    const breakEvenMonths = monthlySpend > 0 ? Math.ceil(tier.price / (monthlySpend * 0.15)) : 0;
    return { ...tier, projected_savings: Math.max(0, Math.round(savings)), break_even_months: breakEvenMonths };
  });

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
          {/* Spend Summary */}
          {spendData && spendData.total_6mo > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 bg-muted/50 rounded-md border">
                <p className="text-[10px] text-muted-foreground">6-Month Spend</p>
                <p className="text-sm font-mono font-bold">${spendData.total_6mo}</p>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-md border">
                <p className="text-[10px] text-muted-foreground">Monthly Avg</p>
                <p className="text-sm font-mono font-bold">${spendData.monthly_avg}</p>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-md border">
                <p className="text-[10px] text-muted-foreground">Avg/Visit</p>
                <p className="text-sm font-mono font-bold">${spendData.avg_per_visit}</p>
              </div>
            </div>
          )}

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
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Tier Comparison with Projections */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tier Comparison</p>
            {projections.map((tier) => (
              <Card key={tier.id} className={aiRec?.recommended_tier === tier.id ? "border-primary/50 bg-primary/5" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{tier.label}</span>
                        {aiRec?.recommended_tier === tier.id && <Badge className="text-[9px] bg-primary">Recommended</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{tier.description}</p>
                    </div>
                    <span className="text-lg font-mono font-bold">${tier.price}<span className="text-xs text-muted-foreground">/mo</span></span>
                  </div>
                  {spendData && spendData.total_6mo > 0 && (
                    <div className="flex items-center gap-3 mt-1.5">
                      {tier.projected_savings > 0 && (
                        <Badge variant="outline" className="text-[9px] text-success">
                          <TrendingUp className="h-2.5 w-2.5 mr-0.5" />~${tier.projected_savings}/yr savings
                        </Badge>
                      )}
                      {tier.break_even_months > 0 && tier.break_even_months <= 12 && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <CalendarDays className="h-2.5 w-2.5" />Break-even: {tier.break_even_months}mo
                        </span>
                      )}
                    </div>
                  )}
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
