import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, DollarSign, Package, Send } from "lucide-react";
import { toast } from "sonner";

interface PricingQuoteToolProps {
  patientId?: string;
  patientName?: string;
}

export function PricingQuoteTool({ patientId, patientName }: PricingQuoteToolProps) {
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const { data: treatments } = useQuery({
    queryKey: ["treatments-pricing"],
    queryFn: async () => {
      const { data } = await supabase.from("treatments").select("id, name, price, category, duration_minutes").eq("is_active", true).order("category").order("name");
      return data ?? [];
    },
  });

  const toggleTreatment = (id: string) => {
    setSelectedTreatments((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
    setQuote(null);
  };

  const generateQuote = async () => {
    if (selectedTreatments.length === 0) { toast.error("Select at least one treatment"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-smart-schedule", {
        body: { mode: "pricing_quote", data: { treatment_ids: selectedTreatments, patient_id: patientId } },
      });
      if (error) throw error;
      setQuote(data);
    } catch {
      toast.error("Failed to generate quote");
    }
    setLoading(false);
  };

  const filtered = treatments?.filter((t) => {
    if (!search) return true;
    return t.name.toLowerCase().includes(search.toLowerCase()) || t.category?.toLowerCase().includes(search.toLowerCase());
  }) ?? [];

  const categories = [...new Set(filtered.map((t) => t.category || "General"))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Pricing & Quote Builder</h3>
          {patientName && <p className="text-xs text-muted-foreground">For: {patientName}</p>}
        </div>
        <Button size="sm" onClick={generateQuote} disabled={loading || selectedTreatments.length === 0}>
          {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
          Build Quote
        </Button>
      </div>

      <Input placeholder="Search treatments..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs" />

      <div className="max-h-[250px] overflow-y-auto space-y-3">
        {categories.map((cat) => (
          <div key={cat}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{cat}</p>
            <div className="space-y-1">
              {filtered.filter((t) => (t.category || "General") === cat).map((t) => (
                <label key={t.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                  <Checkbox
                    checked={selectedTreatments.includes(t.id)}
                    onCheckedChange={() => toggleTreatment(t.id)}
                  />
                  <span className="text-xs flex-1">{t.name}</span>
                  <span className="text-xs font-mono text-muted-foreground">${t.price || 0}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedTreatments.length > 0 && !quote && (
        <div className="text-xs text-muted-foreground">
          {selectedTreatments.length} treatment(s) selected — ${treatments?.filter((t) => selectedTreatments.includes(t.id)).reduce((s, t) => s + (t.price || 0), 0)} à la carte
        </div>
      )}

      {quote && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />Quote Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Line items */}
            <div className="space-y-1">
              {quote.line_items?.map((item: any, i: number) => (
                <div key={i} className="flex justify-between text-xs">
                  <span>{item.name}</span>
                  <span className="font-mono">${item.price}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs font-bold border-t pt-1 mt-1">
                <span>À la carte total</span>
                <span className="font-mono">${quote.a_la_carte_total}</span>
              </div>
            </div>

            {/* Package options */}
            {quote.package_options?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Package Options</p>
                {quote.package_options.map((pkg: any, i: number) => (
                  <div key={i} className="p-2 bg-success/5 border border-success/20 rounded">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{pkg.package_name}</span>
                      <span className="text-xs font-mono font-bold">${pkg.package_price}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[9px] text-success">Save ${pkg.savings} ({pkg.savings_pct}%)</Badge>
                      <span className="text-[10px] text-muted-foreground">Covers: {pkg.covers?.join(", ")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* AI recommendation */}
            {quote.recommendation && (
              <div className="p-2 bg-primary/5 border border-primary/20 rounded">
                <p className="text-[10px] text-primary flex items-center gap-1 mb-0.5"><Sparkles className="h-2.5 w-2.5" />AI Recommendation</p>
                <p className="text-xs">{quote.recommendation}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
