import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Loader2, Clock, DollarSign, Syringe, TrendingUp, TrendingDown,
  Download, BarChart3, FileCheck, Sparkles, Activity, Brain, AlertTriangle
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { toast } from "sonner";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export default function ProviderPerformanceDashboard() {
  const { user } = useAuth();
  const [aiCoaching, setAiCoaching] = useState<any>(null);
  const [loadingCoaching, setLoadingCoaching] = useState(false);

  const { data: provider, isLoading: provLoading } = useQuery({
    queryKey: ["my-provider", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name, credentials").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const providerId = provider?.id;

  const { data: earnings } = useQuery({
    queryKey: ["perf-earnings", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const sixAgo = subMonths(new Date(), 6).toISOString();
      const { data } = await supabase.from("provider_earnings").select("*, treatments(name)").eq("provider_id", providerId!).gte("service_date", sixAgo).order("service_date", { ascending: false }).limit(500);
      return data ?? [];
    },
  });

  const { data: appointments } = useQuery({
    queryKey: ["perf-appts", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const sixAgo = subMonths(new Date(), 6).toISOString();
      const { data } = await supabase.from("appointments").select("id, status, scheduled_at, duration_minutes, treatments(name)").eq("provider_id", providerId!).gte("scheduled_at", sixAgo);
      return data ?? [];
    },
  });

  const { data: chartStats } = useQuery({
    queryKey: ["perf-charts", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data } = await supabase.from("chart_review_records").select("status, created_at").eq("provider_id", providerId!);
      const total = data?.length ?? 0;
      const approved = data?.filter((r: any) => r.status === "approved").length ?? 0;
      const corrected = data?.filter((r: any) => r.status === "corrected").length ?? 0;
      const pending = data?.filter((r: any) => ["pending_ai", "pending_review"].includes(r.status)).length ?? 0;
      return { total, approved, corrected, pending, approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0 };
    },
  });

  // AI provider intelligence
  const { data: providerIntel } = useQuery({
    queryKey: ["perf-intel", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data } = await supabase.from("ai_provider_intelligence").select("*").eq("provider_id", providerId!).maybeSingle();
      return data;
    },
  });

  const kpis = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const monthEarnings = (earnings ?? []).filter((e: any) => e.service_date && new Date(e.service_date) >= monthStart);
    const weekEarnings = (earnings ?? []).filter((e: any) => e.service_date && new Date(e.service_date) >= weekStart);
    const totalRevenue = monthEarnings.reduce((s: number, e: any) => s + (e.net_revenue || 0), 0);
    const totalMinutes = monthEarnings.reduce((s: number, e: any) => s + (e.time_minutes || 0), 0);
    const totalHours = totalMinutes / 60;
    const effectiveRate = totalHours > 0 ? totalRevenue / totalHours : 0;
    const prevMonthStart = startOfMonth(subMonths(now, 1));
    const prevMonthEnd = endOfMonth(subMonths(now, 1));
    const prevEarnings = (earnings ?? []).filter((e: any) => { const d = new Date(e.service_date); return d >= prevMonthStart && d <= prevMonthEnd; });
    const prevRevenue = prevEarnings.reduce((s: number, e: any) => s + (e.net_revenue || 0), 0);
    const revenueDelta = prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100) : 0;
    return { totalRevenue, totalHours, effectiveRate, proceduresThisMonth: monthEarnings.length, proceduresThisWeek: weekEarnings.length, revenueDelta };
  }, [earnings]);

  const revenueTrend = useMemo(() => {
    const months: Record<string, { month: string; revenue: number; procedures: number }> = {};
    for (let i = 5; i >= 0; i--) { const d = subMonths(new Date(), i); const key = format(d, "yyyy-MM"); months[key] = { month: format(d, "MMM"), revenue: 0, procedures: 0 }; }
    (earnings ?? []).forEach((e: any) => { const key = (e.service_date || "").substring(0, 7); if (months[key]) { months[key].revenue += e.net_revenue || 0; months[key].procedures += 1; } });
    return Object.values(months);
  }, [earnings]);

  const procedureBreakdown = useMemo(() => {
    const map: Record<string, { name: string; count: number; revenue: number; minutes: number }> = {};
    (earnings ?? []).forEach((e: any) => { const name = (e.treatments as any)?.name || e.modality || "Other"; if (!map[name]) map[name] = { name, count: 0, revenue: 0, minutes: 0 }; map[name].count += 1; map[name].revenue += e.net_revenue || 0; map[name].minutes += e.time_minutes || 0; });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [earnings]);

  const weeklyHours = useMemo(() => {
    const weeks: { week: string; hours: number }[] = [];
    for (let i = 5; i >= 0; i--) { const wStart = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 }); const wEnd = endOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 }); const mins = (earnings ?? []).filter((e: any) => { const d = new Date(e.service_date); return d >= wStart && d <= wEnd; }).reduce((s: number, e: any) => s + (e.time_minutes || 0), 0); weeks.push({ week: format(wStart, "MMM d"), hours: parseFloat((mins / 60).toFixed(1)) }); }
    return weeks;
  }, [earnings]);

  // AI coaching summary
  const runCoachingSummary = async () => {
    if (!providerId) return;
    setLoadingCoaching(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-provider-coach", {
        body: {
          mode: "coaching_summary",
          provider_id: providerId,
          data: {
            provider_name: `${provider?.first_name} ${provider?.last_name}`,
            chart_stats: chartStats,
            intel: providerIntel,
            kpis,
            procedure_breakdown: procedureBreakdown.slice(0, 5),
            revenue_trend: revenueTrend,
          },
        },
      });
      if (error) throw error;
      setAiCoaching(data);
    } catch { toast.error("Failed to generate coaching summary"); }
    setLoadingCoaching(false);
  };

  const exportCSV = () => {
    if (!earnings?.length) return;
    const rows = [["Date", "Procedure", "Gross", "Net", "Minutes"]];
    earnings.forEach((e: any) => { rows.push([e.service_date?.substring(0, 10) || "", (e.treatments as any)?.name || "", e.gross_revenue || 0, e.net_revenue || 0, e.time_minutes || 0]); });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `performance_${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (provLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!provider) return (<div className="space-y-4"><h1 className="text-2xl font-semibold">My Performance</h1><Card><CardContent className="py-12 text-center text-muted-foreground">No provider record linked to your account.</CardContent></Card></div>);

  const TrendArrow = ({ value }: { value: number }) => {
    if (value > 0) return <span className="flex items-center text-xs text-emerald-600"><TrendingUp className="h-3 w-3 mr-0.5" />+{value}%</span>;
    if (value < 0) return <span className="flex items-center text-xs text-destructive"><TrendingDown className="h-3 w-3 mr-0.5" />{value}%</span>;
    return <span className="text-xs text-muted-foreground">—</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Performance</h1>
          <p className="text-sm text-muted-foreground">{provider.first_name} {provider.last_name}{provider.credentials ? `, ${provider.credentials}` : ""} — Last 6 months</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={runCoachingSummary} disabled={loadingCoaching}>
            {loadingCoaching ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Brain className="h-4 w-4 mr-1.5" />} AI Coaching
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1.5" /> Export CSV</Button>
        </div>
      </div>

      {/* AI Coaching Summary */}
      {aiCoaching && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />AI Coaching Summary for 1:1</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiCoaching.narrative && <p className="text-sm text-muted-foreground">{aiCoaching.narrative}</p>}
            {aiCoaching.strengths?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-success mb-1">Strengths</p>
                {aiCoaching.strengths.map((s: string, i: number) => <p key={i} className="text-xs text-muted-foreground">✓ {s}</p>)}
              </div>
            )}
            {aiCoaching.areas_for_improvement?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-warning mb-1">Areas for Improvement</p>
                {aiCoaching.areas_for_improvement.map((s: string, i: number) => <p key={i} className="text-xs text-muted-foreground">• {s}</p>)}
              </div>
            )}
            {aiCoaching.action_items?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-primary mb-1">Action Items</p>
                {aiCoaching.action_items.map((s: string, i: number) => <p key={i} className="text-xs text-muted-foreground">→ {s}</p>)}
              </div>
            )}
            {providerIntel && (
              <div className="flex gap-3 mt-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">Correction Rate: {((providerIntel.correction_rate || 0) * 100).toFixed(1)}%</Badge>
                <Badge variant="outline" className="text-[10px]">Coaching Status: {providerIntel.coaching_status || "none"}</Badge>
                <Badge variant="outline" className="text-[10px]">Total Charts: {providerIntel.total_charts || 0}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="p-4"><p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Revenue MTD</p><p className="text-xl font-bold font-mono mt-1">${kpis.totalRevenue.toLocaleString()}</p><TrendArrow value={kpis.revenueDelta} /></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Eff. $/hr</p><p className="text-xl font-bold font-mono mt-1">${kpis.effectiveRate.toFixed(0)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Hours MTD</p><p className="text-xl font-bold font-mono mt-1">{kpis.totalHours.toFixed(1)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Procedures MTD</p><p className="text-xl font-bold mt-1">{kpis.proceduresThisMonth}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">This Week</p><p className="text-xl font-bold mt-1">{kpis.proceduresThisWeek}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Chart Approval</p><p className="text-xl font-bold mt-1">{chartStats?.approvalRate ?? 0}%</p><Progress value={chartStats?.approvalRate ?? 0} className="h-1 mt-1.5" /></CardContent></Card>
      </div>

      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="revenue"><DollarSign className="h-3.5 w-3.5 mr-1" />Revenue</TabsTrigger>
          <TabsTrigger value="procedures"><Syringe className="h-3.5 w-3.5 mr-1" />Procedures</TabsTrigger>
          <TabsTrigger value="hours"><Clock className="h-3.5 w-3.5 mr-1" />Hours</TabsTrigger>
          <TabsTrigger value="charts"><FileCheck className="h-3.5 w-3.5 mr-1" />Charts</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Revenue Trend (6 Months)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} /><Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, "Revenue"]} /><Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="procedures" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Procedures by Month</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={revenueTrend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="procedures" name="Procedures" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} /></BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Procedure Mix</CardTitle></CardHeader>
              <CardContent>
                {procedureBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart><Pie data={procedureBreakdown.slice(0, 5)} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>{procedureBreakdown.slice(0, 5).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip /></PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-center text-sm text-muted-foreground py-8">No data</p>}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Breakdown by Procedure</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Procedure</TableHead><TableHead className="text-right">Sessions</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Hours</TableHead><TableHead className="text-right">$/hr</TableHead></TableRow></TableHeader>
                <TableBody>
                  {procedureBreakdown.length > 0 ? procedureBreakdown.map((r) => (
                    <TableRow key={r.name}><TableCell className="font-medium">{r.name}</TableCell><TableCell className="text-right">{r.count}</TableCell><TableCell className="text-right font-mono">${r.revenue.toLocaleString()}</TableCell><TableCell className="text-right font-mono">{(r.minutes / 60).toFixed(1)}</TableCell><TableCell className="text-right font-mono text-primary">${r.minutes > 0 ? (r.revenue / (r.minutes / 60)).toFixed(0) : 0}</TableCell></TableRow>
                  )) : <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No data</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hours" className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Weekly Hours (6 Weeks)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={weeklyHours}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number) => [`${v} hrs`, "Hours"]} /><Bar dataKey="hours" name="Hours" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="charts" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-4 text-center"><p className="text-[11px] font-medium text-muted-foreground uppercase">Total Reviewed</p><p className="text-2xl font-bold mt-1">{chartStats?.total ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-[11px] font-medium text-muted-foreground uppercase">Approved</p><p className="text-2xl font-bold mt-1 text-emerald-600">{chartStats?.approved ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-[11px] font-medium text-muted-foreground uppercase">Corrected</p><p className={`text-2xl font-bold mt-1 ${(chartStats?.corrected ?? 0) > 0 ? "text-amber-600" : ""}`}>{chartStats?.corrected ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-[11px] font-medium text-muted-foreground uppercase">Pending</p><p className="text-2xl font-bold mt-1">{chartStats?.pending ?? 0}</p></CardContent></Card>
          </div>
          <Card>
            <CardContent className="py-8 text-center">
              <Activity className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Chart quality trends are computed from your MD review history.</p>
              <p className="text-xs text-muted-foreground mt-1">Approval rate: <span className="font-bold">{chartStats?.approvalRate ?? 0}%</span></p>
              {providerIntel?.correction_rate != null && (
                <p className="text-xs mt-1">
                  <Badge variant={providerIntel.correction_rate > 0.15 ? "destructive" : "outline"} className="text-[10px]">
                    Correction rate: {(providerIntel.correction_rate * 100).toFixed(1)}%
                  </Badge>
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
