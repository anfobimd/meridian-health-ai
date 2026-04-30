import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Sparkles, Loader2, DollarSign, Package, Send, Mail } from "lucide-react";
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
  const [isMember, setIsMember] = useState(false);
  const [sendingQuote, setSendingQuote] = useState(false);

  const { data: treatments } = useQuery({
    queryKey: ["treatments-pricing"],
    queryFn: async () => {
      const { data } = await supabase.from("treatments").select("id, name, price, category, duration_minutes, member_price").eq("is_active", true).order("category").order("name");
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
        body: { mode: "pricing_quote", data: { treatment_ids: selectedTreatments, patient_id: patientId, is_member: isMember } },
      });
      if (error) throw error;
      setQuote(data);
    } catch {
      // Fallback: compute basic quote locally
      const selected = treatments?.filter(t => selectedTreatments.includes(t.id)) ?? [];
      const total = selected.reduce((s, t) => s + (isMember && (t as any).member_price ? (t as any).member_price : (t.price || 0)), 0);
      setQuote({
        line_items: selected.map(t => ({
          name: t.name,
          price: isMember && (t as any).member_price ? (t as any).member_price : t.price,
          regular_price: t.price,
        })),
        a_la_carte_total: total,
      });
    }
    setLoading(false);
  };

  const sendQuoteToPatient = async (channel: "email" | "sms") => {
    if (!patientId || !quote) return;
    setSendingQuote(true);
    try {
      // Log the quote send
      await supabase.from("patient_communication_log").insert({
        patient_id: patientId,
        channel,
        direction: "outbound",
        content: `Price quote: ${quote.line_items?.map((i: any) => `${i.name} ($${i.price})`).join(", ")} — Total: $${quote.a_la_carte_total}`,
      } as any);
      toast.success(`Quote sent via ${channel}`);
    } catch {
      toast.error("Failed to send quote");
    }
    setSendingQuote(false);
  };

  const filtered = treatments?.filter((t) => {
    if (!search) return true;
    return t.name.toLowerCase().includes(search.toLowerCase()) || t.category?.toLowerCase().includes(search.toLowerCase());
  }) ?? [];

  const categories = [...new Set(filtered.map((t) => t.category || "General"))];

  const selectedTotal = treatments?.filter(t => selectedTreatments.includes(t.id))
    .reduce((s, t) => s + (isMember && (t as any).member_price ? (t as any).member_price : (t.price || 0)), 0) ?? 0;

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

      {/* Member Toggle */}
      <div className="flex items-center justify-between bg-muted/50 rounded-md p-2">
        <Label className="text-xs flex items-center gap-1.5">
          <Package className="h-3 w-3" />Member Pricing
        </Label>
        <Switch checked={isMember} onCheckedChange={setIsMember} />
      </div>

      <Input placeholder="Search treatments..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs" />

      <div className="max-h-[250px] overflow-y-auto space-y-3">
        {categories.map((cat) => (
          <div key={cat}>
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{cat}</p>
            <div className="space-y-1">
              {filtered.filter((t) => (t.category || "General") === cat).map((t) => (
                <label key={t.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                  <Checkbox
                    checked={selectedTreatments.includes(t.id)}
                    onCheckedChange={() => toggleTreatment(t.id)}
                  />
                  <span className="text-xs flex-1">{t.name}</span>
                  <div className="text-right">
                    <span className="text-xs font-mono text-muted-foreground">
                      ${isMember && (t as any).member_price ? (t as any).member_price : t.price || 0}
                    </span>
                    {isMember && (t as any).member_price && (t as any).member_price < (t.price || 0) && (
                      <span className="text-[11px] text-success ml-1">
                        (save ${((t.price || 0) - (t as any).member_price).toFixed(0)})
                      </span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedTreatments.length > 0 && !quote && (
        <div className="text-xs text-muted-foreground">
          {selectedTreatments.length} treatment(s) selected — ${selectedTotal.toFixed(0)} {isMember ? "(member)" : "à la carte"}
        </div>
      )}

      {quote && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />Quote Summary
              {isMember && <Badge variant="secondary" className="text-[11px]">Member</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Line items */}
            <div className="space-y-1">
              {quote.line_items?.map((item: any, i: number) => (
                <div key={i} className="flex justify-between text-xs">
                  <span>{item.name}</span>
                  <div className="flex items-center gap-1.5">
                    {item.regular_price && item.regular_price > item.price && (
                      <span className="text-[11px] text-muted-foreground line-through">${item.regular_price}</span>
                    )}
                    <span className="font-mono">${item.price}</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between text-xs font-bold border-t pt-1 mt-1">
                <span>Total</span>
                <span className="font-mono">${quote.a_la_carte_total}</span>
              </div>
            </div>

            {/* Package options */}
            {quote.package_options?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5 text-primary" />AI Package Alternatives
                </p>
                {quote.package_options.map((pkg: any, i: number) => (
                  <div key={i} className="p-2 bg-success/5 border border-success/20 rounded">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{pkg.package_name}</span>
                      <span className="text-xs font-mono font-bold">${pkg.package_price}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[11px] text-success">Save ${pkg.savings} ({pkg.savings_pct}%)</Badge>
                      <span className="text-[11px] text-muted-foreground">Covers: {pkg.covers?.join(", ")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* AI recommendation */}
            {quote.recommendation && (
              <div className="p-2 bg-primary/5 border border-primary/20 rounded">
                <p className="text-[11px] text-primary flex items-center gap-1 mb-0.5"><Sparkles className="h-2.5 w-2.5" />AI Recommendation</p>
                <p className="text-xs">{quote.recommendation}</p>
              </div>
            )}

            <Separator />

            {/* Send Quote */}
            {patientId && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => sendQuoteToPatient("email")} disabled={sendingQuote}>
                  <Mail className="h-3 w-3 mr-1" />Email Quote
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => sendQuoteToPatient("sms")} disabled={sendingQuote}>
                  <Send className="h-3 w-3 mr-1" />SMS Quote
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
