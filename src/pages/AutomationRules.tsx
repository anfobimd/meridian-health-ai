import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Zap, Pause, Play } from "lucide-react";

const TRIGGERS = [
  { value: "appointment_created", label: "Appointment Created" },
  { value: "appointment_status_changed", label: "Status Changed" },
  { value: "chart_signed", label: "Chart Signed" },
  { value: "package_purchased", label: "Package Purchased" },
  { value: "no_show", label: "No-Show Detected" },
  { value: "lab_results_ready", label: "Lab Results Ready" },
];

const ACTIONS = [
  { value: "send_sms", label: "Send SMS" },
  { value: "send_email", label: "Send Email" },
  { value: "in_app_notification", label: "In-App Notification" },
  { value: "create_task", label: "Create Task" },
];

const RECIPIENTS = [
  { value: "patient", label: "Patient" },
  { value: "provider", label: "Provider" },
  { value: "admin", label: "Admin" },
];

export default function AutomationRules() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", trigger_event: "", action_type: "", recipient_type: "patient",
    delay_minutes: "0", is_platform_rule: false,
  });

  const { data: rules = [] } = useQuery({
    queryKey: ["automation-rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("automation_rules").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addRule = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("automation_rules").insert({
        name: form.name,
        trigger_event: form.trigger_event,
        action_type: form.action_type,
        recipient_type: form.recipient_type,
        delay_minutes: parseInt(form.delay_minutes) || 0,
        is_platform_rule: form.is_platform_rule,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation-rules"] });
      setAddOpen(false);
      setForm({ name: "", trigger_event: "", action_type: "", recipient_type: "patient", delay_minutes: "0", is_platform_rule: false });
      toast.success("Rule created");
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("automation_rules").update({ is_active: !is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-rules"] }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automation_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["automation-rules"] }); toast.success("Rule deleted"); },
  });

  const triggerLabel = (v: string) => TRIGGERS.find(t => t.value === v)?.label || v;
  const actionLabel = (v: string) => ACTIONS.find(a => a.value === v)?.label || v;

  return (
    <div className="space-y-6">
      <Breadcrumbs />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automation Rules</h1>
          <p className="text-sm text-muted-foreground">Platform-wide notification and workflow automation</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New Rule</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Automation Rule</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. 48h Appointment Reminder" /></div>
              <div>
                <Label>Trigger</Label>
                <Select value={form.trigger_event} onValueChange={v => setForm(p => ({ ...p, trigger_event: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select trigger" /></SelectTrigger>
                  <SelectContent>{TRIGGERS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Action</Label>
                <Select value={form.action_type} onValueChange={v => setForm(p => ({ ...p, action_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select action" /></SelectTrigger>
                  <SelectContent>{ACTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Recipient</Label>
                <Select value={form.recipient_type} onValueChange={v => setForm(p => ({ ...p, recipient_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RECIPIENTS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Delay (minutes)</Label><Input type="number" min={0} value={form.delay_minutes} onChange={e => setForm(p => ({ ...p, delay_minutes: e.target.value }))} /></div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_platform_rule} onCheckedChange={v => setForm(p => ({ ...p, is_platform_rule: v }))} />
                <Label>Platform-wide rule (applies to all clinics)</Label>
              </div>
              <Button onClick={() => addRule.mutate()} disabled={!form.name || !form.trigger_event || !form.action_type}>Create Rule</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6 flex items-center gap-3"><Zap className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{rules.length}</p><p className="text-xs text-muted-foreground">Total Rules</p></div></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{rules.filter(r => r.is_active).length}</p><p className="text-xs text-muted-foreground">Active</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{rules.reduce((s, r) => s + r.run_count, 0)}</p><p className="text-xs text-muted-foreground">Total Runs</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Rules</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Trigger</TableHead><TableHead>Action</TableHead><TableHead>Recipient</TableHead><TableHead>Delay</TableHead><TableHead>Scope</TableHead><TableHead>Runs</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {rules.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs">{triggerLabel(r.trigger_event)}</TableCell>
                  <TableCell className="text-xs">{actionLabel(r.action_type)}</TableCell>
                  <TableCell className="capitalize text-xs">{r.recipient_type}</TableCell>
                  <TableCell className="text-xs">{r.delay_minutes > 0 ? `${r.delay_minutes}m` : "Instant"}</TableCell>
                  <TableCell><Badge variant={r.is_platform_rule ? "default" : "secondary"}>{r.is_platform_rule ? "Platform" : "Local"}</Badge></TableCell>
                  <TableCell className="text-xs">{r.run_count} ({r.success_count} ok)</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive.mutate({ id: r.id, is_active: r.is_active })}>
                      {r.is_active ? <><Pause className="h-3.5 w-3.5 mr-1" />Pause</> : <><Play className="h-3.5 w-3.5 mr-1" />Resume</>}
                    </Button>
                  </TableCell>
                  <TableCell><Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteRule.mutate(r.id)}>Delete</Button></TableCell>
                </TableRow>
              ))}
              {rules.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No automation rules yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
