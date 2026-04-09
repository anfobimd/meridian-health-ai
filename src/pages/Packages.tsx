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
import { Package, Plus, Percent, Clock, DollarSign, CheckCircle, AlertTriangle, Pause, Sparkles } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";

export default function Packages() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newPkg, setNewPkg] = useState({ name: "", description: "", package_type: "single", session_count: 6, price: 0, individual_price: 0, valid_days: 365, category: "" });

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

  const { data: treatments } = useQuery({
    queryKey: ["treatments-list"],
    queryFn: async () => {
      const { data } = await supabase.from("treatments").select("id, name, price").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const createPackage = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("service_packages").insert({
        name: newPkg.name,
        description: newPkg.description || null,
        package_type: newPkg.package_type,
        session_count: newPkg.session_count,
        price: newPkg.price,
        individual_price: newPkg.individual_price || null,
        valid_days: newPkg.valid_days,
        category: newPkg.category || null,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif">Service Packages</h1>
          <p className="text-muted-foreground text-sm">Create, sell, and track pre-paid treatment bundles</p>
        </div>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Package Templates ({packages?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="purchases">Active Purchases ({purchases?.filter((p: any) => p.status === "active").length ?? 0})</TabsTrigger>
          <TabsTrigger value="notifications">Notification Rules ({rules?.length ?? 0})</TabsTrigger>
        </TabsList>

        {/* TAB 1: Package Templates */}
        <TabsContent value="templates">
          <div className="flex justify-end mb-4">
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
                    <Badge variant="secondary" className="text-[10px] capitalize">{pkg.package_type}</Badge>
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
                          <div className="flex items-center gap-2">
                            <Badge className={`text-[10px] ${statusColor(p.status)}`}>{p.status}</Badge>
                            {p.status === "active" && (
                              <>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updatePurchaseStatus.mutate({ id: p.id, status: "paused" })}>
                                  <Pause className="h-3 w-3 mr-1" /> Pause
                                </Button>
                              </>
                            )}
                            {p.status === "paused" && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updatePurchaseStatus.mutate({ id: p.id, status: "active" })}>
                                Resume
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <Progress value={pct} className="h-2" />
                          </div>
                          <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                            {p.sessions_used}/{p.sessions_total} sessions
                          </span>
                          {daysLeft !== null && (
                            <span className={`text-xs whitespace-nowrap ${daysLeft < 7 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              <Clock className="h-3 w-3 inline mr-0.5" />{daysLeft}d left
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            <DollarSign className="h-3 w-3 inline" />{p.deferred_revenue_amount?.toFixed(0)} deferred
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
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, is_active: checked })}
                    />
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
