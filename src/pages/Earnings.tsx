import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TrendingUp, DollarSign, Clock, Users, Sparkles, Plus } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const MODALITY_COLORS: Record<string, string> = {
  botox: "#0ab5a8",
  weight_loss: "#6366f1",
  laser: "#f59e0b",
  vampire_facial: "#ef4444",
  filler: "#8b5cf6",
  other: "#94a3b8",
};

const MODALITY_LABELS: Record<string, string> = {
  botox: "Botox",
  weight_loss: "Weight Loss",
  laser: "CO₂ Laser",
  vampire_facial: "Vampire Facial",
  filler: "Filler",
  other: "Other",
};

export default function Earnings() {
  const [earnings, setEarnings] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logForm, setLogForm] = useState({
    provider_id: "", modality: "botox", gross_revenue: 0, cogs: 0, units_used: 0, time_minutes: 15
  });

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [eRes, pRes] = await Promise.all([
      supabase.from("provider_earnings").select("*, providers(first_name, last_name), treatments(name)").order("service_date", { ascending: false }).limit(500),
      supabase.from("providers").select("id, first_name, last_name").eq("is_active", true).order("last_name"),
    ]);
    setEarnings(eRes.data || []);
    setProviders(pRes.data || []);
    setLoading(false);
  }

  async function logEarning() {
    if (!logForm.provider_id) { toast.error("Select a provider"); return; }
    const net = logForm.gross_revenue - logForm.cogs;
    const { error } = await supabase.from("provider_earnings").insert({
      provider_id: logForm.provider_id,
      modality: logForm.modality,
      gross_revenue: logForm.gross_revenue,
      cogs: logForm.cogs,
      net_revenue: net,
      units_used: logForm.units_used || null,
      time_minutes: logForm.time_minutes,
      service_date: new Date().toISOString(),
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Logged $${net} net revenue`);
    setLogOpen(false);
    fetchAll();
  }

  async function getAiInsights() {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-financial-advisor", {
        body: { mode: "earnings_analysis", earnings: earnings.slice(0, 100) },
      });
      if (error) throw error;
      setAiInsight(data.narrative || data.analysis || JSON.stringify(data));
    } catch (e: any) {
      toast.error("AI analysis failed");
    }
    setAiLoading(false);
  }

  // KPI calculations
  const totalGross = earnings.reduce((s, e) => s + (e.gross_revenue || 0), 0);
  const totalNet = earnings.reduce((s, e) => s + (e.net_revenue || 0), 0);
  const totalMinutes = earnings.reduce((s, e) => s + (e.time_minutes || 0), 0);
  const totalHours = totalMinutes / 60;
  const effectiveRate = totalHours > 0 ? totalNet / totalHours : 0;

  // By modality for pie chart
  const byModality = earnings.reduce((acc: Record<string, number>, e) => {
    acc[e.modality] = (acc[e.modality] || 0) + (e.net_revenue || 0);
    return acc;
  }, {});
  const pieData = Object.entries(byModality).map(([mod, val]) => ({
    name: MODALITY_LABELS[mod] || mod,
    value: val as number,
    color: MODALITY_COLORS[mod] || MODALITY_COLORS.other,
  }));

  // By provider
  const byProvider = earnings.reduce((acc: Record<string, any>, e) => {
    const pid = e.provider_id;
    if (!acc[pid]) acc[pid] = { name: `${e.providers?.first_name || ""} ${e.providers?.last_name || ""}`.trim(), gross: 0, net: 0, minutes: 0, sessions: 0 };
    acc[pid].gross += e.gross_revenue || 0;
    acc[pid].net += e.net_revenue || 0;
    acc[pid].minutes += e.time_minutes || 0;
    acc[pid].sessions += 1;
    return acc;
  }, {});
  const providerRows = Object.entries(byProvider).map(([id, d]: [string, any]) => ({
    id, ...d, hours: d.minutes / 60, rate: d.minutes > 0 ? d.net / (d.minutes / 60) : 0,
  })).sort((a, b) => b.net - a.net);

  // Monthly bar chart
  const byMonth = earnings.reduce((acc: Record<string, any>, e) => {
    const month = (e.service_date || "").substring(0, 7);
    if (!acc[month]) acc[month] = { month, botox: 0, weight_loss: 0, laser: 0, vampire_facial: 0, other: 0 };
    const mod = e.modality in acc[month] ? e.modality : "other";
    acc[month][mod] += e.net_revenue || 0;
    return acc;
  }, {});
  const barData = Object.values(byMonth).sort((a: any, b: any) => a.month.localeCompare(b.month));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold">Provider Earnings</h1>
          <p className="text-sm text-muted-foreground">Track revenue by provider and modality</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={getAiInsights} disabled={aiLoading}>
            <Sparkles className="h-4 w-4 mr-1" /> {aiLoading ? "Analyzing…" : "AI Insights"}
          </Button>
          <Dialog open={logOpen} onOpenChange={setLogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Log Earning</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log Provider Earning</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Provider</Label>
                  <Select value={logForm.provider_id} onValueChange={v => setLogForm(p => ({ ...p, provider_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{providers.map(p => <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Modality</Label>
                  <Select value={logForm.modality} onValueChange={v => setLogForm(p => ({ ...p, modality: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="botox">Botox</SelectItem>
                      <SelectItem value="weight_loss">Weight Loss</SelectItem>
                      <SelectItem value="laser">CO₂ Laser</SelectItem>
                      <SelectItem value="vampire_facial">Vampire Facial</SelectItem>
                      <SelectItem value="filler">Filler</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Gross Revenue ($)</Label><Input type="number" value={logForm.gross_revenue} onChange={e => setLogForm(p => ({ ...p, gross_revenue: +e.target.value }))} /></div>
                  <div><Label>COGS ($)</Label><Input type="number" value={logForm.cogs} onChange={e => setLogForm(p => ({ ...p, cogs: +e.target.value }))} /></div>
                  <div><Label>Units Used</Label><Input type="number" value={logForm.units_used} onChange={e => setLogForm(p => ({ ...p, units_used: +e.target.value }))} /></div>
                  <div><Label>Time (min)</Label><Input type="number" value={logForm.time_minutes} onChange={e => setLogForm(p => ({ ...p, time_minutes: +e.target.value }))} /></div>
                </div>
                <Card><CardContent className="pt-3">
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Net Revenue</span><span className="font-mono font-bold">${(logForm.gross_revenue - logForm.cogs).toFixed(2)}</span></div>
                </CardContent></Card>
                <Button onClick={logEarning} className="w-full">Log Earning</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-5 text-center">
          <DollarSign className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-mono font-bold">${totalNet.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Total Net Revenue</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 text-center">
          <TrendingUp className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-mono font-bold">${effectiveRate.toFixed(0)}</p>
          <p className="text-xs text-muted-foreground">Effective $/hr</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 text-center">
          <Clock className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-mono font-bold">{totalHours.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground">Total Hours</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 text-center">
          <Users className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-mono font-bold">{earnings.length}</p>
          <p className="text-xs text-muted-foreground">Total Sessions</p>
        </CardContent></Card>
      </div>

      {/* AI Insight */}
      {aiInsight && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI Earnings Analysis</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{aiInsight}</p></CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Revenue by Modality</CardTitle></CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: $${value.toLocaleString()}`}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-10">No earnings data yet</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Monthly Revenue by Modality</CardTitle></CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="botox" name="Botox" fill="#0ab5a8" stackId="a" />
                  <Bar dataKey="weight_loss" name="Weight Loss" fill="#6366f1" stackId="a" />
                  <Bar dataKey="laser" name="Laser" fill="#f59e0b" stackId="a" />
                  <Bar dataKey="vampire_facial" name="Vampire Facial" fill="#ef4444" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-10">No earnings data yet</p>}
          </CardContent>
        </Card>
      </div>

      {/* Procedure-Level Breakdown (US-025) */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Procedure-Level Revenue</CardTitle></CardHeader>
        <CardContent>
          {earnings.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No earnings data yet</p>
          ) : (() => {
            const byProcedure = earnings.reduce((acc: Record<string, any>, e) => {
              const key = e.treatments?.name || e.modality || "Unknown";
              if (!acc[key]) acc[key] = { name: key, sessions: 0, gross: 0, net: 0, cogs: 0, units: 0, minutes: 0 };
              acc[key].sessions += 1;
              acc[key].gross += e.gross_revenue || 0;
              acc[key].net += e.net_revenue || 0;
              acc[key].cogs += e.cogs || 0;
              acc[key].units += e.units_used || 0;
              acc[key].minutes += e.time_minutes || 0;
              return acc;
            }, {});
            const procRows = Object.values(byProcedure).sort((a: any, b: any) => b.net - a.net);
            return (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Procedure</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Units</TableHead>
                    <TableHead>Gross</TableHead>
                    <TableHead>COGS</TableHead>
                    <TableHead>Net</TableHead>
                    <TableHead>Avg $/session</TableHead>
                    <TableHead>Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {procRows.map((r: any) => (
                    <TableRow key={r.name}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.sessions}</TableCell>
                      <TableCell>{r.units || "—"}</TableCell>
                      <TableCell className="font-mono">${r.gross.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-destructive">${r.cogs.toLocaleString()}</TableCell>
                      <TableCell className="font-mono font-bold">${r.net.toLocaleString()}</TableCell>
                      <TableCell className="font-mono">${r.sessions > 0 ? (r.net / r.sessions).toFixed(0) : 0}</TableCell>
                      <TableCell>{(r.minutes / 60).toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            );
          })()}
        </CardContent>
      </Card>

      {/* Provider Table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Per-Provider Breakdown</CardTitle></CardHeader>
        <CardContent>
          {providerRows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Log earnings to see provider breakdowns</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Eff. $/hr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providerRows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.sessions}</TableCell>
                    <TableCell className="font-mono">${r.gross.toLocaleString()}</TableCell>
                    <TableCell className="font-mono font-bold">${r.net.toLocaleString()}</TableCell>
                    <TableCell>{r.hours.toFixed(1)}</TableCell>
                    <TableCell className="font-mono font-bold text-primary">${r.rate.toFixed(0)}/hr</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
