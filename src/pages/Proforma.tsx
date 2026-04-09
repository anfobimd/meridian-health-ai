import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Calculator, Sparkles, Save, TrendingUp, DollarSign, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";

// Botox monthly multipliers (compounding returns)
const BOTOX_MULTIPLIERS = [1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4];
const BOTOX_MULTI_SUM = BOTOX_MULTIPLIERS.reduce((a, b) => a + b, 0); // 26

interface Inputs {
  botox_pts: number; botox_cost: number; botox_price: number; botox_units: number; botox_time: number;
  wl_pts: number; wl_net: number; wl_months: number; wl_first_time: number; wl_followup_time: number;
  laser_pts: number; laser_revenue: number; laser_cost: number; laser_time: number;
  vf_pts: number; vf_revenue: number; vf_cost: number; vf_time: number;
  membership_monthly: number; founding: boolean;
}

const DEFAULT_INPUTS: Inputs = {
  botox_pts: 10, botox_cost: 4, botox_price: 10, botox_units: 30, botox_time: 15,
  wl_pts: 10, wl_net: 100, wl_months: 10, wl_first_time: 20, wl_followup_time: 15,
  laser_pts: 5, laser_revenue: 600, laser_cost: 300, laser_time: 30,
  vf_pts: 5, vf_revenue: 900, vf_cost: 300, vf_time: 30,
  membership_monthly: 500, founding: true,
};

function calcBotox(i: Inputs) {
  const margin = i.botox_price - i.botox_cost;
  const netPerPt = margin * i.botox_units;
  const annualVisits = i.botox_pts * BOTOX_MULTI_SUM;
  const annualEarnings = annualVisits * netPerPt;
  const annualHours = annualVisits * i.botox_time / 60;
  const rate = annualHours > 0 ? annualEarnings / annualHours : 0;
  // Monthly breakdown
  const monthly = BOTOX_MULTIPLIERS.map((mult, idx) => {
    const cumPts = i.botox_pts * mult;
    return { month: `M${idx + 1}`, patients: cumPts, revenue: cumPts * netPerPt };
  });
  return { netPerPt, annualVisits, annualEarnings, annualHours, rate, monthly };
}

function calcWeightLoss(i: Inputs) {
  // Each cohort of N new patients generates N×$net×MIN(month, active_months)
  let totalRev = 0;
  const monthly = Array.from({ length: 12 }, (_, idx) => {
    const m = idx + 1;
    let rev = 0;
    for (let c = 1; c <= m; c++) {
      const months_active = m - c + 1;
      if (months_active <= i.wl_months) rev += i.wl_pts * i.wl_net;
    }
    totalRev += rev;
    return { month: `M${m}`, revenue: rev };
  });
  // Hours: first visits + follow-ups
  const totalFirstVisits = i.wl_pts * 12;
  const sumFollowups = monthly.reduce((s, m) => s + m.revenue / i.wl_net - i.wl_pts, 0);
  const totalHours = (totalFirstVisits * i.wl_first_time + Math.max(0, sumFollowups) * i.wl_followup_time) / 60;
  const rate = totalHours > 0 ? totalRev / totalHours : 0;
  return { annualEarnings: totalRev, annualHours: totalHours, rate, monthly };
}

function calcLaser(i: Inputs) {
  const net = i.laser_revenue - i.laser_cost;
  const annual = i.laser_pts * 12 * net;
  const hours = i.laser_pts * 12 * i.laser_time / 60;
  const rate = hours > 0 ? annual / hours : 0;
  return { netPerTx: net, annualEarnings: annual, annualHours: hours, rate };
}

function calcVF(i: Inputs) {
  const net = i.vf_revenue - i.vf_cost;
  const annual = i.vf_pts * 12 * net;
  const hours = i.vf_pts * 12 * i.vf_time / 60;
  const rate = hours > 0 ? annual / hours : 0;
  return { netPerTx: net, annualEarnings: annual, annualHours: hours, rate };
}

export default function Proforma() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS);
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [scenarioName, setScenarioName] = useState("");

  const upd = (key: keyof Inputs, val: number | boolean) => setInputs(p => ({ ...p, [key]: val }));

  const botox = calcBotox(inputs);
  const wl = calcWeightLoss(inputs);
  const laser = calcLaser(inputs);
  const vf = calcVF(inputs);

  const combined = botox.annualEarnings + wl.annualEarnings + laser.annualEarnings + vf.annualEarnings;
  const combinedHours = botox.annualHours + wl.annualHours + laser.annualHours + vf.annualHours;
  const membershipAnnual = (inputs.founding ? 500 : inputs.membership_monthly) * 12;
  const netAfterMembership = combined - membershipAnnual;
  const blendedRate = combinedHours > 0 ? netAfterMembership / combinedHours : 0;

  const summaryData = [
    { name: "Botox", earnings: botox.annualEarnings, hours: botox.annualHours, rate: botox.rate, color: "#0ab5a8" },
    { name: "Weight Loss", earnings: wl.annualEarnings, hours: wl.annualHours, rate: wl.rate, color: "#6366f1" },
    { name: "CO₂ Laser", earnings: laser.annualEarnings, hours: laser.annualHours, rate: laser.rate, color: "#f59e0b" },
    { name: "Vampire Facial", earnings: vf.annualEarnings, hours: vf.annualHours, rate: vf.rate, color: "#ef4444" },
  ];

  // Combined monthly chart (botox + WL ramp)
  const monthlyChart = Array.from({ length: 12 }, (_, i) => ({
    month: `M${i + 1}`,
    Botox: botox.monthly[i].revenue,
    "Weight Loss": wl.monthly[i].revenue,
    Laser: inputs.laser_pts * (inputs.laser_revenue - inputs.laser_cost),
    "Vampire Facial": inputs.vf_pts * (inputs.vf_revenue - inputs.vf_cost),
  }));

  async function optimizeWithAI() {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-financial-advisor", {
        body: {
          mode: "proforma_optimize",
          inputs,
          current_results: { combined, combinedHours, netAfterMembership, blendedRate, breakdown: summaryData },
        },
      });
      if (error) throw error;
      setAiSuggestion(data.recommendation || data.narrative || JSON.stringify(data));
    } catch { toast.error("AI optimization failed"); }
    setAiLoading(false);
  }

  async function saveScenario() {
    if (!scenarioName.trim()) { toast.error("Enter a scenario name"); return; }
    const { error } = await supabase.from("proforma_scenarios").insert({
      name: scenarioName,
      inputs: inputs as any,
      results: { combined, combinedHours, netAfterMembership, blendedRate, breakdown: summaryData } as any,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Scenario saved");
    setScenarioName("");
  }

  const SliderInput = ({ label, value, onChange, min, max, step = 1, unit = "" }: any) => (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-bold">{unit}{value}</span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={min} max={max} step={step} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold">Revenue Proforma</h1>
          <p className="text-sm text-muted-foreground">Model your earnings across all modalities with compounding returns</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={optimizeWithAI} disabled={aiLoading}>
            <Sparkles className="h-4 w-4 mr-1" /> {aiLoading ? "Optimizing…" : "Optimize My Mix"}
          </Button>
        </div>
      </div>

      {/* AI Suggestion */}
      {aiSuggestion && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI Optimization</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{aiSuggestion}</p></CardContent>
        </Card>
      )}

      {/* Combined Summary KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-primary/30"><CardContent className="pt-5 text-center">
          <DollarSign className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-mono font-bold">${netAfterMembership.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Year 1 Net (after membership)</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 text-center">
          <TrendingUp className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-mono font-bold">${blendedRate.toFixed(0)}</p>
          <p className="text-xs text-muted-foreground">Blended $/hr</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 text-center">
          <Clock className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-mono font-bold">{combinedHours.toFixed(0)}</p>
          <p className="text-xs text-muted-foreground">Total Hours/Year</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 text-center">
          <Calculator className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-mono font-bold">-${membershipAnnual.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Membership Fee/Year</p>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Membership</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Switch checked={inputs.founding} onCheckedChange={v => upd("founding", v)} />
                <Label className="text-xs">Founding Year ($500 all modalities)</Label>
              </div>
              {!inputs.founding && <SliderInput label="Monthly Rate" value={inputs.membership_monthly} onChange={(v: number) => upd("membership_monthly", v)} min={500} max={1000} step={250} unit="$" />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-[#0ab5a8]">Botox</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <SliderInput label="New patients/mo" value={inputs.botox_pts} onChange={(v: number) => upd("botox_pts", v)} min={0} max={50} />
              <SliderInput label="Cost/unit" value={inputs.botox_cost} onChange={(v: number) => upd("botox_cost", v)} min={2} max={8} step={0.5} unit="$" />
              <SliderInput label="Price/unit" value={inputs.botox_price} onChange={(v: number) => upd("botox_price", v)} min={8} max={20} unit="$" />
              <SliderInput label="Avg units/patient" value={inputs.botox_units} onChange={(v: number) => upd("botox_units", v)} min={10} max={60} />
              <SliderInput label="Time/patient (min)" value={inputs.botox_time} onChange={(v: number) => upd("botox_time", v)} min={10} max={30} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-[#6366f1]">Weight Loss (GLP-1)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <SliderInput label="New patients/mo" value={inputs.wl_pts} onChange={(v: number) => upd("wl_pts", v)} min={0} max={50} />
              <SliderInput label="Net/visit" value={inputs.wl_net} onChange={(v: number) => upd("wl_net", v)} min={50} max={300} step={10} unit="$" />
              <SliderInput label="Active months" value={inputs.wl_months} onChange={(v: number) => upd("wl_months", v)} min={3} max={18} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-[#f59e0b]">CO₂ Laser</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <SliderInput label="Patients/mo" value={inputs.laser_pts} onChange={(v: number) => upd("laser_pts", v)} min={0} max={30} />
              <SliderInput label="Revenue/tx" value={inputs.laser_revenue} onChange={(v: number) => upd("laser_revenue", v)} min={300} max={2000} step={50} unit="$" />
              <SliderInput label="Cost/tx" value={inputs.laser_cost} onChange={(v: number) => upd("laser_cost", v)} min={100} max={800} step={50} unit="$" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-[#ef4444]">Vampire Facial</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <SliderInput label="Patients/mo" value={inputs.vf_pts} onChange={(v: number) => upd("vf_pts", v)} min={0} max={30} />
              <SliderInput label="Revenue/tx" value={inputs.vf_revenue} onChange={(v: number) => upd("vf_revenue", v)} min={500} max={2000} step={50} unit="$" />
              <SliderInput label="Cost/tx" value={inputs.vf_cost} onChange={(v: number) => upd("vf_cost", v)} min={100} max={800} step={50} unit="$" />
            </CardContent>
          </Card>

          {/* Save */}
          <Card>
            <CardContent className="pt-4 space-y-2">
              <div className="flex gap-2">
                <Input placeholder="Scenario name" value={scenarioName} onChange={e => setScenarioName(e.target.value)} />
                <Button variant="outline" size="icon" onClick={saveScenario}><Save className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Earnings breakdown table */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Year 1 Earnings Breakdown</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Modality</TableHead>
                    <TableHead>Year 1 Earnings</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Eff. $/hr</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryData.map(row => (
                    <TableRow key={row.name}>
                      <TableCell><span className="font-medium" style={{ color: row.color }}>{row.name}</span></TableCell>
                      <TableCell className="font-mono">${row.earnings.toLocaleString()}</TableCell>
                      <TableCell className="font-mono">{row.hours.toFixed(1)}</TableCell>
                      <TableCell className="font-mono font-bold">${row.rate.toFixed(0)}/hr</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2">
                    <TableCell className="font-bold">Combined Gross</TableCell>
                    <TableCell className="font-mono font-bold">${combined.toLocaleString()}</TableCell>
                    <TableCell className="font-mono font-bold">{combinedHours.toFixed(1)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Less Membership</TableCell>
                    <TableCell className="font-mono text-destructive">-${membershipAnnual.toLocaleString()}</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow className="bg-primary/5">
                    <TableCell className="font-bold text-primary">Net After Membership</TableCell>
                    <TableCell className="font-mono font-bold text-primary">${netAfterMembership.toLocaleString()}</TableCell>
                    <TableCell className="font-mono font-bold">{combinedHours.toFixed(1)}</TableCell>
                    <TableCell className="font-mono font-bold text-primary">${blendedRate.toFixed(0)}/hr</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Monthly Revenue Chart */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Monthly Revenue Ramp (Year 1)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="Botox" fill="#0ab5a8" stackId="a" />
                  <Bar dataKey="Weight Loss" fill="#6366f1" stackId="a" />
                  <Bar dataKey="Laser" fill="#f59e0b" stackId="a" />
                  <Bar dataKey="Vampire Facial" fill="#ef4444" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Botox Compounding Chart */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Botox Compounding Effect</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={botox.monthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                  <Line type="monotone" dataKey="revenue" stroke="#0ab5a8" strokeWidth={2} name="Monthly Net" />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">
                With {inputs.botox_pts} new patients/month, your Botox panel generates {botox.annualVisits} visits/year 
                due to the 3.5-month return cycle compounding effect (26× multiplier).
              </p>
            </CardContent>
          </Card>

          {/* $/hr Comparison */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Effective $/Hour Comparison</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={summaryData.filter(d => d.earnings > 0)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={v => `$${v}`} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => `$${v.toFixed(0)}/hr`} />
                  <Bar dataKey="rate" name="$/hr" fill="#0ab5a8">
                    {summaryData.filter(d => d.earnings > 0).map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Need Cell import for recharts
import { Cell } from "recharts";
