import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Package, Plus, Clock, DollarSign, CheckCircle, AlertTriangle, Pause, Sparkles,
  ShoppingCart, BarChart3, Loader2, Eye, XCircle, Play, TrendingUp, TrendingDown, Minus
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";

export default function Packages() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [insightsData, setInsightsData] = useState<any>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [riskData, setRiskData] = useState<any>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [newPkg, setNewPkg] = useState({ name: "", description: "", package_type: "single", session_count: 6, price: 0, individual_price: 0, valid_days: 365, category: "" });
  const [sellForm, setSellForm] = useState({ package_id: "", patient_id: "", provider_id: "", notes: "" });

  const { data: packages } = useQuery({
    queryKey: ["service-packages"],
    queryFn: async () => {
      const { data } = await supabase.from("service_packages").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: purchases } = useQuery({
    queryKey: ["package-purchases"],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_package_purchases")
        .select("*, service_packages(name, session_count, price), patients(first_name, last_name)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: rules } = useQuery({
    queryKey: ["notification-rules"],
    queryFn: async () => {
      const { data } = await supabase.from("package_notification_rules").select("*").order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const { data: patients } = useQuery({
    queryKey: ["patients-list"],
    queryFn: async () => {
      const { data } = await supabase.from("patients").select("id, first_name, last_name").order("last_name").limit(500);
      return data ?? [];
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["providers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  // ─── KPI calculations ─────────────────────────────────────────────
  const activePurchases = purchases?.filter((p: any) => p.status === "active") ?? [];
  const completedPurchases = purchases?.filter((p: any) => p.status === "completed") ?? [];
  const expiredPurchases = purchases?.filter((p: any) => p.status === "expired") ?? [];
  const totalDeferred = activePurchases.reduce((sum: number, p: any) => sum + (p.deferred_revenue_amount || 0), 0);
  const totalRecognized = purchases?.reduce((sum: number, p: any) => sum + (p.revenue_recognized_amount || 0), 0) ?? 0;
  const completionRate = (completedPurchases.length + expiredPurchases.length) > 0
    ? Math.round((completedPurchases.length / (completedPurchases.length + expiredPurchases.length)) * 100) : 0;
  const atRiskCount = activePurchases.filter((p: any) => {
    const daysLeft = p.expires_at ? differenceInDays(parseISO(p.expires_at), new Date()) : null;
    const pct = p.sessions_total > 0 ? (p.sessions_used / p.sessions_total) * 100 : 0;
    return daysLeft !== null && daysLeft < 30 && pct < 50;
  }).length;

  // ─── Mutations ────────────────────────────────────────────────────
  const createPackage = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("service_packages").insert({
        name: newPkg.name, description: newPkg.description || null, package_type: newPkg.package_type,
        session_count: newPkg.session_count, price: newPkg.price, individual_price: newPkg.individual_price || null,
        valid_days: newPkg.valid_days, category: newPkg.category || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-packages"] });
      setCreateOpen(false);
      setNewPkg({ name: "", description: "", package_type: "single", session_count: 6, price: 0, individual_price: 0, valid_days: 365, category: "" });
      toast({ title: "Package created" });
    },
  });

  const sellPackage = useMutation({
    mutationFn: async () => {
      const pkg = packages?.find((p: any) => p.id === sellForm.package_id);
      if (!pkg) throw new Error("Package not found");
      const expiresAt = pkg.valid_days
        ? new Date(Date.now() + pkg.valid_days * 86400000).toISOString()
        : null;
      const { error } = await supabase.from("patient_package_purchases").insert({
        package_id: sellForm.package_id,
        patient_id: sellForm.patient_id,
        provider_id: sellForm.provider_id || null,
        price_paid: pkg.price,
        sessions_total: pkg.session_count,
        sessions_used: 0,
        deferred_revenue_amount: pkg.price,
        revenue_recognized_amount: 0,
        status: "active",
        expires_at: expiresAt,
        notes: sellForm.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["package-purchases"] });
      setSellOpen(false);
      setSellForm({ package_id: "", patient_id: "", provider_id: "", notes: "" });
      toast({ title: "Package sold successfully" });
    },
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("package_notification_rules").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-rules"] }),
  });

  const updatePurchaseStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "paused") updates.paused_at = new Date().toISOString();
      if (status === "cancelled") updates.cancelled_at = new Date().toISOString();
      const { error } = await supabase.from("patient_package_purchases").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["package-purchases"] });
      toast({ title: "Purchase updated" });
    },
  });

  const redeemSession = useMutation({
    mutationFn: async ({ purchaseId, treatmentName }: { purchaseId: string; treatmentName: string }) => {
      const purchase = purchases?.find((p: any) => p.id === purchaseId);
      if (!purchase) throw new Error("Purchase not found");
      const revPerSession = purchase.sessions_total > 0 ? purchase.price_paid / purchase.sessions_total : 0;
      const { error } = await supabase.from("patient_package_sessions").insert({
        purchase_id: purchaseId,
        treatment_name: treatmentName,
        revenue_amount: revPerSession,
        redeemed_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["package-purchases"] });
      toast({ title: "Session redeemed" });
    },
  });

  const togglePackageActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("service_packages").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-packages"] });
      toast({ title: "Package updated" });
    },
  });

  // ─── AI calls ─────────────────────────────────────────────────────
  const [bundleRecs, setBundleRecs] = useState<any>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [expirationAlerts, setExpirationAlerts] = useState<any>(null);
  const [expirationLoading, setExpirationLoading] = useState(false);

  const fetchInsights = async () => {
    setInsightsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-package-engine", {
        body: { mode: "dashboard_insights" },
      });
      if (error) throw error;
      setInsightsData(data);
    } catch {
      toast({ title: "Failed to generate insights", variant: "destructive" });
    }
    setInsightsLoading(false);
  };

  const fetchBundleRecs = async () => {
    setBundleLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-catalog-advisor", { body: { mode: "bundle_recommend" } });
      if (error) throw error;
      setBundleRecs(data);
    } catch { toast({ title: "Failed to generate bundle recommendations", variant: "destructive" }); }
    setBundleLoading(false);
  };

  const fetchExpirationAlerts = async () => {
    setExpirationLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-catalog-advisor", { body: { mode: "expiration_alerts" } });
      if (error) throw error;
      setExpirationAlerts(data);
    } catch { toast({ title: "Failed to generate expiration alerts", variant: "destructive" }); }
    setExpirationLoading(false);
  };

  const fetchRiskScores = async () => {
    setRiskLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-package-engine", {
        body: { mode: "risk_score" },
      });
      if (error) throw error;
      setRiskData(data);
    } catch {
      toast({ title: "Failed to score risk", variant: "destructive" });
    }
    setRiskLoading(false);
  };

  const previewNotification = async (ruleId: string) => {
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-package-engine", {
        body: { mode: "preview_notification", data: { rule_id: ruleId } },
      });
      if (error) throw error;
      setPreviewContent(data);
    } catch {
      setPreviewContent({ subject: "Preview failed", body: "Could not generate preview" });
    }
    setPreviewLoading(false);
  };

  const savingsPercent = (pkg: any) => {
    if (!pkg.individual_price || pkg.individual_price === 0) return 0;
    const alaCarte = pkg.individual_price * pkg.session_count;
    return Math.round(((alaCarte - pkg.price) / alaCarte) * 100);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-success/10 text-success";
      case "paused": return "bg-warning/10 text-warning";
      case "completed": return "bg-primary/10 text-primary";
      case "expired": return "bg-destructive/10 text-destructive";
      case "cancelled": return "bg-muted text-muted-foreground";
      default: return "";
    }
  };

  const trendIcon = (trend: string) => {
    if (trend === "up") return <TrendingUp className="h-3 w-3 text-success" />;
    if (trend === "down") return <TrendingDown className="h-3 w-3 text-destructive" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif">Service Packages</h1>
          <p className="text-muted-foreground text-sm">Create, sell, and track pre-paid treatment bundles</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchInsights} disabled={insightsLoading}>
            {insightsLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
            AI Insights
          </Button>
          <Button size="sm" variant="outline" onClick={fetchRiskScores} disabled={riskLoading}>
            {riskLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
            Risk Scan
          </Button>
          <Button size="sm" variant="outline" onClick={fetchBundleRecs} disabled={bundleLoading}>
            {bundleLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
            AI Bundles
          </Button>
          <Button size="sm" variant="outline" onClick={fetchExpirationAlerts} disabled={expirationLoading}>
            {expirationLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
            Expiration Alerts
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Package className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold font-mono">{activePurchases.length}</p>
            <p className="text-[10px] text-muted-foreground">Active Packages</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-warning mb-1" />
            <p className="text-2xl font-bold font-mono">${totalDeferred.toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground">Deferred Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-success mb-1" />
            <p className="text-2xl font-bold font-mono">${totalRecognized.toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground">Recognized Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold font-mono">{completionRate}%</p>
            <p className="text-[10px] text-muted-foreground">Completion Rate</p>
          </CardContent>
        </Card>
        <Card className={atRiskCount > 0 ? "border-destructive/30" : ""}>
          <CardContent className="p-4 text-center">
            <AlertTriangle className={`h-5 w-5 mx-auto mb-1 ${atRiskCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            <p className="text-2xl font-bold font-mono">{atRiskCount}</p>
            <p className="text-[10px] text-muted-foreground">At Risk</p>
          </CardContent>
        </Card>
      </div>

      {/* AI Insights Panel */}
      {insightsData && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">AI Dashboard Insights</span>
            </div>
            {insightsData.kpi_highlights?.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-3">
                {insightsData.kpi_highlights.map((kpi: any, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-md border text-xs">
                    {trendIcon(kpi.trend)}
                    <span className="font-medium">{kpi.label}:</span>
                    <span>{kpi.value}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-foreground whitespace-pre-line">{insightsData.narrative}</p>
            {insightsData.weekly_action && (
              <div className="mt-3 p-2 bg-warning/10 border border-warning/20 rounded text-xs">
                <strong>This week:</strong> {insightsData.weekly_action}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Risk Panel */}
      {riskData?.at_risk?.length > 0 && (
        <Card className="border-destructive/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              At-Risk Packages ({riskData.at_risk.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {riskData.at_risk.slice(0, 10).map((item: any, i: number) => (
                <div key={i} className="p-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.patient_name}</span>
                      <span className="text-xs text-muted-foreground">• {item.package_name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.reason}</p>
                    <p className="text-xs text-primary mt-0.5">→ {item.suggested_action}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.revenue_at_risk && <span className="text-xs text-destructive font-mono">{item.revenue_at_risk}</span>}
                    <Badge variant="destructive" className="text-[10px]">{item.risk_score}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notification Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>AI Notification Preview</DialogTitle></DialogHeader>
          {previewLoading ? (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : previewContent ? (
            <div className="space-y-3">
              {previewContent.subject && (
                <div><Label className="text-xs text-muted-foreground">Subject</Label><p className="text-sm font-medium">{previewContent.subject}</p></div>
              )}
              <div><Label className="text-xs text-muted-foreground">Body</Label><p className="text-sm whitespace-pre-line">{previewContent.body}</p></div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Templates ({packages?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="purchases">Purchases ({purchases?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="notifications">Notifications ({rules?.length ?? 0})</TabsTrigger>
        </TabsList>

        {/* TAB 1: Package Templates */}
        <TabsContent value="templates">
          <div className="flex justify-end mb-4 gap-2">
            <Dialog open={sellOpen} onOpenChange={setSellOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline"><ShoppingCart className="h-4 w-4 mr-1" /> Sell Package</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Sell Package to Patient</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Package</Label>
                    <Select value={sellForm.package_id} onValueChange={(v) => setSellForm({ ...sellForm, package_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                      <SelectContent>
                        {packages?.filter((p: any) => p.is_active).map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.name} — ${p.price}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Patient</Label>
                    <Select value={sellForm.patient_id} onValueChange={(v) => setSellForm({ ...sellForm, patient_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                      <SelectContent>
                        {patients?.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.last_name}, {p.first_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Assigned Provider (optional)</Label>
                    <Select value={sellForm.provider_id} onValueChange={(v) => setSellForm({ ...sellForm, provider_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Any provider" /></SelectTrigger>
                      <SelectContent>
                        {providers?.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>Dr. {p.last_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Notes</Label><Textarea value={sellForm.notes} onChange={(e) => setSellForm({ ...sellForm, notes: e.target.value })} rows={2} placeholder="Optional purchase notes" /></div>
                  <Button className="w-full" onClick={() => sellPackage.mutate()} disabled={!sellForm.package_id || !sellForm.patient_id || sellPackage.isPending}>
                    {sellPackage.isPending ? "Processing…" : "Complete Sale"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Package</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Create Package Template</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Name</Label><Input value={newPkg.name} onChange={(e) => setNewPkg({ ...newPkg, name: e.target.value })} placeholder="e.g. Glow Bundle — 6 Sessions" /></div>
                  <div><Label>Description</Label><Textarea value={newPkg.description} onChange={(e) => setNewPkg({ ...newPkg, description: e.target.value })} rows={2} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Type</Label>
                      <Select value={newPkg.package_type} onValueChange={(v) => setNewPkg({ ...newPkg, package_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Single Treatment</SelectItem>
                          <SelectItem value="multi">Multi Treatment</SelectItem>
                          <SelectItem value="unlimited">Unlimited</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Sessions</Label><Input type="number" value={newPkg.session_count} onChange={(e) => setNewPkg({ ...newPkg, session_count: parseInt(e.target.value) || 1 })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Package Price ($)</Label><Input type="number" value={newPkg.price} onChange={(e) => setNewPkg({ ...newPkg, price: parseFloat(e.target.value) || 0 })} /></div>
                    <div><Label>Individual Price ($)</Label><Input type="number" value={newPkg.individual_price} onChange={(e) => setNewPkg({ ...newPkg, individual_price: parseFloat(e.target.value) || 0 })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Valid Days</Label><Input type="number" value={newPkg.valid_days} onChange={(e) => setNewPkg({ ...newPkg, valid_days: parseInt(e.target.value) || 365 })} /></div>
                    <div><Label>Category</Label><Input value={newPkg.category} onChange={(e) => setNewPkg({ ...newPkg, category: e.target.value })} placeholder="e.g. Skin" /></div>
                  </div>
                  <Button className="w-full" onClick={() => createPackage.mutate()} disabled={!newPkg.name || createPackage.isPending}>
                    {createPackage.isPending ? "Creating…" : "Create Package"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {packages?.map((pkg: any) => (
              <Card key={pkg.id} className={!pkg.is_active ? "opacity-50" : ""}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-sm">{pkg.name}</h3>
                      {pkg.category && <Badge variant="outline" className="text-[10px] mt-1">{pkg.category}</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-[10px] capitalize">{pkg.package_type}</Badge>
                      <Button
                        size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={() => togglePackageActive.mutate({ id: pkg.id, is_active: !pkg.is_active })}
                        title={pkg.is_active ? "Deactivate" : "Activate"}
                      >
                        {pkg.is_active ? <XCircle className="h-3.5 w-3.5 text-muted-foreground" /> : <Play className="h-3.5 w-3.5 text-success" />}
                      </Button>
                    </div>
                  </div>
                  {pkg.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{pkg.description}</p>}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-muted/50 rounded">
                      <p className="text-lg font-bold font-mono">${pkg.price}</p>
                      <p className="text-[9px] text-muted-foreground">Package</p>
                    </div>
                    <div className="p-2 bg-muted/50 rounded">
                      <p className="text-lg font-bold font-mono">{pkg.session_count}</p>
                      <p className="text-[9px] text-muted-foreground">Sessions</p>
                    </div>
                    <div className="p-2 bg-muted/50 rounded">
                      {savingsPercent(pkg) > 0 ? (
                        <>
                          <p className="text-lg font-bold font-mono text-success">{savingsPercent(pkg)}%</p>
                          <p className="text-[9px] text-muted-foreground">Savings</p>
                        </>
                      ) : (
                        <>
                          <p className="text-lg font-bold font-mono">{pkg.valid_days}d</p>
                          <p className="text-[9px] text-muted-foreground">Valid</p>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!packages || packages.length === 0) && (
              <Card className="col-span-full">
                <CardContent className="py-12 text-center">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground/50" />
                  <p className="mt-3 text-muted-foreground text-sm">No packages yet — create your first template</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* TAB 2: Active Purchases */}
        <TabsContent value="purchases">
          <Card>
            <CardContent className="p-0">
              {purchases && purchases.length > 0 ? (
                <div className="divide-y">
                  {purchases.map((p: any) => {
                    const pct = p.sessions_total > 0 ? (p.sessions_used / p.sessions_total) * 100 : 0;
                    const daysLeft = p.expires_at ? differenceInDays(parseISO(p.expires_at), new Date()) : null;
                    const atRisk = p.status === "active" && daysLeft !== null && daysLeft < 30 && pct < 50;

                    return (
                      <div key={p.id} className={`p-4 ${atRisk ? "bg-destructive/5" : ""}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {(p as any).patients?.first_name} {(p as any).patients?.last_name}
                            </span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground">{(p as any).service_packages?.name}</span>
                            {atRisk && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge className={`text-[10px] ${statusColor(p.status)}`}>{p.status}</Badge>
                            {p.status === "active" && (
                              <>
                                <Button size="sm" variant="ghost" className="h-7 text-xs"
                                  onClick={() => redeemSession.mutate({ purchaseId: p.id, treatmentName: (p as any).service_packages?.name || "Session" })}>
                                  <CheckCircle className="h-3 w-3 mr-1" /> Redeem
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs"
                                  onClick={() => updatePurchaseStatus.mutate({ id: p.id, status: "paused" })}>
                                  <Pause className="h-3 w-3 mr-1" /> Pause
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                                  onClick={() => updatePurchaseStatus.mutate({ id: p.id, status: "cancelled" })}>
                                  <XCircle className="h-3 w-3 mr-1" /> Cancel
                                </Button>
                              </>
                            )}
                            {p.status === "paused" && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs"
                                onClick={() => updatePurchaseStatus.mutate({ id: p.id, status: "active" })}>
                                <Play className="h-3 w-3 mr-1" /> Resume
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex-1"><Progress value={pct} className="h-2" /></div>
                          <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">{p.sessions_used}/{p.sessions_total}</span>
                          {daysLeft !== null && (
                            <span className={`text-xs whitespace-nowrap ${daysLeft < 7 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              <Clock className="h-3 w-3 inline mr-0.5" />{daysLeft}d
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            <DollarSign className="h-3 w-3 inline" />{p.deferred_revenue_amount?.toFixed(0)} def
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground/50" />
                  <p className="mt-3 text-muted-foreground text-sm">No purchases yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: Notification Rules */}
        <TabsContent value="notifications">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {rules?.map((rule: any) => (
                  <div key={rule.id} className="flex items-center justify-between p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{rule.trigger_label}</p>
                        <Badge variant="outline" className="text-[10px] capitalize">{rule.channel}</Badge>
                        <Badge variant="outline" className="text-[10px] capitalize">{rule.tone}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => previewNotification(rule.id)}>
                        <Eye className="h-3 w-3 mr-1" /> Preview
                      </Button>
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, is_active: checked })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
