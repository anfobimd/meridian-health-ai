import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Shield, Brain, Users, Activity, DollarSign } from "lucide-react";

export default function MdOversightDashboard() {
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

  const totalCalls = apiStats?.length || 0;
  const successCalls = apiStats?.filter((c: any) => c.status === "success").length || 0;
  const avgLatency = totalCalls ? Math.round((apiStats?.reduce((s: number, c: any) => s + (c.latency_ms || 0), 0) || 0) / totalCalls) : 0;

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
          { label: "Total Reviews", value: reviewStats?.total || 0, icon: Activity },
          { label: "Approved", value: reviewStats?.approved || 0, icon: Shield },
          { label: "Corrections", value: reviewStats?.corrected || 0, icon: Brain },
          { label: "Avg Review Time", value: `${reviewStats?.avgTime || 0}s`, icon: Activity },
          { label: "Rubber Stamps", value: reviewStats?.rubberStamps || 0, icon: Activity },
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="reports"><Brain className="h-3 w-3 mr-1" /> AI Reports</TabsTrigger>
          <TabsTrigger value="md"><Shield className="h-3 w-3 mr-1" /> MD Performance</TabsTrigger>
          <TabsTrigger value="providers"><Users className="h-3 w-3 mr-1" /> Providers</TabsTrigger>
          <TabsTrigger value="system"><DollarSign className="h-3 w-3 mr-1" /> System</TabsTrigger>
        </TabsList>

        {/* Tab 1: AI Intelligence Reports */}
        <TabsContent value="reports" className="space-y-4">
          {reportsLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : reports?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No AI reports generated yet. Reports are generated monthly when sufficient review data exists.
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providerIntel?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
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
                          <Badge variant={p.coaching_status === "none" ? "secondary" : "outline"} className={p.coaching_status !== "none" ? "border-orange-300 text-orange-600" : ""}>
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
      </Tabs>
    </div>
  );
}
