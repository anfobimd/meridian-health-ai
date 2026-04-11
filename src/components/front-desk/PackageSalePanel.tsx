import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, Package, DollarSign, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface PackageSalePanelProps {
  patientId: string;
  patientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PackageSalePanel({ patientId, patientName, open, onOpenChange }: PackageSalePanelProps) {
  const [aiRec, setAiRec] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState("");
  const queryClient = useQueryClient();

  const { data: packages } = useQuery({
    queryKey: ["service-packages-active"],
    queryFn: async () => {
      const { data } = await supabase.from("service_packages").select("*").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const fetchRecommendation = async () => {
    setLoadingAi(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-package-engine", {
        body: { mode: "recommend_package", patient_id: patientId },
      });
      if (error) throw error;
      setAiRec(data);
    } catch {
      toast.error("Failed to get AI recommendation");
    }
    setLoadingAi(false);
  };

  const sellPackage = useMutation({
    mutationFn: async () => {
      const pkg = packages?.find((p: any) => p.id === selectedPkg);
      if (!pkg) throw new Error("Package not found");
      const expiresAt = pkg.valid_days ? new Date(Date.now() + pkg.valid_days * 86400000).toISOString() : null;
      const { error } = await supabase.from("patient_package_purchases").insert({
        package_id: selectedPkg,
        patient_id: patientId,
        price_paid: pkg.price,
        sessions_total: pkg.session_count,
        sessions_used: 0,
        deferred_revenue_amount: pkg.price,
        revenue_recognized_amount: 0,
        status: "active",
        expires_at: expiresAt,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["package-purchases"] });
      onOpenChange(false);
      setSelectedPkg("");
      setAiRec(null);
      toast.success("Package sold successfully");
    },
    onError: () => toast.error("Failed to sell package"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Sell Package — {patientName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* AI Recommendation */}
          <Button variant="outline" size="sm" className="w-full" onClick={fetchRecommendation} disabled={loadingAi}>
            {loadingAi ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            AI Recommend Best Package
          </Button>

          {aiRec && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-medium text-primary flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />AI Insight
                </p>
                {aiRec.insight && <p className="text-xs text-foreground">{aiRec.insight}</p>}
                {aiRec.recommendations?.map((rec: any, i: number) => (
                  <div key={i} className="p-2 bg-background rounded border space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{rec.package_name}</span>
                      <div className="flex items-center gap-1.5">
                        {rec.estimated_savings && <Badge variant="outline" className="text-[9px] text-success">{rec.estimated_savings} savings</Badge>}
                        <Badge variant={rec.urgency === "high" ? "destructive" : "secondary"} className="text-[9px]">{rec.urgency}</Badge>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{rec.reasoning}</p>
                    {rec.synergy_note && <p className="text-[10px] text-primary">{rec.synergy_note}</p>}
                    {rec.package_id && (
                      <Button size="sm" variant="outline" className="text-[10px] h-6 mt-1" onClick={() => setSelectedPkg(rec.package_id)}>
                        Select This Package
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Manual Selection */}
          <div className="space-y-2">
            <Label>Select Package</Label>
            <Select value={selectedPkg} onValueChange={setSelectedPkg}>
              <SelectTrigger><SelectValue placeholder="Choose a package" /></SelectTrigger>
              <SelectContent>
                {packages?.map((pkg: any) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.name} — ${pkg.price} ({pkg.session_count} sessions)
                    {pkg.individual_price > 0 && ` • Save ${Math.round(((pkg.individual_price * pkg.session_count - pkg.price) / (pkg.individual_price * pkg.session_count)) * 100)}%`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPkg && (() => {
            const pkg = packages?.find((p: any) => p.id === selectedPkg);
            if (!pkg) return null;
            const savings = pkg.individual_price ? (pkg.individual_price * pkg.session_count) - pkg.price : 0;
            return (
              <Card>
                <CardContent className="p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">{pkg.name}</span>
                    <span className="text-lg font-bold font-mono">${pkg.price}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{pkg.session_count} sessions</span>
                    {pkg.valid_days && <span>Valid {pkg.valid_days} days</span>}
                    {savings > 0 && <Badge variant="outline" className="text-success text-[9px]">
                      <TrendingUp className="h-2.5 w-2.5 mr-0.5" />Save ${savings}
                    </Badge>}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <Button className="w-full" disabled={!selectedPkg || sellPackage.isPending} onClick={() => sellPackage.mutate()}>
            {sellPackage.isPending ? "Processing..." : "Complete Sale"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
