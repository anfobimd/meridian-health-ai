import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Shield, Brain, Users, Activity, DollarSign, Settings, Loader2, UserCog, Plus, Building2 } from "lucide-react";
import { toast } from "sonner";

export default function MdOversightDashboard() {
  const { user } = useAuth();
  const [coachingProviderId, setCoachingProviderId] = useState<string | null>(null);
  const [filterClinic, setFilterClinic] = useState("all");
  const queryClient = useQueryClient();

  // ── MD's assigned clinics with pending counts ──
  const { data: assignedClinics = [] } = useQuery({
    queryKey: ["md-dashboard-clinics", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: provider } = await supabase.from("providers").select("id").eq("user_id", user.id).single();
      if (!provider) return [];
      const { data: assignments } = await supabase
        .from("md_coverage_assignments")
        .select("clinic_id, is_primary, clinics(id, name, city, state, contract_id, contracts(name))")
        .eq("md_provider_id", provider.id);
      if (!assignments?.length) return [];
      // Get pending chart counts per clinic
      const clinicIds = assignments.map((a: any) => a.clinic_id);
      const { data: pendingCharts } = await supabase
        .from("chart_review_records")
        .select("encounters!inner(clinic_id)")
        .in("status", ["pending_review", "pending_ai"])
        .in("encounters.clinic_id", clinicIds);
      const countMap: Record<string, number> = {};
      pendingCharts?.forEach((r: any) => {
        const cid = r.encounters?.clinic_id;
        if (cid) countMap[cid] = (countMap[cid] || 0) + 1;
      });
      return assignments.map((a: any) => ({
        id: a.clinic_id,
        name: a.clinics?.name,
        city: a.clinics?.city,
        state: a.clinics?.state,
        contractName: a.clinics?.contracts?.name,
        isPrimary: a.is_primary,
        pendingCharts: countMap[a.clinic_id] || 0,
      }));
    },
    enabled: !!user?.id,
  });

  // Fetch oversight reports
  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ["oversight-reports"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_oversight_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  // Fetch MD consistency metrics
  const { data: mdMetrics } = useQuery({
    queryKey: ["md-consistency"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_md_consistency")
        .select("*, providers(first_name, last_name, credentials)")
        .order("month", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  // Fetch provider intelligence
  const { data: providerIntel } = useQuery({
    queryKey: ["provider-intelligence-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_provider_intelligence")
        .select("*, providers(first_name, last_name, credentials, specialty)")
        .order("correction_rate", { ascending: false });
      return data || [];
    },
  });

  // Fetch API call stats
  const { data: apiStats } = useQuery({
    queryKey: ["api-call-stats"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_api_calls")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  // Fetch review summary stats
  const { data: reviewStats } = useQuery({
    queryKey: ["review-stats"],
    queryFn: async () => {
      const { data: all } = await supabase.from("chart_review_records").select("status, ai_risk_tier, review_duration_seconds, md_action, rubber_stamp_threshold_seconds");
      if (!all) return { total: 0, approved: 0, corrected: 0, pending: 0, avgTime: 0, rubberStamps: 0 };
      const approved = all.filter((r) => r.status === "approved").length;
      const corrected = all.filter((r) => r.status === "corrected").length;
      const pending = all.filter((r) => ["pending_review", "pending_ai"].includes(r.status)).length;
      const reviewed = all.filter((r) => r.review_duration_seconds);
      const avgTime = reviewed.length ? Math.round(reviewed.reduce((s, r) => s + (r.review_duration_seconds || 0), 0) / reviewed.length) : 0;
      const rubberStamps = reviewed.filter((r) => (r.review_duration_seconds || 0) < (r.rubber_stamp_threshold_seconds || 30) && r.md_action === "approve").length;
      return { total: all.length, approved, corrected, pending, avgTime, rubberStamps };
    },
  });

  // Fetch oversight config
  const { data: configData } = useQuery({
    queryKey: ["oversight-config"],
    queryFn: async () => {
      const { data } = await supabase.from("oversight_config").select("*").order("config_key");
      return data || [];
    },
  });

  // Fetch coaching actions for selected provider
  const { data: coachingActions } = useQuery({
    queryKey: ["coaching-actions", coachingProviderId],
    queryFn: async () => {
      if (!coachingProviderId) return [];
      const { data } = await supabase
        .from("coaching_actions")
        .select("*")
        .eq("provider_id", coachingProviderId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!coachingProviderId,
  });

  // Generate monthly report mutation
  const generateReportMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-monthly-report", {
        body: {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Monthly report generated");
      queryClient.invalidateQueries({ queryKey: ["oversight-reports"] });
    },
    onError: (e) => toast.error(e.message),
  });

  // Run AI coaching analysis
  const coachProviderMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const { data, error } = await supabase.functions.invoke("ai-provider-coach", {
        body: { provider_id: providerId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Coaching analysis complete");
      queryClient.invalidateQueries({ queryKey: ["coaching-actions", coachingProviderId] });
      queryClient.invalidateQueries({ queryKey: ["provider-intelligence-all"] });
    },
    onError: (e) => toast.error(e.message),
  });

  // Update config mutation
  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const parsed = JSON.parse(value);
      const { error } = await supabase.from("oversight_config").update({ config_value: parsed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Config updated");
      queryClient.invalidateQueries({ queryKey: ["oversight-config"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const totalCalls = apiStats?.length || 0;
  const successCalls = apiStats?.filter((c: any) => c.status === "success").length || 0;
  const avgLatency = totalCalls ? Math.round((apiStats?.reduce((s: number, c: any) => s + (c.latency_ms || 0), 0) || 0) / totalCalls) : 0;

  const selectedProviderIntel = providerIntel?.find((p: any) => p.provider_id === coachingProviderId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-semibold flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" /> Oversight Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Super-admin view of AI intelligence, MD performance, and system health</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Reviews", value: reviewStats?.total || 0 },
          { label: "Approved", value: reviewStats?.approved || 0 },
          { label: "Corrections", value: reviewStats?.corrected || 0 },
          { label: "Avg Review Time", value: `${reviewStats?.avgTime || 0}s` },
          { label: "Rubber Stamps", value: reviewStats?.rubberStamps || 0 },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-[10px] uppercase text-muted-foreground font-bold">{stat.label}</p>
              <p className="text-2xl font-bold mt-1">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="reports">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="reports"><Brain className="h-3 w-3 mr-1" /> AI Reports</TabsTrigger>
          <TabsTrigger value="md"><Shield className="h-3 w-3 mr-1" /> MD Performance</TabsTrigger>
          <TabsTrigger value="providers"><Users className="h-3 w-3 mr-1" /> Providers</TabsTrigger>
          <TabsTrigger value="system"><DollarSign className="h-3 w-3 mr-1" /> System</TabsTrigger>
          <TabsTrigger value="config"><Settings className="h-3 w-3 mr-1" /> Config</TabsTrigger>
        </TabsList>

        {/* Tab 1: AI Intelligence Reports */}
        <TabsContent value="reports" className="space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => generateReportMutation.mutate()}
              disabled={generateReportMutation.isPending}
            >
              {generateReportMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Brain className="h-4 w-4 mr-1" />}
              Generate Report
            </Button>
          </div>
          {reportsLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : reports?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No AI reports generated yet. Click "Generate Report" to create one.
              </CardContent>
            </Card>
          ) : (
            reports?.map((report: any) => (
              <Card key={report.id}>
                <CardHeader>
                  <CardTitle className="text-sm">{new Date(report.report_month).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</CardTitle>
                  <CardDescription>{report.report_type}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {report.narrative && <p className="text-sm">{report.narrative}</p>}
                  {(report.highlights as any[])?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-primary mb-1">Highlights</p>
                      <ul className="text-sm list-disc pl-4 space-y-1">
                        {(report.highlights as any[]).map((h: string, i: number) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(report.alerts as any[])?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-red-600 mb-1">Alerts</p>
                      {(report.alerts as any[]).map((a: string, i: number) => (
                        <Badge key={i} variant="destructive" className="mr-1 mb-1">{a}</Badge>
                      ))}
                    </div>
                  )}
                  {(report.recommendations as any[])?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-primary mb-1">Recommendations</p>
                      <ul className="text-sm list-disc pl-4 space-y-1">
                        {(report.recommendations as any[]).map((r: string, i: number) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Tab 2: MD Performance */}
        <TabsContent value="md" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reviewer</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead>Reviews</TableHead>
                    <TableHead>Correction Rate</TableHead>
                    <TableHead>Avg Time</TableHead>
                    <TableHead>Rubber Stamps</TableHead>
                    <TableHead>Consistency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mdMetrics?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                        No MD performance data yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    mdMetrics?.map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">
                          {m.providers?.first_name} {m.providers?.last_name}{m.providers?.credentials ? `, ${m.providers.credentials}` : ""}
                        </TableCell>
                        <TableCell>{new Date(m.month).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</TableCell>
                        <TableCell>{m.total_reviews}</TableCell>
                        <TableCell>{((m.correction_rate || 0) * 100).toFixed(1)}%</TableCell>
                        <TableCell>{m.avg_review_seconds}s</TableCell>
                        <TableCell>
                          <Badge variant={m.rubber_stamp_count > 0 ? "destructive" : "secondary"}>
                            {m.rubber_stamp_count}
                          </Badge>
                        </TableCell>
                        <TableCell>{((m.consistency_score || 0) * 100).toFixed(0)}%</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Provider Intelligence */}
        <TabsContent value="providers" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Specialty</TableHead>
                    <TableHead>Total Charts</TableHead>
                    <TableHead>Correction Rate</TableHead>
                    <TableHead>Avg Doc Score</TableHead>
                    <TableHead>Coaching</TableHead>
                    <TableHead>Issues</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providerIntel?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                        No provider intelligence data yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    providerIntel?.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          {p.providers?.first_name} {p.providers?.last_name}{p.providers?.credentials ? `, ${p.providers.credentials}` : ""}
                        </TableCell>
                        <TableCell className="text-sm">{p.providers?.specialty || "—"}</TableCell>
                        <TableCell>{p.total_charts}</TableCell>
                        <TableCell>
                          <Badge variant={(p.correction_rate || 0) > 0.15 ? "destructive" : "secondary"}>
                            {((p.correction_rate || 0) * 100).toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell>{p.avg_documentation_score || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={p.coaching_status === "none" ? "secondary" : "outline"} className={p.coaching_status === "probation" ? "border-red-300 text-red-600" : p.coaching_status === "monitoring" ? "border-orange-300 text-orange-600" : ""}>
                            {p.coaching_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(p.recurring_issues as any[])?.length > 0 ? (
                            <div className="flex gap-1 flex-wrap">
                              {(p.recurring_issues as any[]).slice(0, 2).map((issue: string, i: number) => (
                                <Badge key={i} variant="outline" className="text-[10px]">{issue}</Badge>
                              ))}
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => setCoachingProviderId(p.provider_id)}>
                            <UserCog className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: System Intelligence */}
        <TabsContent value="system" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Total AI Calls</p>
                <p className="text-2xl font-bold mt-1">{totalCalls}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Success Rate</p>
                <p className="text-2xl font-bold mt-1">{totalCalls ? ((successCalls / totalCalls) * 100).toFixed(1) : 0}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Avg Latency</p>
                <p className="text-2xl font-bold mt-1">{avgLatency}ms</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Rubber Stamps</p>
                <p className="text-2xl font-bold mt-1">{reviewStats?.rubberStamps || 0}</p>
              </CardContent>
            </Card>
          </div>

          {apiStats && apiStats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recent AI Calls</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Function</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Latency</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiStats.slice(0, 20).map((call: any) => (
                      <TableRow key={call.id}>
                        <TableCell className="text-sm">{call.function_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{call.model_used || "—"}</TableCell>
                        <TableCell>{call.latency_ms}ms</TableCell>
                        <TableCell className="text-xs">{(call.input_tokens || 0) + (call.output_tokens || 0)}</TableCell>
                        <TableCell>
                          <Badge variant={call.status === "success" ? "default" : "destructive"}>
                            {call.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(call.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 5: Config */}
        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Settings className="h-4 w-4" /> Oversight Configuration</CardTitle>
              <CardDescription>Sampling rates, thresholds, and system settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {configData?.map((cfg: any) => (
                <div key={cfg.id} className="flex items-start gap-4 p-3 border rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{cfg.config_key.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{cfg.description}</p>
                    <Input
                      className="mt-2 font-mono text-xs"
                      defaultValue={JSON.stringify(cfg.config_value)}
                      onBlur={(e) => {
                        const newVal = e.target.value;
                        if (newVal !== JSON.stringify(cfg.config_value)) {
                          try {
                            JSON.parse(newVal);
                            updateConfigMutation.mutate({ id: cfg.id, value: newVal });
                          } catch {
                            toast.error("Invalid JSON");
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Coaching Drawer */}
      <Sheet open={!!coachingProviderId} onOpenChange={(o) => { if (!o) setCoachingProviderId(null); }}>
        <SheetContent className="w-[450px] sm:max-w-[450px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Provider Coaching — {selectedProviderIntel?.providers?.first_name} {selectedProviderIntel?.providers?.last_name}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {/* Provider Stats */}
            <div className="grid grid-cols-2 gap-2">
              <Card>
                <CardContent className="pt-3 pb-2">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold">Correction Rate</p>
                  <p className="text-lg font-bold">{((selectedProviderIntel?.correction_rate || 0) * 100).toFixed(1)}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-3 pb-2">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold">Status</p>
                  <Badge variant="outline" className={selectedProviderIntel?.coaching_status === "probation" ? "border-red-300 text-red-600 mt-1" : selectedProviderIntel?.coaching_status === "monitoring" ? "border-orange-300 text-orange-600 mt-1" : "mt-1"}>
                    {selectedProviderIntel?.coaching_status || "none"}
                  </Badge>
                </CardContent>
              </Card>
            </div>

            {/* Coaching Notes */}
            {selectedProviderIntel?.coaching_notes && (
              <Card>
                <CardContent className="pt-3 pb-2">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold mb-1">AI Coaching Summary</p>
                  <p className="text-sm">{selectedProviderIntel.coaching_notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Recurring Issues */}
            {(selectedProviderIntel?.recurring_issues as any[])?.length > 0 && (
              <div>
                <p className="text-xs font-bold mb-1">Recurring Issues</p>
                <div className="flex gap-1 flex-wrap">
                  {(selectedProviderIntel.recurring_issues as any[]).map((issue: string, i: number) => (
                    <Badge key={i} variant="outline">{issue}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Run AI Coaching */}
            <Button
              className="w-full"
              onClick={() => coachingProviderId && coachProviderMutation.mutate(coachingProviderId)}
              disabled={coachProviderMutation.isPending}
            >
              {coachProviderMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Brain className="h-4 w-4 mr-1" />}
              Run AI Coaching Analysis
            </Button>

            {/* Coaching Actions */}
            <div>
              <p className="text-xs font-bold mb-2">Coaching Actions</p>
              {coachingActions?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No coaching actions yet. Run AI analysis to generate recommendations.</p>
              ) : (
                <div className="space-y-2">
                  {coachingActions?.map((action: any) => (
                    <Card key={action.id} className={action.is_resolved ? "opacity-50" : ""}>
                      <CardContent className="pt-3 pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">{action.action_type}</Badge>
                              <span className="text-sm font-medium">{action.title}</span>
                            </div>
                            {action.description && <p className="text-xs text-muted-foreground mt-1">{action.description}</p>}
                          </div>
                          {action.is_resolved && <Badge variant="secondary" className="text-[10px]">Resolved</Badge>}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {action.created_by === "ai" ? "AI-generated" : "Manual"} • {new Date(action.created_at).toLocaleDateString()}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
