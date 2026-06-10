import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CreditCard, CheckCircle2, AlertTriangle, Download, Sparkles } from "lucide-react";
import { toast } from "sonner";

// New tables/columns aren't in the generated types yet — cast the client until
// types are regenerated from the DB after the pricing migration is applied.
const db = supabase as any;

const PRICING_BASIS = ["per_unit", "syringe", "vial", "thread", "cycle", "session", "flat"] as const;

export default function ClinicPayments() {
  const qc = useQueryClient();
  const [clinicId, setClinicId] = useState<string>("");

  const { data: clinics = [] } = useQuery({
    queryKey: ["clinics-payments"],
    queryFn: async () => {
      const { data, error } = await db
        .from("clinics")
        .select("id, name, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_onboarding_status, platform_fee_percent, deposit_enabled, deposit_type, deposit_value, tax_rate")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!clinicId && clinics.length) setClinicId(clinics[0].id);
  }, [clinics, clinicId]);

  const clinic = clinics.find((c: any) => c.id === clinicId);

  const { data: treatments = [] } = useQuery({
    queryKey: ["treatments-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("treatments").select("id, name, category, price").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pricing = [], isLoading: pricingLoading } = useQuery({
    queryKey: ["clinic-pricing", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await db.from("clinic_item_pricing").select("*").eq("clinic_id", clinicId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const priceByTreatment = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of pricing) if (p.treatment_id) m.set(p.treatment_id, p);
    return m;
  }, [pricing]);

  // ── Stripe Connect onboarding ──────────────────────────────────────────────
  const [connecting, setConnecting] = useState(false);
  const onboard = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect", {
        body: { action: "onboard", clinic_id: clinicId, return_url: window.location.href, refresh_url: window.location.href },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      if ((data as any)?.url) window.location.href = (data as any).url;
    } catch (e: any) {
      toast.error(e.message || "Could not start Stripe onboarding");
    } finally {
      setConnecting(false);
    }
  };
  const refreshStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect", { body: { action: "status", clinic_id: clinicId } });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      qc.invalidateQueries({ queryKey: ["clinics-payments"] });
      toast.success("Stripe status refreshed");
    } catch (e: any) {
      toast.error(e.message || "Could not refresh status");
    }
  };

  // ── Clinic config (fee / deposit / tax) ────────────────────────────────────
  const [cfg, setCfg] = useState<any>(null);
  useEffect(() => { if (clinic) setCfg({ ...clinic }); }, [clinicId, clinic?.id]); // eslint-disable-line
  const saveConfig = async () => {
    try {
      const { error } = await db.from("clinics").update({
        platform_fee_percent: Number(cfg.platform_fee_percent) || 0,
        deposit_enabled: !!cfg.deposit_enabled,
        deposit_type: cfg.deposit_type || "percent",
        deposit_value: Number(cfg.deposit_value) || 0,
        tax_rate: Number(cfg.tax_rate) || 0,
      }).eq("id", clinicId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["clinics-payments"] });
      toast.success("Clinic settings saved");
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
  };

  // ── Pricing edit ────────────────────────────────────────────────────────────
  const [drafts, setDrafts] = useState<Record<string, { price: string; member_price: string; basis: string }>>({});
  const draftFor = (tid: string) => {
    const existing = priceByTreatment.get(tid);
    return drafts[tid] ?? {
      price: existing?.price != null ? String(existing.price) : "",
      member_price: existing?.member_price != null ? String(existing.member_price) : "",
      basis: existing?.pricing_basis ?? "flat",
    };
  };
  const setDraft = (tid: string, patch: Partial<{ price: string; member_price: string; basis: string }>) =>
    setDrafts((d) => ({ ...d, [tid]: { ...draftFor(tid), ...patch } }));

  const savePrice = async (tid: string) => {
    const d = draftFor(tid);
    const newPrice = d.price === "" ? null : Number(d.price);
    if (newPrice == null || isNaN(newPrice)) { toast.error("Enter a price"); return; }
    const existing = priceByTreatment.get(tid);
    try {
      const row = {
        clinic_id: clinicId,
        treatment_id: tid,
        price: newPrice,
        member_price: d.member_price === "" ? null : Number(d.member_price),
        is_member_pricing_enabled: d.member_price !== "",
        pricing_basis: d.basis,
        updated_at: new Date().toISOString(),
      };
      const { error } = await db.from("clinic_item_pricing").upsert(row, { onConflict: "clinic_id,treatment_id" });
      if (error) throw error;
      // Price history (audit who/when/what).
      await db.from("clinic_item_price_history").insert({
        clinic_id: clinicId, treatment_id: tid, pricing_id: existing?.id ?? null,
        old_price: existing?.price ?? null, new_price: newPrice,
        old_member_price: existing?.member_price ?? null, new_member_price: row.member_price,
        reason: existing ? "price update" : "initial price",
      });
      setDrafts((s) => { const n = { ...s }; delete n[tid]; return n; });
      qc.invalidateQueries({ queryKey: ["clinic-pricing", clinicId] });
      toast.success("Price saved");
    } catch (e: any) {
      toast.error(e.message || "Could not save price");
    }
  };

  const seedFromCatalog = async () => {
    try {
      const { data, error } = await db.rpc("seed_clinic_pricing_from_treatments", { p_clinic_id: clinicId });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["clinic-pricing", clinicId] });
      toast.success(`Seeded ${data ?? 0} starting price(s)`);
    } catch (e: any) {
      toast.error(e.message || "Seed failed");
    }
  };

  const exportCsv = () => {
    const rows = [["Procedure", "Category", "Price", "Member Price", "Basis", "Price Set"]];
    for (const t of treatments) {
      const p = priceByTreatment.get(t.id);
      rows.push([t.name, t.category || "", p?.price ?? "", p?.member_price ?? "", p?.pricing_basis ?? "", p ? "yes" : "no"]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${clinic?.name || "clinic"}-pricing.csv`;
    a.click();
  };

  const charges = !!clinic?.stripe_charges_enabled;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payments & Pricing</h1>
          <p className="text-sm text-muted-foreground">Stripe Connect onboarding and per-clinic pricing.</p>
        </div>
        <Select value={clinicId} onValueChange={setClinicId}>
          <SelectTrigger className="w-[240px]"><SelectValue placeholder="Select clinic" /></SelectTrigger>
          <SelectContent>
            {clinics.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!clinicId ? (
        <p className="text-sm text-muted-foreground">Select a clinic to begin.</p>
      ) : (
        <>
          {/* Stripe Connect */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" /> Stripe Connect</CardTitle>
              <CardDescription>Patient payments settle to this clinic's connected account; the platform takes its fee automatically.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {charges ? (
                  <Badge className="bg-success/10 text-success border-success/20"><CheckCircle2 className="mr-1 h-3 w-3" /> Charges enabled</Badge>
                ) : (
                  <Badge variant="outline" className="border-warning/40 text-warning"><AlertTriangle className="mr-1 h-3 w-3" /> {clinic?.stripe_onboarding_status || "not started"}</Badge>
                )}
                {clinic?.stripe_account_id && <span className="text-xs text-muted-foreground font-mono">{clinic.stripe_account_id}</span>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={onboard} disabled={connecting}>
                  {connecting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CreditCard className="mr-1 h-4 w-4" />}
                  {clinic?.stripe_account_id ? "Continue onboarding" : "Connect Stripe"}
                </Button>
                {clinic?.stripe_account_id && <Button size="sm" variant="outline" onClick={refreshStatus}>Refresh status</Button>}
              </div>
            </CardContent>
          </Card>

          {/* Fee / deposit / tax config */}
          {cfg && (
            <Card>
              <CardHeader><CardTitle className="text-base">Fees, deposit & tax</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Platform fee %</Label>
                  <Input type="number" step="0.01" value={cfg.platform_fee_percent ?? 0} onChange={(e) => setCfg({ ...cfg, platform_fee_percent: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tax rate %</Label>
                  <Input type="number" step="0.01" value={cfg.tax_rate ?? 0} onChange={(e) => setCfg({ ...cfg, tax_rate: e.target.value })} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={!!cfg.deposit_enabled} onCheckedChange={(v) => setCfg({ ...cfg, deposit_enabled: v })} />
                  <Label>Require deposit on booking</Label>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label>Deposit type</Label>
                    <Select value={cfg.deposit_type || "percent"} onValueChange={(v) => setCfg({ ...cfg, deposit_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">Percent</SelectItem>
                        <SelectItem value="flat">Flat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label>Deposit value</Label>
                    <Input type="number" step="0.01" value={cfg.deposit_value ?? 0} onChange={(e) => setCfg({ ...cfg, deposit_value: e.target.value })} />
                  </div>
                </div>
                <div className="sm:col-span-2"><Button size="sm" onClick={saveConfig}>Save settings</Button></div>
              </CardContent>
            </Card>
          )}

          {/* Pricing */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Clinic pricing</CardTitle>
                <CardDescription>Set this clinic's price per procedure. Items without a price are blocked from sale.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={seedFromCatalog}><Sparkles className="mr-1 h-4 w-4" /> Seed starting prices</Button>
                <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" /> Export CSV</Button>
              </div>
            </CardHeader>
            <CardContent>
              {pricingLoading ? (
                <div className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Procedure</TableHead>
                      <TableHead className="w-[120px]">Price</TableHead>
                      <TableHead className="w-[120px]">Member</TableHead>
                      <TableHead className="w-[130px]">Basis</TableHead>
                      <TableHead className="w-[90px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {treatments.map((t: any) => {
                      const d = draftFor(t.id);
                      const isSet = priceByTreatment.has(t.id);
                      return (
                        <TableRow key={t.id}>
                          <TableCell>
                            <div className="font-medium">{t.name}</div>
                            {!isSet && <span className="text-[11px] text-warning">price not set</span>}
                          </TableCell>
                          <TableCell><Input className="h-8" type="number" step="0.01" value={d.price} onChange={(e) => setDraft(t.id, { price: e.target.value })} /></TableCell>
                          <TableCell><Input className="h-8" type="number" step="0.01" value={d.member_price} onChange={(e) => setDraft(t.id, { member_price: e.target.value })} placeholder="—" /></TableCell>
                          <TableCell>
                            <Select value={d.basis} onValueChange={(v) => setDraft(t.id, { basis: v })}>
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>{PRICING_BASIS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell><Button size="sm" variant="ghost" onClick={() => savePrice(t.id)} disabled={!drafts[t.id]}>Save</Button></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
