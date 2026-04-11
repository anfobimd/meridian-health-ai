import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Clock, DollarSign, Users, Calculator, Loader2 } from "lucide-react";
import { format, subDays, subMonths, startOfMonth, endOfMonth, parseISO, differenceInDays } from "date-fns";

type ReportType = "payroll" | "productivity" | "revenue";

export default function Reports() {
  const [reportType, setReportType] = useState<ReportType>("payroll");
  const [period, setPeriod] = useState("this_month");

  const getDateRange = () => {
    const now = new Date();
    switch (period) {
      case "last_month": return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
      case "last_30": return { start: subDays(now, 30), end: now };
      case "last_90": return { start: subDays(now, 90), end: now };
      default: return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const { start, end } = getDateRange();

  // Payroll: appointments per provider with hours
  const { data: payrollData, isLoading: payrollLoading } = useQuery({
    queryKey: ["report-payroll", period],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("provider_id, status, duration_minutes, scheduled_at, providers(first_name, last_name, credentials)")
        .gte("scheduled_at", start.toISOString())
        .lte("scheduled_at", end.toISOString())
        .eq("status", "completed")
        .not("provider_id", "is", null);
      if (!data) return [];

      const byProvider: Record<string, { name: string; appointments: number; totalMinutes: number }> = {};
      data.forEach((a: any) => {
        if (!a.provider_id) return;
        if (!byProvider[a.provider_id]) {
          byProvider[a.provider_id] = { name: `${a.providers?.first_name || ""} ${a.providers?.last_name || ""}`, appointments: 0, totalMinutes: 0 };
        }
        byProvider[a.provider_id].appointments += 1;
        byProvider[a.provider_id].totalMinutes += a.duration_minutes || 30;
      });
      return Object.entries(byProvider).map(([id, v]) => ({
        id, ...v, hours: (v.totalMinutes / 60).toFixed(1),
      })).sort((a, b) => b.appointments - a.appointments);
    },
  });

  // Productivity: utilization, no-shows, cancellations
  const { data: productivityData, isLoading: prodLoading } = useQuery({
    queryKey: ["report-productivity", period],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("provider_id, status, providers(first_name, last_name)")
        .gte("scheduled_at", start.toISOString())
        .lte("scheduled_at", end.toISOString())
        .not("provider_id", "is", null);
      if (!data) return [];

      const byProvider: Record<string, { name: string; total: number; completed: number; cancelled: number; noShow: number }> = {};
      data.forEach((a: any) => {
        if (!a.provider_id) return;
        if (!byProvider[a.provider_id]) {
          byProvider[a.provider_id] = { name: `${a.providers?.first_name || ""} ${a.providers?.last_name || ""}`, total: 0, completed: 0, cancelled: 0, noShow: 0 };
        }
        byProvider[a.provider_id].total += 1;
        if (a.status === "completed") byProvider[a.provider_id].completed += 1;
        else if (a.status === "cancelled") byProvider[a.provider_id].cancelled += 1;
        else if (a.status === "no_show") byProvider[a.provider_id].noShow += 1;
      });
      return Object.entries(byProvider).map(([id, v]) => ({
        id, ...v, utilization: v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0,
      })).sort((a, b) => b.utilization - a.utilization);
    },
  });

  // Revenue: invoices
  const { data: revenueData, isLoading: revLoading } = useQuery({
    queryKey: ["report-revenue", period],
    queryFn: async () => {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, status, total, amount_paid, balance_due, due_date, created_at, patients(first_name, last_name)")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false });
      if (!invoices) return { invoices: [], summary: { total: 0, paid: 0, outstanding: 0, overdue: 0 } };

      const now = new Date();
      const summary = invoices.reduce((acc, inv: any) => {
        acc.total += inv.total || 0;
        acc.paid += inv.amount_paid || 0;
        acc.outstanding += inv.balance_due || 0;
        if (inv.due_date && new Date(inv.due_date) < now && (inv.balance_due || 0) > 0) acc.overdue += inv.balance_due || 0;
        return acc;
      }, { total: 0, paid: 0, outstanding: 0, overdue: 0 });

      // A/R Aging
      const aging = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
      invoices.filter((i: any) => (i.balance_due || 0) > 0).forEach((inv: any) => {
        const days = inv.due_date ? differenceInDays(now, parseISO(inv.due_date)) : 0;
        if (days <= 0) aging.current += inv.balance_due || 0;
        else if (days <= 30) aging.d30 += inv.balance_due || 0;
        else if (days <= 60) aging.d60 += inv.balance_due || 0;
        else if (days <= 90) aging.d90 += inv.balance_due || 0;
        else aging.over90 += inv.balance_due || 0;
      });

      return { invoices, summary, aging };
    },
  });

  // Package revenue split
  const { data: packageRevenue } = useQuery({
    queryKey: ["report-package-revenue", period],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_package_purchases")
        .select("id, price_paid, revenue_recognized_amount, deferred_revenue_amount, status, service_packages(name)")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
      if (!data) return [];
      return data;
    },
  });

  const exportCSV = (headers: string[], rows: any[][], filename: string) => {
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPayroll = () => {
    if (!payrollData) return;
    exportCSV(
      ["Provider", "Appointments", "Hours"],
      payrollData.map(r => [r.name, r.appointments, r.hours]),
      `payroll_${period}_${format(new Date(), "yyyyMMdd")}.csv`
    );
  };

  const exportProductivity = () => {
    if (!productivityData) return;
    exportCSV(
      ["Provider", "Total", "Completed", "Cancelled", "No-Show", "Utilization %"],
      productivityData.map(r => [r.name, r.total, r.completed, r.cancelled, r.noShow, r.utilization]),
      `productivity_${period}_${format(new Date(), "yyyyMMdd")}.csv`
    );
  };

  const exportRevenue = () => {
    const inv = (revenueData as any)?.invoices;
    if (!inv) return;
    exportCSV(
      ["Patient", "Total", "Paid", "Balance", "Status", "Due Date"],
      inv.map((i: any) => [`${i.patients?.first_name || ""} ${i.patients?.last_name || ""}`, i.total || 0, i.amount_paid || 0, i.balance_due || 0, i.status, i.due_date || ""]),
      `revenue_${period}_${format(new Date(), "yyyyMMdd")}.csv`
    );
  };

  const periodLabel = period === "this_month" ? format(start, "MMMM yyyy") : period === "last_month" ? format(start, "MMMM yyyy") : period === "last_30" ? "Last 30 Days" : "Last 90 Days";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Report Generator</h1>
          <p className="text-muted-foreground">Payroll, productivity, and revenue reports with CSV export</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="last_30">Last 30 Days</SelectItem>
              <SelectItem value="last_90">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
        <TabsList>
          <TabsTrigger value="payroll"><Clock className="h-3.5 w-3.5 mr-1" /> Payroll Hours</TabsTrigger>
          <TabsTrigger value="productivity"><Users className="h-3.5 w-3.5 mr-1" /> Productivity</TabsTrigger>
          <TabsTrigger value="revenue"><DollarSign className="h-3.5 w-3.5 mr-1" /> Revenue & A/R</TabsTrigger>
        </TabsList>

        {/* Payroll */}
        <TabsContent value="payroll" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{periodLabel}</p>
            <Button variant="outline" size="sm" onClick={exportPayroll}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {payrollLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Completed Appointments</TableHead>
                      <TableHead>Total Hours</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollData && payrollData.length > 0 ? payrollData.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.appointments}</TableCell>
                        <TableCell className="font-mono">{r.hours}h</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={3} className="text-center py-12 text-muted-foreground">No data for this period</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Productivity */}
        <TabsContent value="productivity" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{periodLabel}</p>
            <Button variant="outline" size="sm" onClick={exportProductivity}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {prodLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Total Appts</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Cancelled</TableHead>
                      <TableHead>No-Shows</TableHead>
                      <TableHead>Utilization</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productivityData && productivityData.length > 0 ? productivityData.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.total}</TableCell>
                        <TableCell>{r.completed}</TableCell>
                        <TableCell>{r.cancelled}</TableCell>
                        <TableCell>{r.noShow}</TableCell>
                        <TableCell>
                          <Badge variant={r.utilization >= 80 ? "default" : r.utilization >= 60 ? "secondary" : "outline"} className={`text-[10px] ${r.utilization < 60 ? "border-warning text-warning" : ""}`}>
                            {r.utilization}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No data for this period</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Revenue & A/R */}
        <TabsContent value="revenue" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{periodLabel}</p>
            <Button variant="outline" size="sm" onClick={exportRevenue}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card><CardContent className="p-5">
              <p className="text-xs text-muted-foreground font-medium uppercase">Total Invoiced</p>
              <p className="text-2xl font-bold mt-1 font-mono">${((revenueData as any)?.summary?.total || 0).toLocaleString()}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-xs text-muted-foreground font-medium uppercase">Collected</p>
              <p className="text-2xl font-bold mt-1 font-mono text-success">${((revenueData as any)?.summary?.paid || 0).toLocaleString()}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-xs text-muted-foreground font-medium uppercase">Outstanding</p>
              <p className="text-2xl font-bold mt-1 font-mono">${((revenueData as any)?.summary?.outstanding || 0).toLocaleString()}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-xs text-muted-foreground font-medium uppercase">Overdue</p>
              <p className="text-2xl font-bold mt-1 font-mono text-destructive">${((revenueData as any)?.summary?.overdue || 0).toLocaleString()}</p>
            </CardContent></Card>
          </div>

          {/* A/R Aging */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">A/R Aging Summary</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Current</TableHead>
                    <TableHead>1-30 Days</TableHead>
                    <TableHead>31-60 Days</TableHead>
                    <TableHead>61-90 Days</TableHead>
                    <TableHead>90+ Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-mono">${((revenueData as any)?.aging?.current || 0).toLocaleString()}</TableCell>
                    <TableCell className="font-mono">${((revenueData as any)?.aging?.d30 || 0).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-warning">${((revenueData as any)?.aging?.d60 || 0).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-destructive">${((revenueData as any)?.aging?.d90 || 0).toLocaleString()}</TableCell>
                    <TableCell className="font-mono font-bold text-destructive">${((revenueData as any)?.aging?.over90 || 0).toLocaleString()}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Package Revenue Split */}
          {packageRevenue && packageRevenue.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Package Revenue Split</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Package</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Recognized</TableHead>
                      <TableHead>Deferred</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {packageRevenue.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.service_packages?.name || "—"}</TableCell>
                        <TableCell className="font-mono">${(p.price_paid || 0).toLocaleString()}</TableCell>
                        <TableCell className="font-mono text-success">${(p.revenue_recognized_amount || 0).toLocaleString()}</TableCell>
                        <TableCell className="font-mono text-warning">${(p.deferred_revenue_amount || 0).toLocaleString()}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{p.status}</Badge></TableCell>
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
