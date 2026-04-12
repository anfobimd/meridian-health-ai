import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Building2, FileText, Users } from "lucide-react";
import { format } from "date-fns";

export default function ContractsAdmin() {
  const qc = useQueryClient();
  const [contractOpen, setContractOpen] = useState(false);
  const [clinicOpen, setClinicOpen] = useState(false);
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "", notes: "" });
  const [clinicForm, setClinicForm] = useState({ name: "", address: "", contract_id: "", phone: "", city: "", state: "", timezone: "America/New_York" });

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: clinics = [] } = useQuery({
    queryKey: ["clinics"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clinics").select("*, contracts(name)").order("name");
      if (error) throw error;
      return data;
    },
  });

  const addContract = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contracts").insert({
        name: form.name,
        start_date: form.start_date || new Date().toISOString().split("T")[0],
        end_date: form.end_date || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); setContractOpen(false); setForm({ name: "", start_date: "", end_date: "", notes: "" }); toast.success("Contract created"); },
  });

  const addClinic = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("clinics").insert({
        name: clinicForm.name,
        address: clinicForm.address || null,
        contract_id: clinicForm.contract_id || null,
        phone: clinicForm.phone || null,
        city: clinicForm.city || null,
        state: clinicForm.state || null,
        timezone: clinicForm.timezone || "America/New_York",
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clinics"] }); setClinicOpen(false); setClinicForm({ name: "", address: "", contract_id: "", phone: "", city: "", state: "", timezone: "America/New_York" }); toast.success("Clinic created"); },
  });

  const toggleContract = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const next = status === "active" ? "suspended" : "active";
      const { error } = await supabase.from("contracts").update({ status: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts"] }),
  });

  const statusColor = (s: string) => s === "active" ? "default" : s === "suspended" ? "destructive" : "secondary";

  return (
    <div className="space-y-6">
      <Breadcrumbs />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contracts & Clinics</h1>
          <p className="text-sm text-muted-foreground">Manage organizational hierarchy</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={contractOpen} onOpenChange={setContractOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Contract</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Contract</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Start</Label><Input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} /></div>
                  <div><Label>End</Label><Input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} /></div>
                </div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
                <Button onClick={() => addContract.mutate()} disabled={!form.name}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={clinicOpen} onOpenChange={setClinicOpen}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Clinic</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Clinic</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={clinicForm.name} onChange={e => setClinicForm(p => ({ ...p, name: e.target.value }))} /></div>
                <div><Label>Address</Label><Input value={clinicForm.address} onChange={e => setClinicForm(p => ({ ...p, address: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>City</Label><Input value={clinicForm.city} onChange={e => setClinicForm(p => ({ ...p, city: e.target.value }))} /></div>
                  <div><Label>State</Label><Input value={clinicForm.state} onChange={e => setClinicForm(p => ({ ...p, state: e.target.value }))} placeholder="e.g. FL" /></div>
                </div>
                <div><Label>Phone</Label><Input value={clinicForm.phone} onChange={e => setClinicForm(p => ({ ...p, phone: e.target.value }))} placeholder="(555) 123-4567" /></div>
                <div><Label>Timezone</Label>
                  <Select value={clinicForm.timezone} onValueChange={v => setClinicForm(p => ({ ...p, timezone: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Phoenix","Pacific/Honolulu"].map(tz => <SelectItem key={tz} value={tz}>{tz.replace("America/","").replace("Pacific/","").replace(/_/g," ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Contract</Label>
                  <Select value={clinicForm.contract_id} onValueChange={v => setClinicForm(p => ({ ...p, contract_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      {contracts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => addClinic.mutate()} disabled={!clinicForm.name}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6 flex items-center gap-3"><FileText className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{contracts.length}</p><p className="text-xs text-muted-foreground">Contracts</p></div></CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3"><Building2 className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{clinics.length}</p><p className="text-xs text-muted-foreground">Clinics</p></div></CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3"><Users className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{contracts.filter(c => c.status === "active").length}</p><p className="text-xs text-muted-foreground">Active Contracts</p></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Contracts</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Status</TableHead><TableHead>Clinics</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {contracts.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{format(new Date(c.start_date), "MMM d, yyyy")}</TableCell>
                  <TableCell>{c.end_date ? format(new Date(c.end_date), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell><Badge variant={statusColor(c.status)}>{c.status}</Badge></TableCell>
                  <TableCell>{clinics.filter(cl => cl.contract_id === c.id).length}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => toggleContract.mutate({ id: c.id, status: c.status })}>{c.status === "active" ? "Suspend" : "Activate"}</Button></TableCell>
                </TableRow>
              ))}
              {contracts.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No contracts yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Clinics</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Address</TableHead><TableHead>Contract</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {clinics.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.address || "—"}</TableCell>
                  <TableCell>{(c as any).contracts?.name || "—"}</TableCell>
                  <TableCell><Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                </TableRow>
              ))}
              {clinics.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No clinics yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
