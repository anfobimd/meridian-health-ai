import { useState, useEffect } from "react";
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
  AlertCircle, Target, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, subMonths, subDays } from "date-fns";
import { toast } from "sonner";

/* ─── Dashboard sub-components ─── */

function KpiCard({ label, value, sub, icon: Icon, color = "primary", alert }: {
  label: string; value: string | number; sub?: React.ReactNode; icon: any; color?: string; alert?: boolean;
}) {
  return (
    <Card className={alert ? "border-warning/30" : ""}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <div className="mt-1">{sub}</div>}
          </div>
          <div className={`h-10 w-10 rounded-lg bg-${color}/10 flex items-center justify-center`}>
            <Icon className={`h-5 w-5 text-${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionItemRow({ item, onNav }: { item: any; onNav: (route: string) => void }) {
  const urgencyStyles: Record<string, string> = {
    critical: "border-destructive/40 bg-destructive/5",
    high: "border-warning/40 bg-warning/5",
    medium: "border-info/30 bg-info/5",
    low: "border-border bg-muted/30",
  };
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${urgencyStyles[item.urgency] || urgencyStyles.low}`}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Badge variant="outline" className={`text-[9px] shrink-0 ${
          item.urgency === "critical" ? "border-destructive text-destructive" :
          item.urgency === "high" ? "border-warning text-warning" :
          "border-muted-foreground text-muted-foreground"
        }`}>{item.urgency}</Badge>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{item.title}</p>
          <p className="text-xs text-muted-foreground truncate">{item.detail}</p>
        </div>
      </div>
      <Button size="sm" variant={item.urgency === "critical" ? "destructive" : "outline"} className="ml-2 shrink-0 text-xs h-7" onClick={() => onNav(item.route)}>
        {item.action_label} <ChevronRight className="h-3 w-3 ml-0.5" />
      </Button>
    </div>
  );
}

/* ─── Main Dashboard ─── */
export default function Dashboard() {
  const navigate = useNavigate();
  const [aiBriefing, setAiBriefing] = useState<any>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [actionItems, setActionItems] = useState<any>(null);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [revForecast, setRevForecast] = useState<any>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  // ─── Data Queries ───
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
        .gte("scheduled_at", start).lt("scheduled_at", end)
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

  const { data: monthRevenue } = useQuery({
    queryKey: ["dash-month-revenue"],
    queryFn: async () => {
      const start = startOfMonth(new Date()).toISOString();
      const end = endOfMonth(new Date()).toISOString();
      const { data } = await supabase.from("invoices").select("total").eq("status", "paid").gte("created_at", start).lte("created_at", end);
      return data?.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0) ?? 0;
    },
  });

  const { data: lastMonthRevenue } = useQuery({
    queryKey: ["dash-last-month-revenue"],
    queryFn: async () => {
      const lm = subMonths(new Date(), 1);
      const start = startOfMonth(lm).toISOString();
      const end = endOfMonth(lm).toISOString();
      const { data } = await supabase.from("invoices").select("total").eq("status", "paid").gte("created_at", start).lte("created_at", end);
      return data?.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0) ?? 0;
    },
  });

  const { data: unsignedNotes } = useQuery({
    queryKey: ["dash-unsigned-notes"],
    queryFn: async () => {
      const { data } = await supabase.from("clinical_notes").select("id, patients(first_name, last_name), created_at").eq("status", "draft").order("created_at", { ascending: false }).limit(10);
      return data ?? [];
    },
  });

  const { data: pendingReviews } = useQuery({
    queryKey: ["dash-pending-reviews"],
    queryFn: async () => {
      const { data } = await supabase.from("chart_review_records").select("id, ai_risk_tier, patients(first_name, last_name), created_at").in("status", ["pending_ai", "pending_md"]).order("ai_priority_score", { ascending: false }).limit(10);
      return data ?? [];
    },
  });

  const { data: pendingApprovals } = useQuery({
    queryKey: ["dash-pending-approvals"],
    queryFn: async () => {
      const { data } = await supabase.from("hormone_visits").select("id, patients(first_name, last_name), visit_date").eq("approval_status", "pending").order("visit_date", { ascending: false }).limit(10);
      return data ?? [];
    },
  });

  const { data: atRiskPackages } = useQuery({
    queryKey: ["dash-at-risk-packages"],
    queryFn: async () => {
      const { data } = await supabase.from("patient_package_purchases").select("id, sessions_used, sessions_total, expires_at, patients(first_name, last_name), service_packages(name)").eq("status", "active").not("expires_at", "is", null).order("expires_at", { ascending: true }).limit(10);
      const now = new Date();
      return (data ?? []).filter((p: any) => {
        const daysLeft = p.expires_at ? Math.ceil((new Date(p.expires_at).getTime() - now.getTime()) / 86400000) : 999;
        const usageRate = p.sessions_total > 0 ? p.sessions_used / p.sessions_total : 1;
        return daysLeft <= 30 || (daysLeft <= 60 && usageRate < 0.5);
      });
    },
  });

  const { data: overdueInvoices } = useQuery({
    queryKey: ["dash-overdue-invoices"],
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("id, total, balance_due, due_date, patients(first_name, last_name)").in("status", ["sent", "overdue"]).lt("due_date", new Date().toISOString()).order("due_date", { ascending: true }).limit(10);
      return data ?? [];
    },
  });

  const { data: providerUtilization } = useQuery({
    queryKey: ["dash-provider-utilization"],
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const { data: apts } = await supabase.from("appointments").select("provider_id, status, duration_minutes, providers(first_name, last_name, credentials)").gte("scheduled_at", thirtyDaysAgo).not("provider_id", "is", null);
      if (!apts) return [];
      const byProvider: Record<string, { name: string; total: number; completed: number; totalMinutes: number }> = {};
      apts.forEach((a: any) => {
        if (!a.provider_id) return;
        if (!byProvider[a.provider_id]) byProvider[a.provider_id] = { name: `${a.providers?.first_name || ""} ${a.providers?.last_name || ""}`, total: 0, completed: 0, totalMinutes: 0 };
        byProvider[a.provider_id].total += 1;
        if (a.status === "completed") { byProvider[a.provider_id].completed += 1; byProvider[a.provider_id].totalMinutes += (a.duration_minutes || 30); }
      });
      return Object.entries(byProvider).map(([id, v]) => ({ id, name: v.name, total: v.total, completed: v.completed, utilization: v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0, hours: Math.round(v.totalMinutes / 60) })).sort((a, b) => b.utilization - a.utilization);
    },
  });

  // Compliance queries
  const { data: expiringContracts } = useQuery({
    queryKey: ["dash-expiring-contracts"],
    queryFn: async () => {
      const futureDate = new Date(Date.now() + 30 * 86400000).toISOString();
      const { data } = await supabase.from("contracts").select("id, name, end_date").eq("status", "active").not("end_date", "is", null).lte("end_date", futureDate).limit(5);
      return data ?? [];
    },
  });

  const { data: coachingProviders } = useQuery({
    queryKey: ["dash-coaching-providers"],
    queryFn: async () => {
      const { data } = await supabase.from("ai_provider_intelligence").select("provider_id, correction_rate, coaching_status, providers(first_name, last_name)").in("coaching_status", ["monitoring", "probation"]).limit(5);
      return data ?? [];
    },
  });

  // ─── AI Calls ───
  const loadBriefing = async () => {
    setBriefingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-clinic-briefing", {
        body: {
          mode: "daily_brief",
          metrics: {
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
          },
        },
      });
      if (error) throw error;
      setAiBriefing(data);
      // Also set revenue forecast if included
      if (data?.revenue_forecast) setRevForecast(data.revenue_forecast);
    } catch {
      toast.error("Failed to load AI briefing");
    } finally {
      setBriefingLoading(false);
    }
  };

  const loadActionItems = async () => {
    setActionsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-clinic-briefing", {
        body: { mode: "action_items" },
      });
      if (error) throw error;
      setActionItems(data);
    } catch {
      toast.error("Failed to load action items");
    } finally {
      setActionsLoading(false);
    }
  };

  const loadForecast = async () => {
    setForecastLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-clinic-briefing", {
        body: { mode: "revenue_forecast" },
      });
      if (error) throw error;
      setRevForecast(data);
    } catch {
      toast.error("Failed to generate forecast");
    } finally {
      setForecastLoading(false);
    }
  };

  // Auto-load briefing on mount when data is ready
  const dataReady = todayApts !== undefined && monthRevenue !== undefined;
  useEffect(() => {
    if (dataReady && !aiBriefing && !briefingLoading) {
      loadBriefing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady]);

  const todayTotal = todayApts?.length ?? 0;
  const todayCompleted = todayApts?.filter((a: any) => a.status === "completed").length ?? 0;
  const todayCapacity = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;
  const revenueGrowth = lastMonthRevenue && lastMonthRevenue > 0 ? Math.round(((monthRevenue ?? 0) - lastMonthRevenue) / lastMonthRevenue * 100) : 0;
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
          <Button size="sm" onClick={() => navigate("/appointments")}>
            <Calendar className="h-3.5 w-3.5 mr-1.5" />Book Appointment
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/front-desk")}>
            <Activity className="h-3.5 w-3.5 mr-1.5" />Front Desk
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Today's Patients" value={todayTotal} icon={Calendar} color="primary"
          sub={<div className="flex items-center gap-1.5"><Progress value={todayCapacity} className="h-1.5 w-16" /><span className="text-[10px] text-muted-foreground">{todayCapacity}% done</span></div>} />
        <KpiCard label="MTD Revenue" value={`$${(monthRevenue ?? 0).toLocaleString()}`} icon={DollarSign} color="success"
          sub={<p className={`text-[10px] ${revenueGrowth >= 0 ? "text-success" : "text-destructive"}`}>{revenueGrowth >= 0 ? "↑" : "↓"} {Math.abs(revenueGrowth)}% vs last month</p>} />
        <KpiCard label="Active Patients" value={patientCount ?? 0} icon={Users} color="info"
          sub={<p className="text-[10px] text-muted-foreground">{providerCount} providers active</p>} />
        <KpiCard label="Action Items" value={totalAlerts} icon={Bell} color={totalAlerts > 0 ? "warning" : "muted-foreground"} alert={totalAlerts > 0}
          sub={<p className="text-[10px] text-muted-foreground">Requires attention</p>} />
      </div>

      {/* AI Briefing — Auto-loaded */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">AI Clinic Briefing</p>
                <p className="text-[10px] text-muted-foreground">Auto-generated from live clinic data</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={loadBriefing} disabled={briefingLoading} className="text-xs">
              {briefingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "↻ Refresh"}
            </Button>
          </div>
          {briefingLoading && !aiBriefing ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing clinic data…
            </div>
          ) : aiBriefing ? (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed">{aiBriefing.narrative}</p>
              {aiBriefing.priorities?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Top Priorities</p>
                  {aiBriefing.priorities.map((p: string, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <Target className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                      <p className="text-xs">{p}</p>
                    </div>
                  ))}
                </div>
              )}
              {aiBriefing.alerts?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {aiBriefing.alerts.map((a: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px] border-warning/30 text-warning">
                      <AlertCircle className="h-2.5 w-2.5 mr-1" />{a}
                    </Badge>
                  ))}
                </div>
              )}
              {/* Provider flags */}
              {aiBriefing.provider_flags?.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Provider Alerts</p>
                  {aiBriefing.provider_flags.map((pf: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-warning/5 border border-warning/20 text-xs">
                      <span className="font-medium">{pf.name}: <span className="text-muted-foreground">{pf.issue}</span></span>
                      <span className="text-primary text-[10px]">{pf.action}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Briefing will load automatically…</p>
          )}
        </CardContent>
      </Card>

      {/* Revenue Forecast + Compliance Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Forecast */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-success" />
                Revenue Forecast
              </span>
              <Button size="sm" variant="ghost" className="text-xs h-7" onClick={loadForecast} disabled={forecastLoading}>
                {forecastLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                {revForecast ? "Refresh" : "Predict"}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {revForecast ? (
              <div className="space-y-3">
                <div className="flex items-baseline gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Predicted EOM</p>
                    <p className="text-2xl font-bold">${revForecast.predicted_eom?.toLocaleString()}</p>
                  </div>
                  <Badge variant="outline" className={`text-xs ${
                    revForecast.trend === "growing" ? "border-success text-success" :
                    revForecast.trend === "declining" ? "border-destructive text-destructive" : "border-muted-foreground"
                  }`}>
                    {revForecast.trend === "growing" ? <ArrowUpRight className="h-3 w-3 mr-1" /> : revForecast.trend === "declining" ? <ArrowDownRight className="h-3 w-3 mr-1" /> : null}
                    {revForecast.trend} · {revForecast.confidence} confidence
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{revForecast.commentary}</p>
                {revForecast.risk_factors?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {revForecast.risk_factors.map((r: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">⚠ {r}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-4">Click "Predict" for AI-powered end-of-month revenue forecast.</p>
            )}
          </CardContent>
        </Card>

        {/* Compliance Alerts */}
        <Card className={(expiringContracts?.length || coachingProviders?.length) ? "border-warning/20" : ""}>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-3">
            {expiringContracts && expiringContracts.length > 0 ? (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Expiring Contracts</p>
                {expiringContracts.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-1.5 text-xs">
                    <span className="truncate">{c.name}</span>
                    <Badge variant="outline" className="text-[9px] border-destructive/30 text-destructive shrink-0">
                      {c.end_date ? format(parseISO(c.end_date), "MMM d") : "—"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
            {coachingProviders && coachingProviders.length > 0 ? (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Coaching Needed</p>
                {coachingProviders.map((cp: any) => (
                  <div key={cp.provider_id} className="flex items-center justify-between p-1.5 text-xs">
                    <span>{cp.providers?.first_name} {cp.providers?.last_name}</span>
                    <Badge variant={cp.coaching_status === "probation" ? "destructive" : "secondary"} className="text-[9px]">
                      {cp.coaching_status} · {Math.round((cp.correction_rate || 0) * 100)}%
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
            {!expiringContracts?.length && !coachingProviders?.length && (
              <div className="py-4 text-center">
                <CheckCircle2 className="h-6 w-6 mx-auto text-success" />
                <p className="text-xs text-muted-foreground mt-1">All clear</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Action Items */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              AI Action Items
            </span>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={loadActionItems} disabled={actionsLoading}>
              {actionsLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
              {actionItems ? "Refresh" : "Analyze"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {actionItems?.items?.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">{actionItems.summary}</p>
              {actionItems.items.slice(0, 8).map((item: any, i: number) => (
                <ActionItemRow key={i} item={item} onNav={(route) => navigate(route)} />
              ))}
            </div>
          ) : !actionsLoading ? (
            <div className="space-y-3">
              {/* Fallback: show raw action items */}
              {(pendingReviews?.length ?? 0) > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-warning/20 bg-warning/5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-warning" />
                    <span className="text-sm">{pendingReviews?.length} pending chart reviews</span>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate("/md-oversight")}>
                    Review <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </div>
              )}
              {(unsignedNotes?.length ?? 0) > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{unsignedNotes?.length} unsigned notes</span>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate("/clinical-notes")}>
                    Sign <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </div>
              )}
              {(pendingApprovals?.length ?? 0) > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{pendingApprovals?.length} pending approvals</span>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate("/physician-approval")}>
                    Approve <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </div>
              )}
              {(atRiskPackages?.length ?? 0) > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{atRiskPackages?.length} at-risk packages</span>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate("/packages")}>
                    Manage <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </div>
              )}
              {(overdueInvoices?.length ?? 0) > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-destructive/20 bg-destructive/5">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-destructive" />
                    <span className="text-sm">{overdueInvoices?.length} overdue invoices</span>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate("/billing")}>
                    Billing <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </div>
              )}
              {totalAlerts === 0 && (
                <div className="py-4 text-center">
                  <CheckCircle2 className="h-8 w-8 mx-auto text-success" />
                  <p className="mt-2 text-sm font-medium text-success">All Clear</p>
                  <p className="text-xs text-muted-foreground">No pending items</p>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground text-center">Click "Analyze" for AI-prioritized action items with urgency ranking</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Analyzing action items…
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Schedule */}
        <div className="lg:col-span-2">
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
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                  {todayApts.map((apt: any) => {
                    const statusColors: Record<string, string> = {
                      booked: "border-l-primary", checked_in: "border-l-warning", roomed: "border-l-info",
                      in_progress: "border-l-accent", completed: "border-l-success", no_show: "border-l-destructive",
                    };
                    return (
                      <div key={apt.id} className={`flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border-l-2 ${statusColors[apt.status] || "border-l-muted"}`}>
                        <div>
                          <p className="text-xs font-medium">{apt.patients?.first_name} {apt.patients?.last_name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {format(parseISO(apt.scheduled_at), "h:mm a")} · {apt.treatments?.name || "General"}
                            {apt.providers && <span> · {apt.providers.first_name} {apt.providers.last_name}</span>}
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

        {/* Provider Scoreboard */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-primary" />
                Provider Scoreboard
              </span>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/providers")}>
                All <ChevronRight className="h-3 w-3 ml-0.5" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {providerUtilization && providerUtilization.length > 0 ? (
              <div className="space-y-2">
                {providerUtilization.slice(0, 6).map((p: any) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="w-20 text-xs font-medium truncate">{p.name.split(" ")[0]}</div>
                    <Progress value={p.utilization} className="h-1.5 flex-1" />
                    <span className="text-[10px] font-mono w-8 text-right">{p.utilization}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate("/patients")}>
              <Users className="h-3.5 w-3.5 mr-1.5" />Patients
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate("/calendar-grid")}>
              <Calendar className="h-3.5 w-3.5 mr-1.5" />Calendar
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate("/md-oversight")}>
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />Chart Review
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate("/reports")}>
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />Reports
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate("/waitlist")}>
              <Stethoscope className="h-3.5 w-3.5 mr-1.5" />Waitlist
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate("/treatments")}>
              <Stethoscope className="h-3.5 w-3.5 mr-1.5" />Treatments
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
