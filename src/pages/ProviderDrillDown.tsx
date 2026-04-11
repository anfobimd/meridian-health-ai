import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { UserCheck, TrendingUp, Clock, DollarSign, Calendar, Download, BarChart3 } from "lucide-react";
import { format, parseISO, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

export default function ProviderDrillDown() {
  const [selectedProvider, setSelectedProvider] = useState<string>("");

  const { data: providers } = useQuery({
    queryKey: ["drilldown-providers"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name, credentials, specialty").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  // 6-month appointment trends
  const { data: monthlyTrends } = useQuery({
    queryKey: ["provider-trends", selectedProvider],
    enabled: !!selectedProvider,
    queryFn: async () => {
      const sixMonthsAgo = subMonths(new Date(), 6).toISOString();
      const { data } = await supabase
        .from("appointments")
        .select("id, status, scheduled_at, duration_minutes, treatments(name)")
        .eq("provider_id", selectedProvider)
        .gte("scheduled_at", sixMonthsAgo);
      if (!data) return [];

      const byMonth: Record<string, { month: string; booked: number; completed: number; cancelled: number; noShow: number; minutes: number }> = {};
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(new Date(), i);
        const key = format(d, "yyyy-MM");
        byMonth[key] = { month: format(d, "MMM yyyy"), booked: 0, completed: 0, cancelled: 0, noShow: 0, minutes: 0 };
      }
      data.forEach((a: any) => {
        const key = (a.scheduled_at || "").substring(0, 7);
        if (!byMonth[key]) return;
        byMonth[key].booked += 1;
        if (a.status === "completed") { byMonth[key].completed += 1; byMonth[key].minutes += a.duration_minutes || 30; }
        else if (a.status === "cancelled") byMonth[key].cancelled += 1;
        else if (a.status === "no_show") byMonth[key].noShow += 1;
      });
      return Object.values(byMonth);
    },
  });

  // Schedule fill rate (this month)
  const { data: fillRate } = useQuery({
    queryKey: ["provider-fill-rate", selectedProvider],
    enabled: !!selectedProvider,
    queryFn: async () => {
      const start = startOfMonth(new Date()).toISOString();
      const end = endOfMonth(new Date()).toISOString();
      const { data } = await supabase
        .from("appointments")
        .select("id, status")
        .eq("provider_id", selectedProvider)
        .gte("scheduled_at", start)
        .lte("scheduled_at", end);
      if (!data) return { total: 0, filled: 0, rate: 0 };
      const filled = data.filter((a: any) => !["cancelled"].includes(a.status)).length;
      return { total: data.length, filled, rate: data.length > 0 ? Math.round((filled / data.length) * 100) : 0 };
    },
  });

  // Earnings data
  const { data: earningsData } = useQuery({
    queryKey: ["provider-earnings-detail", selectedProvider],
    enabled: !!selectedProvider,
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_earnings")
        .select("*, treatments(name)")
        .eq("provider_id", selectedProvider)
        .order("service_date", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  // Chart review stats
  const { data: chartStats } = useQuery({
    queryKey: ["provider-chart-stats", selectedProvider],
    enabled: !!selectedProvider,
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_review_records")
        .select("status, md_action")
        .eq("provider_id", selectedProvider);
      if (!data) return { total: 0, approved: 0, corrected: 0, correctionRate: 0 };
      const approved = data.filter((r: any) => r.status === "approved").length;
      const corrected = data.filter((r: any) => r.status === "corrected").length;
      return { total: data.length, approved, corrected, correctionRate: data.length > 0 ? Math.round((corrected / data.length) * 100) : 0 };
    },
  });

  const provider = providers?.find((p: any) => p.id === selectedProvider);
  const totalNet = earningsData?.reduce((s: number, e: any) => s + (e.net_revenue || 0), 0) ?? 0;
  const totalHours = (earningsData?.reduce((s: number, e: any) => s + (e.time_minutes || 0), 0) ?? 0) / 60;
  const effectiveRate = totalHours > 0 ? totalNet / totalHours : 0;

  // By procedure breakdown
  const byProcedure = (earningsData ?? []).reduce((acc: Record<string, any>, e: any) => {
    const name = e.treatments?.name || e.modality || "Other";
    if (!acc[name]) acc[name] = { name, sessions: 0, gross: 0, net: 0, minutes: 0 };
    acc[name].sessions += 1;
    acc[name].gross += e.gross_revenue || 0;
    acc[name].net += e.net_revenue || 0;
    acc[name].minutes += e.time_minutes || 0;
    return acc;
  }, {});
  const procedureRows = Object.values(byProcedure).sort((a: any, b: any) => b.net - a.net);

  const exportCSV = () => {
    if (!earningsData || earningsData.length === 0) return;
    const headers = ["Date", "Procedure", "Gross", "Net", "Minutes"];
    const rows = earningsData.map((e: any) => [
      e.service_date?.substring(0, 10) || "", e.treatments?.name || e.modality || "", e.gross_revenue || 0, e.net_revenue || 0, e.time_minutes || 0,
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `provider_${provider?.last_name || "report"}_earnings.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Provider Performance</h1>
          <p className="text-muted-foreground">Individual drill-down with trends, fill rate & export</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedProvider} onValueChange={setSelectedProvider}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select provider" /></SelectTrigger>
            <SelectContent>
              {providers?.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name}{p.credentials ? `, ${p.credentials}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedProvider && (
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          )}
        </div>
      </div>

      {!selectedProvider ? (
        <Card><CardContent className="py-16 text-center"><UserCheck className="h-12 w-12 mx-auto text-muted-foreground/40" /><p className="mt-4 text-muted-foreground">Select a provider to view detailed metrics</p></CardContent></Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card><CardContent className="p-5">
              <p className="text-xs text-muted-foreground font-medium uppercase">Net Revenue</p>
              <p className="text-2xl font-bold mt-1 font-mono">${totalNet.toLocaleString()}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-xs text-muted-foreground font-medium uppercase">Eff. $/hr</p>
              <p className="text-2xl font-bold mt-1 font-mono">${effectiveRate.toFixed(0)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-xs text-muted-foreground font-medium uppercase">Fill Rate (MTD)</p>
              <p className="text-2xl font-bold mt-1">{fillRate?.rate ?? 0}%</p>
              <Progress value={fillRate?.rate ?? 0} className="h-1.5 mt-2" />
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-xs text-muted-foreground font-medium uppercase">Sessions</p>
              <p className="text-2xl font-bold mt-1">{earningsData?.length ?? 0}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-xs text-muted-foreground font-medium uppercase">Correction Rate</p>
              <p className={`text-2xl font-bold mt-1 ${(chartStats?.correctionRate ?? 0) > 15 ? "text-destructive" : ""}`}>
                {chartStats?.correctionRate ?? 0}%
              </p>
            </CardContent></Card>
          </div>

          {/* 6-Month Trend */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> 6-Month Appointment Trends</CardTitle></CardHeader>
            <CardContent>
              {monthlyTrends && monthlyTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="completed" name="Completed" fill="hsl(var(--primary))" stackId="a" />
                    <Bar dataKey="cancelled" name="Cancelled" fill="hsl(var(--destructive))" stackId="a" />
                    <Bar dataKey="noShow" name="No-Show" fill="hsl(var(--muted-foreground))" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">No data available</p>
              )}
            </CardContent>
          </Card>

          {/* Procedure Breakdown */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Revenue by Procedure</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Procedure</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Gross</TableHead>
                    <TableHead>Net</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>$/hr</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {procedureRows.length > 0 ? procedureRows.map((r: any) => (
                    <TableRow key={r.name}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.sessions}</TableCell>
                      <TableCell className="font-mono">${r.gross.toLocaleString()}</TableCell>
                      <TableCell className="font-mono font-bold">${r.net.toLocaleString()}</TableCell>
                      <TableCell className="font-mono">{(r.minutes / 60).toFixed(1)}</TableCell>
                      <TableCell className="font-mono text-primary">${r.minutes > 0 ? (r.net / (r.minutes / 60)).toFixed(0) : 0}/hr</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No earnings recorded</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
