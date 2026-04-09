import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { CreditCard, Plus, DollarSign, Zap, Users, Receipt, TrendingUp } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

const MODALITIES = [
  { id: "injectables", label: "Injectables (Botox/Filler)" },
  { id: "weight_loss", label: "Weight Loss (GLP-1)" },
  { id: "laser", label: "Laser (CO₂, IPL, LHR, Tattoo)" },
];

const LASER_PER_USE = 150;

function calcRate(modalities: string[], foundingLocked: boolean) {
  if (foundingLocked) return 500;
  const count = modalities.length;
  if (count <= 1) return 500;
  if (count === 2) return 750;
  return 1000;
}

export default function MembershipBilling() {
  const [memberships, setMemberships] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [laserDialogOpen, setLaserDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModalities, setSelectedModalities] = useState<string[]>([]);
  const [foundingLocked, setFoundingLocked] = useState(false);
  const [laserProviderId, setLaserProviderId] = useState("");
  const [laserUses, setLaserUses] = useState(1);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [mRes, iRes, pRes] = await Promise.all([
      supabase.from("provider_memberships").select("*, providers(first_name, last_name, specialty)").order("created_at", { ascending: false }),
      supabase.from("membership_invoices").select("*, providers(first_name, last_name)").order("created_at", { ascending: false }).limit(50),
      supabase.from("providers").select("id, first_name, last_name, specialty").eq("is_active", true).order("last_name"),
    ]);
    setMemberships(mRes.data || []);
    setInvoices(iRes.data || []);
    setProviders(pRes.data || []);
    setLoading(false);
  }

  async function createMembership() {
    if (!selectedProvider || selectedModalities.length === 0) {
      toast.error("Select a provider and at least one modality");
      return;
    }
    const rate = calcRate(selectedModalities, foundingLocked);
    const { error } = await supabase.from("provider_memberships").insert({
      provider_id: selectedProvider,
      tier: foundingLocked ? "founding" : selectedModalities.length === 1 ? "single" : selectedModalities.length === 2 ? "double" : "triple",
      modalities: selectedModalities,
      monthly_rate: rate,
      founding_rate_locked: foundingLocked,
      founding_rate: foundingLocked ? 500 : null,
      is_active: true,
      status: "active",
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Membership created");
    setDialogOpen(false);
    setSelectedProvider("");
    setSelectedModalities([]);
    setFoundingLocked(false);
    fetchAll();
  }

  async function logLaserUsage() {
    const membership = memberships.find((m: any) => m.provider_id === laserProviderId);
    if (!membership) { toast.error("Provider has no active membership"); return; }

    const now = new Date();
    const ps = startOfMonth(now);
    const pe = endOfMonth(now);

    // Check for existing draft invoice this month
    const { data: existing } = await supabase.from("membership_invoices")
      .select("*")
      .eq("provider_id", laserProviderId)
      .eq("status", "draft")
      .gte("period_start", format(ps, "yyyy-MM-dd"))
      .lte("period_end", format(pe, "yyyy-MM-dd"))
      .limit(1);

    if (existing && existing.length > 0) {
      const inv = existing[0];
      const newUses = (inv.laser_uses || 0) + laserUses;
      const newCharges = newUses * LASER_PER_USE;
      await supabase.from("membership_invoices").update({
        laser_uses: newUses,
        laser_charges: newCharges,
        amount: (inv.membership_amount || 0) + newCharges,
      } as any).eq("id", inv.id);
    } else {
      await supabase.from("membership_invoices").insert({
        membership_id: membership.id,
        provider_id: laserProviderId,
        membership_amount: membership.monthly_rate,
        laser_uses: laserUses,
        laser_charges: laserUses * LASER_PER_USE,
        amount: membership.monthly_rate + laserUses * LASER_PER_USE,
        period_start: format(ps, "yyyy-MM-dd"),
        period_end: format(pe, "yyyy-MM-dd"),
        status: "draft",
      } as any);
    }
    toast.success(`Logged ${laserUses} laser use(s) for $${laserUses * LASER_PER_USE}`);
    setLaserDialogOpen(false);
    setLaserUses(1);
    fetchAll();
  }

  async function generateMonthlyInvoices() {
    const now = new Date();
    const ps = startOfMonth(now);
    const pe = endOfMonth(now);
    let created = 0;
    for (const m of memberships.filter((m: any) => m.status === "active" || m.is_active)) {
      const { data: existing } = await supabase.from("membership_invoices")
        .select("id")
        .eq("membership_id", m.id)
        .gte("period_start", format(ps, "yyyy-MM-dd"))
        .limit(1);
      if (existing && existing.length > 0) continue;
      await supabase.from("membership_invoices").insert({
        membership_id: m.id,
        provider_id: m.provider_id,
        membership_amount: m.monthly_rate,
        laser_uses: 0,
        laser_charges: 0,
        amount: m.monthly_rate,
        period_start: format(ps, "yyyy-MM-dd"),
        period_end: format(pe, "yyyy-MM-dd"),
        status: "draft",
      } as any);
      created++;
    }
    toast.success(`Generated ${created} invoice(s) for ${format(now, "MMMM yyyy")}`);
    fetchAll();
  }

  async function markInvoicePaid(id: string) {
    await supabase.from("membership_invoices").update({ status: "paid", paid_at: new Date().toISOString() } as any).eq("id", id);
    toast.success("Marked as paid");
    fetchAll();
  }

  const totalMonthlyRevenue = memberships.filter((m: any) => m.status === "active" || m.is_active).reduce((sum: number, m: any) => sum + (m.monthly_rate || 0), 0);
  const activeCount = memberships.filter((m: any) => m.status === "active" || m.is_active).length;
  const foundingCount = memberships.filter((m: any) => m.founding_rate_locked).length;
  const unpaidInvoices = invoices.filter((i: any) => i.status === "draft" || i.status === "sent");

  const statusColor = (s: string) => {
    switch (s) {
      case "paid": return "default";
      case "draft": return "secondary";
      case "sent": return "outline";
      case "overdue": return "destructive";
      default: return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold">Membership Billing</h1>
          <p className="text-sm text-muted-foreground">Manage provider memberships, tiers, and monthly invoicing</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={laserDialogOpen} onOpenChange={setLaserDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Zap className="h-4 w-4 mr-1" /> Log Laser Use</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log Laser Usage ($150/use)</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Provider</Label>
                  <Select value={laserProviderId} onValueChange={setLaserProviderId}>
                    <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                    <SelectContent>
                      {memberships.filter((m: any) => m.modalities?.includes("laser")).map((m: any) => (
                        <SelectItem key={m.provider_id} value={m.provider_id}>
                          {m.providers?.first_name} {m.providers?.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Number of uses</Label>
                  <Input type="number" min={1} value={laserUses} onChange={e => setLaserUses(parseInt(e.target.value) || 1)} />
                </div>
                <p className="text-sm text-muted-foreground">Total charge: <span className="font-mono font-bold text-foreground">${laserUses * LASER_PER_USE}</span></p>
                <Button onClick={logLaserUsage} className="w-full">Log Usage</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={generateMonthlyInvoices}><Receipt className="h-4 w-4 mr-1" /> Generate Invoices</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> New Membership</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Membership</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Provider</Label>
                  <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                    <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                    <SelectContent>
                      {providers.filter(p => !memberships.some((m: any) => m.provider_id === p.id)).map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Modalities</Label>
                  {MODALITIES.map(mod => (
                    <div key={mod.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedModalities.includes(mod.id)}
                        onCheckedChange={checked => {
                          setSelectedModalities(prev =>
                            checked ? [...prev, mod.id] : prev.filter(m => m !== mod.id)
                          );
                        }}
                      />
                      <span className="text-sm">{mod.label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={foundingLocked} onCheckedChange={setFoundingLocked} />
                  <Label>Founding Year 1 rate ($500 for all modalities)</Label>
                </div>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Monthly rate</span>
                      <span className="text-xl font-mono font-bold">${calcRate(selectedModalities, foundingLocked)}/mo</span>
                    </div>
                    {selectedModalities.includes("laser") && (
                      <p className="text-xs text-muted-foreground mt-1">+ $150 per laser use</p>
                    )}
                  </CardContent>
                </Card>
                <Button onClick={createMembership} className="w-full">Create Membership</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-5 text-center">
          <Users className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-mono font-bold">{activeCount}</p>
          <p className="text-xs text-muted-foreground">Active Members</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 text-center">
          <DollarSign className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-mono font-bold">${totalMonthlyRevenue.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Monthly Revenue</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 text-center">
          <CreditCard className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-mono font-bold">{foundingCount}</p>
          <p className="text-xs text-muted-foreground">Founding Members</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 text-center">
          <Receipt className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-mono font-bold">{unpaidInvoices.length}</p>
          <p className="text-xs text-muted-foreground">Unpaid Invoices</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="memberships">
        <TabsList>
          <TabsTrigger value="memberships">Memberships ({memberships.length})</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="memberships">
          <Card>
            <CardContent className="pt-4">
              {memberships.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No memberships yet — create one to get started</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Modalities</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Founding</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {memberships.map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.providers?.first_name} {m.providers?.last_name}</TableCell>
                        <TableCell><Badge variant="secondary">{m.tier}</Badge></TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(m.modalities || []).map((mod: string) => (
                              <Badge key={mod} variant="outline" className="text-xs">{mod}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">${m.monthly_rate}/mo</TableCell>
                        <TableCell>{m.founding_rate_locked ? <Badge className="bg-amber-500/10 text-amber-600 border-amber-200">Year 1 Lock</Badge> : "—"}</TableCell>
                        <TableCell><Badge variant={m.status === "active" || m.is_active ? "default" : "secondary"}>{m.status || (m.is_active ? "active" : "inactive")}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardContent className="pt-4">
              {invoices.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No invoices yet — generate monthly invoices above</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Membership</TableHead>
                      <TableHead>Laser</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.providers?.first_name} {inv.providers?.last_name}</TableCell>
                        <TableCell className="text-sm">{inv.period_start} → {inv.period_end}</TableCell>
                        <TableCell className="font-mono">${inv.membership_amount}</TableCell>
                        <TableCell className="font-mono">{inv.laser_uses > 0 ? `${inv.laser_uses}× = $${inv.laser_charges}` : "—"}</TableCell>
                        <TableCell className="font-mono font-bold">${inv.amount}</TableCell>
                        <TableCell><Badge variant={statusColor(inv.status) as any}>{inv.status}</Badge></TableCell>
                        <TableCell>
                          {inv.status !== "paid" && (
                            <Button size="sm" variant="outline" onClick={() => markInvoicePaid(inv.id)}>Mark Paid</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
