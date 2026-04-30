import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Stethoscope, ShieldCheck, FileCheck, Eye, EyeOff, DollarSign, History, Sparkles, Loader2, AlertTriangle, CheckCircle2, ChevronRight, Globe } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

export default function Treatments() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [editingPrice, setEditingPrice] = useState<any>(null);
  const [aiTemplate, setAiTemplate] = useState<any>(null);
  const [aiTemplateLoading, setAiTemplateLoading] = useState(false);
  const [aiDeactivation, setAiDeactivation] = useState<any>(null);
  const [aiDeactivationLoading, setAiDeactivationLoading] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [aiRevImpact, setAiRevImpact] = useState<any>(null);
  const [aiRevImpactLoading, setAiRevImpactLoading] = useState(false);
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

  const { data: priceHistory } = useQuery({
    queryKey: ["price-history"],
    queryFn: async () => {
      const { data } = await supabase.from("treatment_price_history").select("*, treatments:treatment_id(name)").order("created_at", { ascending: false }).limit(50);
      return data ?? [];
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
        member_price: parseFloat(formData.get("member_price") as string) || 0,
        is_member_pricing_enabled: !!formData.get("member_pricing"),
        requires_gfe: formData.get("requires_gfe") === "on",
        requires_md_review: formData.get("requires_md_review") === "on",
        bookable_via_self_serve: formData.get("bookable_via_self_serve") === "on",
      };
      const { error } = await supabase.from("treatments").insert(treatment as any);
      if (error) throw error;
      await supabase.from("audit_logs").insert({ user_id: user?.id, action: "create", table_name: "treatments", new_values: treatment });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      setDialogOpen(false);
      setAiTemplate(null);
      toast.success("Treatment added");
    },
    onError: () => toast.error("Failed to add treatment"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("treatments").update({ is_active }).eq("id", id);
      if (error) throw error;
      await supabase.from("audit_logs").insert({ user_id: user?.id, action: "update", table_name: "treatments", record_id: id, new_values: { is_active } });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["treatments"] }); toast.success("Treatment updated"); },
  });

  const toggleFlag = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: "requires_gfe" | "requires_md_review" | "bookable_via_self_serve"; value: boolean }) => {
      const { error } = await supabase.from("treatments").update({ [field]: value } as any).eq("id", id);
      if (error) throw error;
      await supabase.from("audit_logs").insert({ user_id: user?.id, action: "update", table_name: "treatments", record_id: id, new_values: { [field]: value } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["treatments"] }),
  });

  const updatePrice = useMutation({
    mutationFn: async ({ id, price, member_price, is_member_pricing_enabled, reason }: any) => {
      const treatment = treatments?.find((t: any) => t.id === id);
      await supabase.from("treatment_price_history").insert({
        treatment_id: id, old_price: treatment?.price ?? 0, new_price: price,
        old_member_price: treatment?.member_price ?? 0, new_member_price: member_price,
        changed_by: user?.id, change_reason: reason || null,
      });
      const { error } = await supabase.from("treatments").update({ price, member_price, is_member_pricing_enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      queryClient.invalidateQueries({ queryKey: ["price-history"] });
      setEditingPrice(null);
      setAiRevImpact(null);
      toast.success("Pricing updated");
    },
    onError: () => toast.error("Failed to update pricing"),
  });

  // ─── AI: Template Match ───
  const checkTemplate = async (name: string, category: string) => {
    if (!name) return;
    setAiTemplateLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-catalog-advisor", {
        body: { mode: "template_match", data: { treatment_name: name, category } },
      });
      if (error) throw error;
      setAiTemplate(data);
    } catch { toast.error("AI template check failed"); }
    setAiTemplateLoading(false);
  };

  // ─── AI: Deactivation Impact ───
  const checkDeactivation = async (id: string, name: string) => {
    setDeactivatingId(id);
    setAiDeactivationLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-catalog-advisor", {
        body: { mode: "deactivation_impact", data: { treatment_id: id, treatment_name: name } },
      });
      if (error) throw error;
      setAiDeactivation(data);
    } catch { toast.error("Impact check failed"); }
    setAiDeactivationLoading(false);
  };

  // ─── AI: Revenue Impact ───
  const checkRevImpact = async (treatment: any, newPrice: number, newMemberPrice: number) => {
    setAiRevImpactLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-catalog-advisor", {
        body: { mode: "revenue_impact", data: {
          treatment_name: treatment.name, old_price: treatment.price || 0, new_price: newPrice,
          old_member_price: treatment.member_price || 0, new_member_price: newMemberPrice,
        }},
      });
      if (error) throw error;
      setAiRevImpact(data);
    } catch { toast.error("Revenue impact check failed"); }
    setAiRevImpactLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Treatments</h1>
          <p className="text-muted-foreground">Service catalog with compliance flags & pricing</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)}>
            {showInactive ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
            {showInactive ? "Hide Inactive" : "Show Inactive"}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setAiTemplate(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Treatment</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add Treatment</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addTreatment.mutate(new FormData(e.currentTarget)); }} className="space-y-4">
                <div className="space-y-2"><Label>Name *</Label><Input name="name" required onBlur={(e) => {
                  const form = e.target.closest("form");
                  const cat = form?.querySelector<HTMLInputElement>('[name="category"]')?.value || "";
                  checkTemplate(e.target.value, cat);
                }} /></div>
                <div className="space-y-2"><Label>Description</Label><Input name="description" /></div>
                <div className="space-y-2"><Label>Category</Label><Input name="category" placeholder="e.g. Injectables, Laser" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Duration (min)</Label><Input name="duration" type="number" defaultValue={30} /></div>
                  <div className="space-y-2"><Label>Price ($)</Label><Input name="price" type="number" step="0.01" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Member Price ($)</Label><Input name="member_price" type="number" step="0.01" /></div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer self-end pb-2">
                    <input type="checkbox" name="member_pricing" className="rounded border-input" />Enable member pricing
                  </label>
                </div>
                <div className="flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" name="requires_gfe" className="rounded border-input" defaultChecked={aiTemplate?.should_require_gfe} />
                    <ShieldCheck className="h-4 w-4 text-warning" /> Requires GFE
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" name="requires_md_review" className="rounded border-input" defaultChecked={aiTemplate?.should_require_md_review} />
                    <FileCheck className="h-4 w-4 text-info" /> Requires MD Review
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" name="bookable_via_self_serve" className="rounded border-input" />
                    <Globe className="h-4 w-4 text-success" /> Bookable online
                  </label>
                </div>
                {/* AI Template Recommendation */}
                {aiTemplateLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 bg-primary/5 rounded">
                    <Loader2 className="h-3 w-3 animate-spin" />Analyzing template match…
                  </div>
                )}
                {aiTemplate && !aiTemplateLoading && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold">AI Recommendation</span>
                        <Badge variant="outline" className="text-[11px]">{aiTemplate.match_confidence} match</Badge>
                      </div>
                      <p className="text-xs"><strong>Template:</strong> {aiTemplate.recommended_template_name}</p>
                      <p className="text-xs text-muted-foreground">{aiTemplate.match_reason}</p>
                      {aiTemplate.gfe_reason && <p className="text-xs"><strong>GFE:</strong> {aiTemplate.gfe_reason}</p>}
                      {aiTemplate.md_review_reason && <p className="text-xs"><strong>MD Review:</strong> {aiTemplate.md_review_reason}</p>}
                    </CardContent>
                  </Card>
                )}
                <Button type="submit" className="w-full" disabled={addTreatment.isPending}>
                  {addTreatment.isPending ? "Adding..." : "Add Treatment"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog"><Stethoscope className="h-3.5 w-3.5 mr-1" /> Catalog</TabsTrigger>
          <TabsTrigger value="pricing"><DollarSign className="h-3.5 w-3.5 mr-1" /> Pricing</TabsTrigger>
          <TabsTrigger value="history"><History className="h-3.5 w-3.5 mr-1" /> Price History</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog">
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
                            <Switch checked={t.requires_gfe} onCheckedChange={(v) => toggleFlag.mutate({ id: t.id, field: "requires_gfe", value: v })} className="scale-75" />
                            <ShieldCheck className="h-3.5 w-3.5 text-warning" /> GFE
                          </label>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <Switch checked={t.requires_md_review} onCheckedChange={(v) => toggleFlag.mutate({ id: t.id, field: "requires_md_review", value: v })} className="scale-75" />
                            <FileCheck className="h-3.5 w-3.5 text-info" /> MD
                          </label>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <Switch checked={t.bookable_via_self_serve} onCheckedChange={(v) => toggleFlag.mutate({ id: t.id, field: "bookable_via_self_serve", value: v })} className="scale-75" />
                            <Globe className="h-3.5 w-3.5 text-success" /> Self-serve
                          </label>
                          <div className="ml-auto flex items-center gap-1">
                            {t.is_active && (
                              <Button variant="ghost" size="sm" className="h-6 text-[11px] text-warning" onClick={() => checkDeactivation(t.id, t.name)}>
                                {aiDeactivationLoading && deactivatingId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Impact?"}
                              </Button>
                            )}
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <Switch checked={t.is_active} onCheckedChange={(v) => toggleActive.mutate({ id: t.id, is_active: v })} className="scale-75" />
                              Active
                            </label>
                          </div>
                        </div>
                      </div>
                      <div className="text-right ml-2">
                        {t.price && <span className="text-sm font-semibold">${Number(t.price).toFixed(2)}</span>}
                        {t.is_member_pricing_enabled && t.member_price > 0 && (
                          <p className="text-[11px] text-primary">Member: ${Number(t.member_price).toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card><CardContent className="py-12 text-center"><Stethoscope className="h-12 w-12 mx-auto text-muted-foreground/50" /><p className="mt-4 text-muted-foreground">No treatments yet</p></CardContent></Card>
          )}

          {/* AI Deactivation Impact Panel */}
          {aiDeactivation && (
            <Card className={`mt-4 border-${aiDeactivation.risk_level === "critical" ? "destructive" : aiDeactivation.risk_level === "warning" ? "warning" : "primary"}/20`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className={`h-4 w-4 ${aiDeactivation.risk_level === "critical" ? "text-destructive" : aiDeactivation.risk_level === "warning" ? "text-warning" : "text-primary"}`} />
                  <span className="text-sm font-semibold">Deactivation Impact Analysis</span>
                  <Badge variant="outline" className="text-[11px]">{aiDeactivation.risk_level}</Badge>
                  <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => setAiDeactivation(null)}>Dismiss</Button>
                </div>
                <p className="text-xs mb-2">{aiDeactivation.summary}</p>
                <p className="text-xs text-muted-foreground">Affected appointments: {aiDeactivation.affected_appointments}</p>
                {aiDeactivation.recommended_actions?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {aiDeactivation.recommended_actions.map((a: string, i: number) => (
                      <p key={i} className="text-xs flex items-start gap-1.5"><ChevronRight className="h-3 w-3 text-primary mt-0.5 shrink-0" />{a}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pricing">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Treatment</TableHead><TableHead>Category</TableHead>
                    <TableHead>Standard Price</TableHead><TableHead>Member Price</TableHead>
                    <TableHead>Member Pricing</TableHead><TableHead className="w-[80px]">Edit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {treatments?.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[11px]">{t.category || "—"}</Badge></TableCell>
                      <TableCell className="font-mono">${Number(t.price || 0).toFixed(2)}</TableCell>
                      <TableCell className="font-mono">{t.is_member_pricing_enabled ? `$${Number(t.member_price || 0).toFixed(2)}` : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={t.is_member_pricing_enabled ? "default" : "secondary"} className="text-[11px]">
                          {t.is_member_pricing_enabled ? "Enabled" : "Off"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingPrice(t); setAiRevImpact(null); }}>
                          <DollarSign className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Treatment</TableHead><TableHead>Old Price</TableHead><TableHead>New Price</TableHead>
                    <TableHead>Old Member</TableHead><TableHead>New Member</TableHead>
                    <TableHead>Reason</TableHead><TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceHistory && priceHistory.length > 0 ? priceHistory.map((h: any) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">{(h as any).treatments?.name || "—"}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">${Number(h.old_price || 0).toFixed(2)}</TableCell>
                      <TableCell className="font-mono">${Number(h.new_price || 0).toFixed(2)}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">${Number(h.old_member_price || 0).toFixed(2)}</TableCell>
                      <TableCell className="font-mono">${Number(h.new_member_price || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">{h.change_reason || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(parseISO(h.created_at), "MMM d, yyyy")}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No price changes recorded</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Pricing Dialog with AI Revenue Impact */}
      <Dialog open={!!editingPrice} onOpenChange={(o) => { if (!o) { setEditingPrice(null); setAiRevImpact(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Pricing — {editingPrice?.name}</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              updatePrice.mutate({
                id: editingPrice.id,
                price: parseFloat(fd.get("price") as string) || 0,
                member_price: parseFloat(fd.get("member_price") as string) || 0,
                is_member_pricing_enabled: fd.get("member_enabled") === "on",
                reason: fd.get("reason") as string,
              });
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Standard Price ($)</Label><Input name="price" type="number" step="0.01" defaultValue={editingPrice?.price || 0} /></div>
              <div className="space-y-2"><Label>Member Price ($)</Label><Input name="member_price" type="number" step="0.01" defaultValue={editingPrice?.member_price || 0} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" name="member_enabled" className="rounded border-input" defaultChecked={editingPrice?.is_member_pricing_enabled} />Enable member pricing
            </label>
            <div className="space-y-2"><Label>Change Reason</Label><Input name="reason" placeholder="e.g. Annual price adjustment" /></div>

            {/* AI Revenue Impact Button */}
            <Button type="button" variant="outline" size="sm" className="w-full" disabled={aiRevImpactLoading}
              onClick={() => {
                const form = document.querySelector<HTMLFormElement>('form');
                const fd = form ? new FormData(form) : null;
                checkRevImpact(editingPrice, parseFloat(fd?.get("price") as string || "0"), parseFloat(fd?.get("member_price") as string || "0"));
              }}>
              {aiRevImpactLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              {aiRevImpact ? "Refresh Impact Analysis" : "Analyze Revenue Impact"}
            </Button>

            {aiRevImpact && (
              <Card className={`border-${aiRevImpact.risk_level === "critical" ? "destructive" : aiRevImpact.risk_level === "negative" ? "warning" : "success"}/20 bg-${aiRevImpact.risk_level === "critical" ? "destructive" : aiRevImpact.risk_level === "negative" ? "warning" : "success"}/5`}>
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold">Revenue Impact</span>
                    <Badge variant="outline" className="text-[11px]">{aiRevImpact.risk_level}</Badge>
                  </div>
                  <p className="text-xs font-medium">Est. Monthly Impact: {aiRevImpact.estimated_monthly_impact}</p>
                  <p className="text-xs text-muted-foreground">{aiRevImpact.commentary}</p>
                  {aiRevImpact.below_cost_warning && (
                    <div className="flex items-center gap-1.5 text-xs text-destructive font-medium">
                      <AlertTriangle className="h-3 w-3" />Below-cost warning!
                    </div>
                  )}
                  {aiRevImpact.recommendation && <p className="text-xs text-primary">→ {aiRevImpact.recommendation}</p>}
                </CardContent>
              </Card>
            )}

            <Button type="submit" className="w-full" disabled={updatePrice.isPending}>
              {updatePrice.isPending ? "Saving..." : "Update Pricing"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
