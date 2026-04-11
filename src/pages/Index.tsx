import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users, Calendar, DollarSign, TrendingUp, Clock, AlertTriangle, CheckCircle2,
  FileText, ShieldCheck, Package, Sparkles, Loader2, ChevronRight,
  Activity, Stethoscope, ArrowRight, Bell, BarChart3, Zap, UserCheck,
} from "lucide-react";
import { format, parseISO, isToday, startOfMonth, endOfMonth, subMonths, subDays, getISOWeek } from "date-fns";
import { toast } from "sonner";

export default function Dashboard() {
  const navigate = useNavigate();
  const [aiBriefing, setAiBriefing] = useState<any>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [weeklyInsights, setWeeklyInsights] = useState<any>(() => {
    try {
      const cached = localStorage.getItem("weekly_insights_cache");
      if (cached) {
        const { data, week, ts } = JSON.parse(cached);
        const now = Date.now();
        const currentWeek = getISOWeek(new Date());
        if (week === currentWeek && now - ts < 4 * 3600 * 1000) return data;
      }
    } catch {}
    return null;
  });
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  // --- Data Queries ---

  const { data: patientCount } = useQuery({
    queryKey: ["dash-patients"],
    queryFn: async () => {
      const { count } = await supabase.from("patients").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: todayApts } = useQuery({
    queryKey: ["dash-today-apts"],
    queryFn: async () => {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
      const { data } = await supabase
        .from("appointments")
        .select("id, status, scheduled_at, checked_in_at, patients(first_name, last_name), providers(first_name, last_name), treatments(name)")
        .gte("scheduled_at", start)
        .lt("scheduled_at", end)
        .order("scheduled_at", { ascending: true });
      return data ?? [];
    },
  });

  const { data: providerCount } = useQuery({
    queryKey: ["dash-providers"],
    queryFn: async () => {
      const { count } = await supabase.from("providers").select("*", { count: "exact", head: true }).eq("is_active", true);
      return count ?? 0;
    },
  });

  // Monthly revenue (invoices paid this month)
  const { data: monthRevenue } = useQuery({
    queryKey: ["dash-month-revenue"],
    queryFn: async () => {
      const start = startOfMonth(new Date()).toISOString();
      const end = endOfMonth(new Date()).toISOString();
      const { data } = await supabase
        .from("invoices")
        .select("total")
        .eq("status", "paid")
        .gte("created_at", start)
        .lte("created_at", end);
      return data?.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0) ?? 0;
    },
  });

  // Last month revenue for comparison
  const { data: lastMonthRevenue } = useQuery({
    queryKey: ["dash-last-month-revenue"],
    queryFn: async () => {
      const lastMonth = subMonths(new Date(), 1);
      const start = startOfMonth(lastMonth).toISOString();
      const end = endOfMonth(lastMonth).toISOString();
      const { data } = await supabase
        .from("invoices")
        .select("total")
        .eq("status", "paid")
        .gte("created_at", start)
        .lte("created_at", end);
      return data?.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0) ?? 0;
    },
  });

  // Alerts: unsigned notes
  const { data: unsignedNotes } = useQuery({
    queryKey: ["dash-unsigned-notes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clinical_notes")
        .select("id, patients(first_name, last_name), created_at")
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  // Alerts: pending chart reviews
  const { data: pendingReviews } = useQuery({
    queryKey: ["dash-pending-reviews"],
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_review_records")
        .select("id, ai_risk_tier, patients(first_name, last_name), created_at")
        .in("status", ["pending_ai", "pending_md"])
        .order("ai_priority_score", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  // Alerts: pending hormone approvals
  const { data: pendingApprovals } = useQuery({
    queryKey: ["dash-pending-approvals"],
    queryFn: async () => {
      const { data } = await supabase
        .from("hormone_visits")
        .select("id, patients(first_name, last_name), visit_date")
        .eq("approval_status", "pending")
        .order("visit_date", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  // At-risk packages
  const { data: atRiskPackages } = useQuery({
    queryKey: ["dash-at-risk-packages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_package_purchases")
        .select("id, sessions_used, sessions_total, expires_at, patients(first_name, last_name), service_packages(name)")
        .eq("status", "active")
        .not("expires_at", "is", null)
        .order("expires_at", { ascending: true })
        .limit(10);
      // Filter to those expiring within 30 days or >50% unused
      const now = new Date();
      return (data ?? []).filter((p: any) => {
        const daysLeft = p.expires_at ? Math.ceil((new Date(p.expires_at).getTime() - now.getTime()) / 86400000) : 999;
        const usageRate = p.sessions_total > 0 ? p.sessions_used / p.sessions_total : 1;
        return daysLeft <= 30 || (daysLeft <= 60 && usageRate < 0.5);
      });
    },
  });

  // Overdue invoices
  const { data: overdueInvoices } = useQuery({
    queryKey: ["dash-overdue-invoices"],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, total, balance_due, due_date, patients(first_name, last_name)")
        .in("status", ["sent", "overdue"])
        .lt("due_date", new Date().toISOString())
        .order("due_date", { ascending: true })
        .limit(10);
      return data ?? [];
    },
  });

  // Provider utilization (last 30 days)
  const { data: providerUtilization } = useQuery({
    queryKey: ["dash-provider-utilization"],
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const { data: apts } = await supabase
        .from("appointments")
        .select("provider_id, status, duration_minutes, providers(first_name, last_name, credentials)")
        .gte("scheduled_at", thirtyDaysAgo)
        .not("provider_id", "is", null);
      if (!apts) return [];

      const byProvider: Record<string, { name: string; total: number; completed: number; totalMinutes: number }> = {};
      apts.forEach((a: any) => {
        if (!a.provider_id) return;
        if (!byProvider[a.provider_id]) {
          byProvider[a.provider_id] = {
            name: `${a.providers?.first_name || ""} ${a.providers?.last_name || ""}`,
            total: 0, completed: 0, totalMinutes: 0,
          };
        }
        byProvider[a.provider_id].total += 1;
        if (a.status === "completed") {
          byProvider[a.provider_id].completed += 1;
          byProvider[a.provider_id].totalMinutes += (a.duration_minutes || 30);
        }
      });
      return Object.entries(byProvider)
        .map(([id, v]) => ({
          id, name: v.name,
          total: v.total, completed: v.completed,
          utilization: v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0,
          hours: Math.round(v.totalMinutes / 60),
        }))
        .sort((a, b) => b.utilization - a.utilization);
    },
  });

  // Procedure mix (last 30 days)
  const { data: procedureMix } = useQuery({
    queryKey: ["dash-procedure-mix"],
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const { data } = await supabase
        .from("appointments")
        .select("treatment_id, treatments(name, category)")
        .eq("status", "completed")
        .gte("scheduled_at", thirtyDaysAgo)
        .not("treatment_id", "is", null);
      if (!data) return [];

      const byTreatment: Record<string, { name: string; category: string; count: number }> = {};
      data.forEach((a: any) => {
        const tid = a.treatment_id;
        if (!byTreatment[tid]) {
          byTreatment[tid] = { name: a.treatments?.name || "Unknown", category: a.treatments?.category || "—", count: 0 };
        }
        byTreatment[tid].count += 1;
      });
      return Object.values(byTreatment).sort((a, b) => b.count - a.count).slice(0, 10);
    },
  });

  // --- AI Daily Briefing ---
  const loadBriefing = async () => {
    setBriefingLoading(true);
    try {
      const briefingData = {
        today_appointments: todayApts?.length ?? 0,
        completed: todayApts?.filter((a: any) => a.status === "completed").length ?? 0,
        waiting: todayApts?.filter((a: any) => a.status === "checked_in").length ?? 0,
        unsigned_notes: unsignedNotes?.length ?? 0,
        pending_reviews: pendingReviews?.length ?? 0,
        pending_approvals: pendingApprovals?.length ?? 0,
        at_risk_packages: atRiskPackages?.length ?? 0,
        overdue_invoices: overdueInvoices?.length ?? 0,
        month_revenue: monthRevenue ?? 0,
        last_month_revenue: lastMonthRevenue ?? 0,
        active_providers: providerCount ?? 0,
        total_patients: patientCount ?? 0,
      };

      const { data, error } = await supabase.functions.invoke("ai-financial-advisor", {
        body: { mode: "daily_briefing", metrics: briefingData },
      });
      if (error) throw error;
      setAiBriefing(data);
    } catch {
      toast.error("Failed to load AI briefing");
    } finally {
      setBriefingLoading(false);
    }
  };

  // --- AI Weekly Insights ---
  const loadWeeklyInsights = async () => {
    setWeeklyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-financial-advisor", {
        body: { mode: "weekly_insights" },
      });
      if (error) throw error;
      setWeeklyInsights(data);
      localStorage.setItem("weekly_insights_cache", JSON.stringify({
        data, week: getISOWeek(new Date()), ts: Date.now(),
      }));
    } catch {
      toast.error("Failed to generate weekly insights");
    } finally {
      setWeeklyLoading(false);
    }
  };

  const todayTotal = todayApts?.length ?? 0;
  const todayCompleted = todayApts?.filter((a: any) => a.status === "completed").length ?? 0;
  const todayCapacity = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;
  const revenueGrowth = lastMonthRevenue && lastMonthRevenue > 0
    ? Math.round(((monthRevenue ?? 0) - lastMonthRevenue) / lastMonthRevenue * 100)
    : 0;

  const totalAlerts = (unsignedNotes?.length ?? 0) + (pendingReviews?.length ?? 0) + (pendingApprovals?.length ?? 0) + (atRiskPackages?.length ?? 0) + (overdueInvoices?.length ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Command Center</h1>
          <p className="text-muted-foreground text-sm">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/front-desk")}>
            <Activity className="h-3.5 w-3.5 mr-1.5" />Front Desk
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/provider-day")}>
            <Stethoscope className="h-3.5 w-3.5 mr-1.5" />My Day
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Today's Patients</p>
                <p className="text-2xl font-bold mt-1">{todayTotal}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <Progress value={todayCapacity} className="h-1.5 w-16" />
                  <span className="text-[10px] text-muted-foreground">{todayCapacity}% done</span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">MTD Revenue</p>
                <p className="text-2xl font-bold mt-1">${(monthRevenue ?? 0).toLocaleString()}</p>
                <p className={`text-[10px] mt-1 ${revenueGrowth >= 0 ? "text-success" : "text-destructive"}`}>
                  {revenueGrowth >= 0 ? "↑" : "↓"} {Math.abs(revenueGrowth)}% vs last month
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Active Patients</p>
                <p className="text-2xl font-bold mt-1">{patientCount ?? 0}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{providerCount} providers</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-info" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={totalAlerts > 0 ? "border-warning/30" : ""}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Action Items</p>
                <p className="text-2xl font-bold mt-1">{totalAlerts}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Requires attention</p>
              </div>
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${totalAlerts > 0 ? "bg-warning/10" : "bg-muted"}`}>
                <Bell className={`h-5 w-5 ${totalAlerts > 0 ? "text-warning" : "text-muted-foreground"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Daily Briefing */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">AI Daily Briefing</p>
                <p className="text-[10px] text-muted-foreground">Powered by AI analysis of today's data</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={loadBriefing} disabled={briefingLoading}>
              {briefingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
              {aiBriefing ? "Refresh" : "Generate Briefing"}
            </Button>
          </div>
          {aiBriefing ? (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed">{aiBriefing.narrative || aiBriefing.summary}</p>
              {aiBriefing.priorities && aiBriefing.priorities.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Priorities</p>
                  {aiBriefing.priorities.map((p: string, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-xs font-bold text-primary mt-0.5">{i + 1}.</span>
                      <p className="text-xs text-foreground">{p}</p>
                    </div>
                  ))}
                </div>
              )}
              {aiBriefing.alerts && aiBriefing.alerts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {aiBriefing.alerts.map((a: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px] border-warning/30 text-warning">{a}</Badge>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Click "Generate Briefing" for an AI-powered summary of what needs your attention today.</p>
          )}
        </CardContent>
      </Card>

      {/* AI Weekly Insights */}
      <Card className="border-accent/20 bg-gradient-to-r from-accent/5 to-transparent">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">AI Weekly Insights</p>
                <p className="text-[10px] text-muted-foreground">7-day performance summary with week-over-week trends</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={loadWeeklyInsights} disabled={weeklyLoading}>
              {weeklyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <TrendingUp className="h-3.5 w-3.5 mr-1" />}
              {weeklyInsights ? "Refresh" : "Generate Insights"}
            </Button>
          </div>
          {weeklyInsights ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed">{weeklyInsights.narrative}</p>

              {/* KPI Highlights */}
              {weeklyInsights.kpi_highlights && weeklyInsights.kpi_highlights.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {weeklyInsights.kpi_highlights.map((kpi: any, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs py-1 px-2.5 gap-1">
                      {kpi.trend === "up" ? "↑" : kpi.trend === "down" ? "↓" : "→"} {kpi.label}: {kpi.value}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Weekly Action */}
              {weeklyInsights.weekly_action && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">⚡ This Week's Action</p>
                  <p className="text-sm">{weeklyInsights.weekly_action}</p>
                </div>
              )}

              {/* Trends Table */}
              {weeklyInsights.trends && weeklyInsights.trends.length > 0 && (
                <div className="rounded border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 font-medium text-muted-foreground">Metric</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">This Week</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Last Week</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeklyInsights.trends.map((t: any, i: number) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="p-2">{t.metric}</td>
                          <td className="p-2 text-right font-mono">{t.this_week}</td>
                          <td className="p-2 text-right font-mono text-muted-foreground">{t.last_week}</td>
                          <td className={`p-2 text-right font-mono ${String(t.change_pct).startsWith("+") ? "text-success" : String(t.change_pct).startsWith("-") ? "text-destructive" : ""}`}>
                            {t.change_pct}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Click "Generate Insights" for an AI-powered weekly performance summary with trends and recommendations.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts Panel (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Unsigned Notes */}
          {(unsignedNotes?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-warning" />
                    Unsigned Notes ({unsignedNotes?.length})
                  </span>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/clinical-notes")}>
                    View All <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="space-y-1.5">
                  {unsignedNotes?.slice(0, 4).map((note: any) => (
                    <div key={note.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                      <span>{note.patients?.first_name} {note.patients?.last_name}</span>
                      <span className="text-xs text-muted-foreground">{format(parseISO(note.created_at), "MMM d")}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pending Reviews */}
          {(pendingReviews?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-destructive" />
                    Pending Chart Reviews ({pendingReviews?.length})
                  </span>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/md-oversight")}>
                    Review <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="space-y-1.5">
                  {pendingReviews?.slice(0, 4).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                      <span>{r.patients?.first_name} {r.patients?.last_name}</span>
                      <Badge variant="outline" className={`text-[10px] ${r.ai_risk_tier === "critical" ? "border-destructive text-destructive" : r.ai_risk_tier === "high" ? "border-warning text-warning" : ""}`}>
                        {r.ai_risk_tier || "pending"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pending Hormone Approvals */}
          {(pendingApprovals?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-violet" />
                    Pending Hormone Approvals ({pendingApprovals?.length})
                  </span>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/physician-approval")}>
                    Approve <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="space-y-1.5">
                  {pendingApprovals?.slice(0, 4).map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                      <span>{a.patients?.first_name} {a.patients?.last_name}</span>
                      <span className="text-xs text-muted-foreground">{format(parseISO(a.visit_date), "MMM d")}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* At-Risk Packages */}
          {(atRiskPackages?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-coral" />
                    At-Risk Packages ({atRiskPackages?.length})
                  </span>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/packages")}>
                    Manage <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="space-y-1.5">
                  {atRiskPackages?.slice(0, 4).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                      <div>
                        <span>{p.patients?.first_name} {p.patients?.last_name}</span>
                        <span className="text-xs text-muted-foreground ml-1.5">— {p.service_packages?.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{p.sessions_used}/{p.sessions_total} used</span>
                        {p.expires_at && (
                          <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                            Exp {format(parseISO(p.expires_at), "MMM d")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Overdue Invoices */}
          {(overdueInvoices?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-destructive" />
                    Overdue Invoices ({overdueInvoices?.length})
                  </span>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/billing")}>
                    Billing <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="space-y-1.5">
                  {overdueInvoices?.slice(0, 4).map((inv: any) => (
                    <div key={inv.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                      <span>{inv.patients?.first_name} {inv.patients?.last_name}</span>
                      <span className="text-xs font-mono text-destructive">${(inv.balance_due || inv.total || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {totalAlerts === 0 && (
            <Card className="border-success/20 bg-success/5">
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="h-10 w-10 mx-auto text-success" />
                <p className="mt-3 font-medium text-success">All Clear</p>
                <p className="text-xs text-muted-foreground mt-1">No pending items require attention</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Today's Schedule (1 col) */}
        <div>
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Today's Schedule
                </span>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/front-desk")}>
                  Queue <ChevronRight className="h-3 w-3 ml-0.5" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {todayApts && todayApts.length > 0 ? (
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                  {todayApts.map((apt: any) => {
                    const statusBg: Record<string, string> = {
                      booked: "border-l-primary",
                      checked_in: "border-l-warning",
                      roomed: "border-l-info",
                      in_progress: "border-l-accent",
                      completed: "border-l-success",
                      no_show: "border-l-destructive",
                    };
                    return (
                      <div key={apt.id} className={`flex items-center justify-between p-2 rounded bg-muted/30 border-l-2 ${statusBg[apt.status] || "border-l-muted"}`}>
                        <div>
                          <p className="text-xs font-medium">{apt.patients?.first_name} {apt.patients?.last_name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {format(parseISO(apt.scheduled_at), "h:mm a")} · {apt.treatments?.name || "General"}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[9px] h-5">
                          {apt.status === "in_progress" ? "active" : apt.status.replace("_", " ")}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-6 text-center">No appointments today</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Productivity Section */}
      <Separator />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Provider Utilization */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              Provider Utilization (30d)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {providerUtilization && providerUtilization.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Utilization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providerUtilization.slice(0, 8).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-xs">{p.name}</TableCell>
                      <TableCell className="text-xs">{p.completed}/{p.total}</TableCell>
                      <TableCell className="text-xs font-mono">{p.hours}h</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={p.utilization} className="h-1.5 w-16" />
                          <span className="text-[10px] font-mono">{p.utilization}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">No appointment data</p>
            )}
          </CardContent>
        </Card>

        {/* Procedure Mix */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              Procedure Mix (30d)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {procedureMix && procedureMix.length > 0 ? (
              <div className="space-y-2">
                {procedureMix.map((p: any, i: number) => {
                  const maxCount = procedureMix[0]?.count || 1;
                  const pct = Math.round((p.count / maxCount) * 100);
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-32 truncate text-xs font-medium">{p.name}</div>
                      <div className="flex-1">
                        <div className="h-5 bg-muted rounded-sm overflow-hidden">
                          <div className="h-full bg-primary/20 rounded-sm flex items-center px-2" style={{ width: `${pct}%` }}>
                            <span className="text-[10px] font-mono text-foreground">{p.count}</span>
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[9px]">{p.category}</Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">No completed procedures</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
