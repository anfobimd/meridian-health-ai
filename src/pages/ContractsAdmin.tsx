import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { Plus, Building2, FileText, Users, UserPlus, X, MapPin, Phone as PhoneIcon, Pencil, Trash2, Power, Calendar as CalendarIcon, Ban, CheckCircle2, Mail, Send } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { US_STATES, validateClinicForm, normalizeState, type FieldError } from "@/lib/clinic-validation";

export default function ContractsAdmin() {
  const qc = useQueryClient();
  const [contractOpen, setContractOpen] = useState(false);
  const [clinicOpen, setClinicOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignClinicId, setAssignClinicId] = useState("");
  const [assignProviderId, setAssignProviderId] = useState("");
  const [assignRole, setAssignRole] = useState("provider");
  const [assignPrimary, setAssignPrimary] = useState(false);
  const [assignNotify, setAssignNotify] = useState(true);
  const [assignNotifyEmailOverride, setAssignNotifyEmailOverride] = useState("");
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "", notes: "", invitation_email: "" });
  const [clinicForm, setClinicForm] = useState({ name: "", address: "", contract_id: "", phone: "", city: "", state: "", timezone: "America/New_York" });
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [editClinicOpen, setEditClinicOpen] = useState(false);
  const [editClinicId, setEditClinicId] = useState<string | null>(null);
  const [deleteClinicId, setDeleteClinicId] = useState<string | null>(null);
  const [clinicErrors, setClinicErrors] = useState<Record<string, string>>({});
  const [contractStatusFilter, setContractStatusFilter] = useState<"all" | "active" | "suspended" | "expired">("all");
  const [editContractOpen, setEditContractOpen] = useState(false);
  const [editContractId, setEditContractId] = useState<string | null>(null);

  const errorFor = (field: string): string | undefined => clinicErrors[field];
  const fieldErrorMap = (errors: FieldError[]): Record<string, string> =>
    Object.fromEntries(errors.map(e => [e.field, e.message]));

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Distinct cache key from ClinicSwitcher / MdCoverage (which both use ["clinics"]
  // with .select("id, name").eq("is_active", true)). Sharing the key was causing
  // QA #35: those summary fetches overwrote the full row data, leaving c.is_active
  // undefined and rendering every clinic as "Inactive" after a refresh.
  const { data: clinics = [] } = useQuery({
    queryKey: ["clinics", "admin-full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clinics").select("*, contracts(name)").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: providers = [] } = useQuery({
    queryKey: ["all-providers-for-assign"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name, credentials, specialty, email").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["provider-clinic-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_clinic_assignments")
        .select("*, providers(first_name, last_name, credentials, specialty, email), clinics(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addContract = useMutation({
    mutationFn: async () => {
      const inviteEmail = form.invitation_email.trim();
      if (inviteEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inviteEmail)) {
        throw new Error("Invitation email looks invalid");
      }
      const { data: inserted, error } = await supabase.from("contracts").insert({
        name: form.name,
        start_date: form.start_date || new Date().toISOString().split("T")[0],
        end_date: form.end_date || null,
        notes: form.notes || null,
        // invitation_email exists in the DB but is missing from generated types — cast to bypass.
        invitation_email: inviteEmail || null,
      } as any).select("id").single();
      if (error) throw error;

      // Auto-send invitation if email was provided.
      if (inviteEmail && inserted?.id) {
        const { error: invErr } = await supabase.functions.invoke("send-contract-invitation", {
          body: { contract_id: inserted.id, email: inviteEmail },
        });
        if (invErr) {
          // Contract was created — surface but don't undo.
          throw new Error(`Contract created, but invitation send failed: ${invErr.message}`);
        }
      }
      return { sent: !!inviteEmail };
    },
    onSuccess: ({ sent }) => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      setContractOpen(false);
      setForm({ name: "", start_date: "", end_date: "", notes: "", invitation_email: "" });
      toast.success(sent ? "Contract created and invitation sent" : "Contract created");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to create contract"),
  });

  const updateContract = useMutation({
    mutationFn: async () => {
      if (!editContractId) throw new Error("No contract selected");
      if (!form.name.trim()) throw new Error("Name is required");
      const inviteEmail = form.invitation_email.trim();
      if (inviteEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inviteEmail)) {
        throw new Error("Invitation email looks invalid");
      }
      const { error } = await supabase.from("contracts").update({
        name: form.name.trim(),
        start_date: form.start_date || new Date().toISOString().split("T")[0],
        end_date: form.end_date || null,
        notes: form.notes || null,
        // invitation_email exists in the DB but is missing from generated types — cast to bypass.
        invitation_email: inviteEmail || null,
      } as any).eq("id", editContractId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      setEditContractOpen(false);
      setEditContractId(null);
      setForm({ name: "", start_date: "", end_date: "", notes: "", invitation_email: "" });
      toast.success("Contract updated");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update contract"),
  });

  const openEditContract = (c: any) => {
    setEditContractId(c.id);
    setForm({
      name: c.name ?? "",
      start_date: c.start_date ?? "",
      end_date: c.end_date ?? "",
      notes: c.notes ?? "",
      invitation_email: c.invitation_email ?? "",
    });
    setEditContractOpen(true);
  };

  const sendContractInvitation = useMutation({
    mutationFn: async ({ contract_id, email }: { contract_id: string; email?: string }) => {
      const { error } = await supabase.functions.invoke("send-contract-invitation", {
        body: { contract_id, ...(email ? { email } : {}) },
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); toast.success("Invitation sent"); },
    onError: (e: Error) => toast.error(e.message || "Failed to send invitation"),
  });

  const addClinic = useMutation({
    mutationFn: async () => {
      const errors = validateClinicForm(clinicForm);
      if (errors.length > 0) {
        setClinicErrors(fieldErrorMap(errors));
        throw new Error(errors[0].message);
      }
      setClinicErrors({});
      const { error } = await supabase.from("clinics").insert({
        name: clinicForm.name.trim(),
        address: clinicForm.address.trim(),
        city: clinicForm.city.trim(),
        state: normalizeState(clinicForm.state),
        contract_id: clinicForm.contract_id || null,
        phone: clinicForm.phone.trim() || null,
        timezone: clinicForm.timezone || "America/New_York",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinics"] });
      setClinicOpen(false);
      setClinicForm({ name: "", address: "", contract_id: "", phone: "", city: "", state: "", timezone: "America/New_York" });
      setClinicErrors({});
      toast.success("Clinic created");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to create clinic"),
  });

  const updateClinic = useMutation({
    mutationFn: async () => {
      if (!editClinicId) throw new Error("No clinic selected");
      const errors = validateClinicForm(clinicForm);
      if (errors.length > 0) {
        setClinicErrors(fieldErrorMap(errors));
        throw new Error(errors[0].message);
      }
      setClinicErrors({});
      const { error } = await supabase.from("clinics").update({
        name: clinicForm.name.trim(),
        address: clinicForm.address.trim(),
        city: clinicForm.city.trim(),
        state: normalizeState(clinicForm.state),
        contract_id: clinicForm.contract_id || null,
        phone: clinicForm.phone.trim() || null,
        timezone: clinicForm.timezone || "America/New_York",
      }).eq("id", editClinicId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinics"] });
      setEditClinicOpen(false);
      setEditClinicId(null);
      setClinicForm({ name: "", address: "", contract_id: "", phone: "", city: "", state: "", timezone: "America/New_York" });
      setClinicErrors({});
      toast.success("Clinic updated");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update clinic"),
  });

  const toggleClinicActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("clinics").update({ is_active: !is_active }).eq("id", id);
      if (error) throw error;
      return !is_active;
    },
    onSuccess: (next) => {
      qc.invalidateQueries({ queryKey: ["clinics"] });
      toast.success(next ? "Clinic marked Active" : "Clinic marked Inactive");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update status"),
  });

  const deleteClinic = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clinics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinics"] });
      qc.invalidateQueries({ queryKey: ["provider-clinic-assignments"] });
      setDeleteClinicId(null);
      toast.success("Clinic deleted");
    },
    onError: (e: any) => {
      const msg: string = e?.message || "";
      if (msg.includes("foreign key") || msg.includes("violates") || e?.code === "23503") {
        toast.error("Can't delete clinic", {
          description: "It still has appointments or encounters tied to it. Deactivate it instead, or remove the linked records first.",
        });
      } else {
        toast.error(msg || "Failed to delete clinic");
      }
    },
  });

  const openEditClinic = (c: any) => {
    setEditClinicId(c.id);
    setClinicForm({
      name: c.name ?? "",
      address: c.address ?? "",
      contract_id: c.contract_id ?? "",
      phone: c.phone ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      timezone: c.timezone ?? "America/New_York",
    });
    setEditClinicOpen(true);
  };

  const addAssignment = useMutation({
    mutationFn: async () => {
      const overrideEmail = assignNotifyEmailOverride.trim();
      if (assignNotify && overrideEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(overrideEmail)) {
        throw new Error("Notification email looks invalid");
      }
      const { data: inserted, error } = await supabase
        .from("provider_clinic_assignments")
        .insert({
          provider_id: assignProviderId,
          clinic_id: assignClinicId,
          role_at_clinic: assignRole,
          is_primary: assignPrimary,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Optional notification (QA #34).
      if (assignNotify && inserted?.id) {
        const { error: notifyErr } = await supabase.functions.invoke("send-staff-assignment-invitation", {
          body: { assignment_id: inserted.id, ...(overrideEmail ? { email: overrideEmail } : {}) },
        });
        if (notifyErr) {
          // Assignment was created — surface but don't roll back.
          throw new Error(`Provider assigned, but notification failed: ${notifyErr.message}`);
        }
      }
      return { notified: assignNotify };
    },
    onSuccess: ({ notified }) => {
      qc.invalidateQueries({ queryKey: ["provider-clinic-assignments"] });
      setAssignOpen(false);
      setAssignProviderId(""); setAssignClinicId(""); setAssignRole("provider"); setAssignPrimary(false);
      setAssignNotify(true); setAssignNotifyEmailOverride("");
      toast.success(notified ? "Provider assigned and notified" : "Provider assigned to clinic");
    },
    onError: (e: any) => toast.error(e.message?.includes("duplicate") ? "Provider already assigned to this clinic" : e.message),
  });

  const sendAssignmentInvitation = useMutation({
    mutationFn: async ({ assignment_id, email }: { assignment_id: string; email?: string }) => {
      const { error } = await supabase.functions.invoke("send-staff-assignment-invitation", {
        body: { assignment_id, ...(email ? { email } : {}) },
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["provider-clinic-assignments"] }); toast.success("Notification sent"); },
    onError: (e: Error) => toast.error(e.message || "Failed to send notification"),
  });

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("provider_clinic_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["provider-clinic-assignments"] });
      toast.success("Assignment removed");
    },
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
  // QA #28 — display status reflects end_date even when DB still says "active".
  const effectiveStatus = (c: { status: string; end_date: string | null }): "active" | "suspended" | "expired" => {
    if (c.status === "suspended") return "suspended";
    if (c.end_date) {
      const today = new Date(new Date().setHours(0, 0, 0, 0));
      if (new Date(c.end_date) < today) return "expired";
    }
    return "active";
  };
  const effectiveStatusBadgeVariant = (s: "active" | "suspended" | "expired") =>
    s === "active" ? "default" : s === "suspended" ? "destructive" : "secondary";
  const clinicAssignments = (clinicId: string) => assignments.filter((a: any) => a.clinic_id === clinicId);

  return (
    <div className="space-y-6">
<div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contracts & Clinics</h1>
          <p className="text-sm text-muted-foreground">Manage organizational hierarchy & provider assignments</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={contractOpen} onOpenChange={setContractOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Contract</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Contract</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn("w-full justify-start text-left font-normal", !form.start_date && "text-muted-foreground")}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          {form.start_date ? format(new Date(form.start_date), "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={form.start_date ? new Date(form.start_date) : undefined}
                          onSelect={(d) => setForm(p => ({ ...p, start_date: d ? format(d, "yyyy-MM-dd") : "" }))}
                          disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1.5">
                    <Label>End</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn("w-full justify-start text-left font-normal", !form.end_date && "text-muted-foreground")}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          {form.end_date ? format(new Date(form.end_date), "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={form.end_date ? new Date(form.end_date) : undefined}
                          onSelect={(d) => setForm(p => ({ ...p, end_date: d ? format(d, "yyyy-MM-dd") : "" }))}
                          disabled={(d) => {
                            const today = new Date(new Date().setHours(0, 0, 0, 0));
                            const minDate = form.start_date ? new Date(form.start_date) : today;
                            return d < minDate;
                          }}
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    Invitation email <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    type="email"
                    value={form.invitation_email}
                    onChange={e => setForm(p => ({ ...p, invitation_email: e.target.value }))}
                    placeholder="counterparty@example.com"
                    inputMode="email"
                  />
                  <p className="text-[11px] text-muted-foreground">If filled, an invitation email with the contract details is sent automatically when you create the contract. You can resend later from the Contracts table.</p>
                </div>
                <Button onClick={() => addContract.mutate()} disabled={!form.name || addContract.isPending}>
                  {addContract.isPending ? "Creating…" : "Create"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={clinicOpen} onOpenChange={(o) => { setClinicOpen(o); if (!o) setClinicErrors({}); }}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Clinic</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Clinic</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={clinicForm.name}
                    onChange={e => { setClinicForm(p => ({ ...p, name: e.target.value })); if (clinicErrors.name) setClinicErrors(p => ({ ...p, name: "" })); }}
                    aria-invalid={!!errorFor("name")}
                    className={errorFor("name") ? "border-destructive focus-visible:ring-destructive" : ""}
                    required
                  />
                  {errorFor("name") && <p className="mt-1 text-xs text-destructive">{errorFor("name")}</p>}
                </div>
                <div>
                  <Label>Address <span className="text-destructive">*</span></Label>
                  <Input
                    value={clinicForm.address}
                    onChange={e => { setClinicForm(p => ({ ...p, address: e.target.value })); if (clinicErrors.address) setClinicErrors(p => ({ ...p, address: "" })); }}
                    placeholder="123 Main St"
                    aria-invalid={!!errorFor("address")}
                    className={errorFor("address") ? "border-destructive focus-visible:ring-destructive" : ""}
                    required
                  />
                  {errorFor("address") && <p className="mt-1 text-xs text-destructive">{errorFor("address")}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>City <span className="text-destructive">*</span></Label>
                    <Input
                      value={clinicForm.city}
                      onChange={e => { setClinicForm(p => ({ ...p, city: e.target.value })); if (clinicErrors.city) setClinicErrors(p => ({ ...p, city: "" })); }}
                      aria-invalid={!!errorFor("city")}
                      className={errorFor("city") ? "border-destructive focus-visible:ring-destructive" : ""}
                      required
                    />
                    {errorFor("city") && <p className="mt-1 text-xs text-destructive">{errorFor("city")}</p>}
                  </div>
                  <div>
                    <Label>State <span className="text-destructive">*</span></Label>
                    <Input
                      list="us-states-list"
                      value={clinicForm.state}
                      onChange={e => { setClinicForm(p => ({ ...p, state: e.target.value })); if (clinicErrors.state) setClinicErrors(p => ({ ...p, state: "" })); }}
                      placeholder="e.g. FL or Florida"
                      maxLength={32}
                      aria-invalid={!!errorFor("state")}
                      className={errorFor("state") ? "border-destructive focus-visible:ring-destructive" : ""}
                      required
                    />
                    {errorFor("state") && <p className="mt-1 text-xs text-destructive">{errorFor("state")}</p>}
                  </div>
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={clinicForm.phone}
                    onChange={e => { setClinicForm(p => ({ ...p, phone: e.target.value })); if (clinicErrors.phone) setClinicErrors(p => ({ ...p, phone: "" })); }}
                    placeholder="(555) 123-4567"
                    inputMode="tel"
                    aria-invalid={!!errorFor("phone")}
                    className={errorFor("phone") ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {errorFor("phone") && <p className="mt-1 text-xs text-destructive">{errorFor("phone")}</p>}
                </div>
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
                <Button
                  onClick={() => addClinic.mutate()}
                  disabled={
                    !clinicForm.name.trim() ||
                    !clinicForm.address.trim() ||
                    !clinicForm.city.trim() ||
                    !clinicForm.state.trim() ||
                    addClinic.isPending
                  }
                >
                  {addClinic.isPending ? "Creating…" : "Create"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={assignOpen} onOpenChange={(o) => { setAssignOpen(o); if (!o) { setAssignNotify(true); setAssignNotifyEmailOverride(""); } }}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><UserPlus className="h-4 w-4 mr-1" />Assign Provider</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Assign Provider to Clinic</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Provider</Label>
                  <Select value={assignProviderId} onValueChange={setAssignProviderId}>
                    <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                    <SelectContent>
                      {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.last_name}, {p.first_name}{p.credentials ? ` (${p.credentials})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Clinic</Label>
                  <Select value={assignClinicId} onValueChange={setAssignClinicId}>
                    <SelectTrigger><SelectValue placeholder="Select clinic" /></SelectTrigger>
                    <SelectContent>
                      {clinics.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Role at Clinic</Label>
                  <Select value={assignRole} onValueChange={setAssignRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["provider","injector","aesthetician","front_desk","manager","medical_director"].map(r => (
                        <SelectItem key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={assignPrimary} onChange={e => setAssignPrimary(e.target.checked)} className="rounded" />
                  Primary clinic for this provider
                </label>
                {/* QA #34 — optional staff notification email */}
                {(() => {
                  const selectedProvider = providers.find(p => p.id === assignProviderId);
                  const providerEmail = selectedProvider?.email ?? null;
                  const willSendTo = assignNotifyEmailOverride.trim() || providerEmail || "";
                  return (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={assignNotify}
                          onChange={e => setAssignNotify(e.target.checked)}
                          className="rounded"
                        />
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        Send email notification to provider
                      </label>
                      {assignNotify && (
                        <div className="pl-6 space-y-1.5">
                          <Input
                            type="email"
                            value={assignNotifyEmailOverride}
                            onChange={e => setAssignNotifyEmailOverride(e.target.value)}
                            placeholder={providerEmail || "provider@example.com"}
                            inputMode="email"
                            className="h-8 text-xs"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            {assignNotifyEmailOverride.trim()
                              ? `Will send to ${willSendTo} (overrides provider's email on file)`
                              : providerEmail
                                ? `Will send to ${providerEmail} (provider's email on file)`
                                : "Provider has no email on file — enter one above or uncheck to skip notification"}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <Button
                  onClick={() => addAssignment.mutate()}
                  disabled={
                    !assignProviderId ||
                    !assignClinicId ||
                    addAssignment.isPending ||
                    (assignNotify
                      && !assignNotifyEmailOverride.trim()
                      && !providers.find(p => p.id === assignProviderId)?.email)
                  }
                >
                  {addAssignment.isPending ? "Assigning…" : (assignNotify ? "Assign & Notify" : "Assign")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 flex items-center gap-3"><FileText className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{contracts.length}</p><p className="text-xs text-muted-foreground">Contracts</p></div></CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3"><Building2 className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{clinics.length}</p><p className="text-xs text-muted-foreground">Clinics</p></div></CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3"><Users className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{assignments.length}</p><p className="text-xs text-muted-foreground">Assignments</p></div></CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3"><FileText className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{contracts.filter(c => effectiveStatus(c) === "active").length}</p><p className="text-xs text-muted-foreground">Active Contracts</p></div></CardContent></Card>
      </div>

      <Tabs defaultValue="contracts">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="clinics">Clinics & Staff</TabsTrigger>
          <TabsTrigger value="assignments">All Assignments</TabsTrigger>
        </TabsList>

        <TabsContent value="contracts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Contracts</CardTitle>
              <Button size="sm" onClick={() => setContractOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />Add Contract
              </Button>
            </CardHeader>
            <CardContent>
              {/* QA #30 — status filter so suspended / expired contracts are reachable */}
              <div className="flex items-center gap-1 mb-4 flex-wrap">
                {(["all", "active", "suspended", "expired"] as const).map((f) => {
                  const count = f === "all"
                    ? contracts.length
                    : contracts.filter(c => effectiveStatus(c) === f).length;
                  return (
                    <Button
                      key={f}
                      size="sm"
                      variant={contractStatusFilter === f ? "default" : "outline"}
                      onClick={() => setContractStatusFilter(f)}
                      className="h-7 text-xs capitalize"
                    >
                      {f} <span className="ml-1.5 opacity-70">({count})</span>
                    </Button>
                  );
                })}
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Status</TableHead><TableHead>Invitation</TableHead><TableHead>Clinics</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {contracts
                    .filter(c => contractStatusFilter === "all" || effectiveStatus(c) === contractStatusFilter)
                    .map(c => {
                      const eff = effectiveStatus(c);
                      const isExpired = eff === "expired";
                      const inviteCount = (c as any).invitation_count ?? 0;
                      const inviteEmail = (c as any).invitation_email as string | null;
                      const inviteSentAt = (c as any).invitation_sent_at as string | null;
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell>{format(new Date(c.start_date), "MMM d, yyyy")}</TableCell>
                          <TableCell>{c.end_date ? format(new Date(c.end_date), "MMM d, yyyy") : "—"}</TableCell>
                          <TableCell>
                            <Badge variant={effectiveStatusBadgeVariant(eff)} className="capitalize">{eff}</Badge>
                          </TableCell>
                          <TableCell>
                            {inviteCount === 0 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const email = inviteEmail || prompt("Send invitation to which email?")?.trim();
                                  if (!email) return;
                                  sendContractInvitation.mutate({ contract_id: c.id, email });
                                }}
                                disabled={sendContractInvitation.isPending}
                                title="Send the invitation email for this contract"
                              >
                                <Send className="h-3.5 w-3.5 mr-1.5" />Send Invitation
                              </Button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="gap-1" title={inviteSentAt ? `Last sent ${format(new Date(inviteSentAt), "PPp")}` : ""}>
                                  <Mail className="h-3 w-3" />
                                  Sent {inviteCount > 1 ? `${inviteCount}×` : ""}
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => {
                                    const email = inviteEmail || prompt("Resend invitation to which email?")?.trim();
                                    if (!email) return;
                                    sendContractInvitation.mutate({ contract_id: c.id, email });
                                  }}
                                  disabled={sendContractInvitation.isPending}
                                  title={inviteEmail ? `Resend to ${inviteEmail}` : "Resend invitation"}
                                >
                                  Resend
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{clinics.filter(cl => cl.contract_id === c.id).length}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEditContract(c)}
                                title="Edit contract"
                                aria-label="Edit contract"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {isExpired ? (
                                <span className="text-xs text-muted-foreground italic">Past end date</span>
                              ) : c.status === "active" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => toggleContract.mutate({ id: c.id, status: c.status })}
                                  title="Pause this contract — clinics under it stop being treated as active"
                                >
                                  <Ban className="h-3.5 w-3.5 mr-1.5" />Suspend
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => toggleContract.mutate({ id: c.id, status: c.status })}
                                  title="Reactivate this contract"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Activate
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  {contracts.filter(c => contractStatusFilter === "all" || effectiveStatus(c) === contractStatusFilter).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <div className="flex flex-col items-center gap-3">
                          <p className="text-sm text-muted-foreground">
                            {contracts.length === 0
                              ? "No contracts yet"
                              : `No ${contractStatusFilter} contracts`}
                          </p>
                          <Button size="sm" onClick={() => setContractOpen(true)}>
                            <Plus className="h-4 w-4 mr-1" />Add Contract
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clinics" className="space-y-4">
          {clinics.map(c => {
            const ca = clinicAssignments(c.id);
            return (
              <Card key={c.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        {c.name}
                        <Badge variant={c.is_active ? "default" : "secondary"} className="text-[10px]">{c.is_active ? "Active" : "Inactive"}</Badge>
                      </CardTitle>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {((c as any).city || (c as any).state) && (
                          <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{[(c as any).city, (c as any).state].filter(Boolean).join(", ")}</span>
                        )}
                        {(c as any).phone && (
                          <span className="flex items-center gap-0.5"><PhoneIcon className="h-3 w-3" />{(c as any).phone}</span>
                        )}
                        {(c as any).contracts?.name && <span>Contract: {(c as any).contracts.name}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => { setAssignClinicId(c.id); setAssignOpen(true); }}>
                        <UserPlus className="h-3 w-3 mr-1" />Add Staff
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEditClinic(c)} title="Edit clinic" aria-label="Edit clinic">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleClinicActive.mutate({ id: c.id, is_active: !!(c as any).is_active })}
                        title={(c as any).is_active ? "Deactivate clinic" : "Activate clinic"}
                        aria-label={(c as any).is_active ? "Deactivate clinic" : "Activate clinic"}
                      >
                        <Power className={`h-3.5 w-3.5 ${(c as any).is_active ? "" : "text-muted-foreground"}`} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteClinicId(c.id)}
                        title="Delete clinic"
                        aria-label="Delete clinic"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {ca.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 text-center">No providers assigned</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {ca.map((a: any) => {
                        const notifyCount = a.notification_count ?? 0;
                        const providerEmail = a.providers?.email as string | null;
                        return (
                          <div key={a.id} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs">
                            <span className="font-medium">{a.providers?.first_name} {a.providers?.last_name}</span>
                            {a.providers?.credentials && <span className="text-muted-foreground">{a.providers.credentials}</span>}
                            <Badge variant="outline" className="text-[9px] px-1">{a.role_at_clinic?.replace(/_/g, " ")}</Badge>
                            {a.is_primary && <Badge className="text-[9px] px-1">Primary</Badge>}
                            {notifyCount > 0 && (
                              <Badge variant="secondary" className="text-[9px] px-1 gap-0.5" title={a.notification_sent_at ? `Last sent ${format(new Date(a.notification_sent_at), "PPp")}` : ""}>
                                <Mail className="h-2.5 w-2.5" />
                                Sent {notifyCount > 1 ? `${notifyCount}×` : ""}
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 shrink-0"
                              onClick={() => {
                                const email = providerEmail || prompt("Send notification to which email?")?.trim();
                                if (!email) return;
                                sendAssignmentInvitation.mutate({ assignment_id: a.id, email });
                              }}
                              disabled={sendAssignmentInvitation.isPending}
                              title={notifyCount > 0 ? "Resend assignment notification" : "Send assignment notification"}
                              aria-label={notifyCount > 0 ? "Resend notification" : "Send notification"}
                            >
                              <Send className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => removeAssignment.mutate(a.id)} title="Remove from clinic">
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {clinics.length === 0 && (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No clinics yet</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="assignments">
          <Card>
            <CardHeader><CardTitle>Provider Assignments</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Clinic</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Primary</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {a.providers?.first_name} {a.providers?.last_name}
                        {a.providers?.credentials ? `, ${a.providers.credentials}` : ""}
                      </TableCell>
                      <TableCell>{a.clinics?.name || "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{a.role_at_clinic?.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell>{a.is_primary ? <Badge className="text-[10px]">Primary</Badge> : "—"}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => removeAssignment.mutate(a.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {assignments.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No assignments yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Contract Dialog (QA #33) */}
      <Dialog open={editContractOpen} onOpenChange={(o) => { setEditContractOpen(o); if (!o) { setEditContractId(null); setForm({ name: "", start_date: "", end_date: "", notes: "", invitation_email: "" }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Contract</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !form.start_date && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      {form.start_date ? format(new Date(form.start_date), "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.start_date ? new Date(form.start_date) : undefined}
                      onSelect={(d) => setForm(p => ({ ...p, start_date: d ? format(d, "yyyy-MM-dd") : "" }))}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !form.end_date && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      {form.end_date ? format(new Date(form.end_date), "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.end_date ? new Date(form.end_date) : undefined}
                      onSelect={(d) => setForm(p => ({ ...p, end_date: d ? format(d, "yyyy-MM-dd") : "" }))}
                      disabled={(d) => {
                        const minDate = form.start_date ? new Date(form.start_date) : null;
                        return !!minDate && d < minDate;
                      }}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                Invitation email <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                type="email"
                value={form.invitation_email}
                onChange={e => setForm(p => ({ ...p, invitation_email: e.target.value }))}
                placeholder="counterparty@example.com"
                inputMode="email"
              />
              <p className="text-[11px] text-muted-foreground">Saved with the contract; use the Resend button on the row to actually send.</p>
            </div>
            <Button onClick={() => updateContract.mutate()} disabled={!form.name.trim() || updateContract.isPending}>
              {updateContract.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Clinic Dialog */}
      <Dialog open={editClinicOpen} onOpenChange={(o) => { setEditClinicOpen(o); if (!o) { setEditClinicId(null); setClinicForm({ name: "", address: "", contract_id: "", phone: "", city: "", state: "", timezone: "America/New_York" }); setClinicErrors({}); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Clinic</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                value={clinicForm.name}
                onChange={e => { setClinicForm(p => ({ ...p, name: e.target.value })); if (clinicErrors.name) setClinicErrors(p => ({ ...p, name: "" })); }}
                aria-invalid={!!errorFor("name")}
                className={errorFor("name") ? "border-destructive focus-visible:ring-destructive" : ""}
                required
              />
              {errorFor("name") && <p className="mt-1 text-xs text-destructive">{errorFor("name")}</p>}
            </div>
            <div>
              <Label>Address <span className="text-destructive">*</span></Label>
              <Input
                value={clinicForm.address}
                onChange={e => { setClinicForm(p => ({ ...p, address: e.target.value })); if (clinicErrors.address) setClinicErrors(p => ({ ...p, address: "" })); }}
                placeholder="123 Main St"
                aria-invalid={!!errorFor("address")}
                className={errorFor("address") ? "border-destructive focus-visible:ring-destructive" : ""}
                required
              />
              {errorFor("address") && <p className="mt-1 text-xs text-destructive">{errorFor("address")}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>City <span className="text-destructive">*</span></Label>
                <Input
                  value={clinicForm.city}
                  onChange={e => { setClinicForm(p => ({ ...p, city: e.target.value })); if (clinicErrors.city) setClinicErrors(p => ({ ...p, city: "" })); }}
                  aria-invalid={!!errorFor("city")}
                  className={errorFor("city") ? "border-destructive focus-visible:ring-destructive" : ""}
                  required
                />
                {errorFor("city") && <p className="mt-1 text-xs text-destructive">{errorFor("city")}</p>}
              </div>
              <div>
                <Label>State <span className="text-destructive">*</span></Label>
                <Input
                  list="us-states-list"
                  value={clinicForm.state}
                  onChange={e => { setClinicForm(p => ({ ...p, state: e.target.value })); if (clinicErrors.state) setClinicErrors(p => ({ ...p, state: "" })); }}
                  placeholder="e.g. FL or Florida"
                  maxLength={32}
                  aria-invalid={!!errorFor("state")}
                  className={errorFor("state") ? "border-destructive focus-visible:ring-destructive" : ""}
                  required
                />
                {errorFor("state") && <p className="mt-1 text-xs text-destructive">{errorFor("state")}</p>}
              </div>
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={clinicForm.phone}
                onChange={e => { setClinicForm(p => ({ ...p, phone: e.target.value })); if (clinicErrors.phone) setClinicErrors(p => ({ ...p, phone: "" })); }}
                placeholder="(555) 123-4567"
                inputMode="tel"
                aria-invalid={!!errorFor("phone")}
                className={errorFor("phone") ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {errorFor("phone") && <p className="mt-1 text-xs text-destructive">{errorFor("phone")}</p>}
            </div>
            <div>
              <Label>Timezone</Label>
              <Select value={clinicForm.timezone} onValueChange={v => setClinicForm(p => ({ ...p, timezone: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Phoenix","Pacific/Honolulu"].map(tz => <SelectItem key={tz} value={tz}>{tz.replace("America/","").replace("Pacific/","").replace(/_/g," ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Contract</Label>
              <Select value={clinicForm.contract_id || "__none__"} onValueChange={v => setClinicForm(p => ({ ...p, contract_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {contracts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => updateClinic.mutate()}
              disabled={
                !clinicForm.name.trim() ||
                !clinicForm.address.trim() ||
                !clinicForm.city.trim() ||
                !clinicForm.state.trim() ||
                updateClinic.isPending
              }
            >
              {updateClinic.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Clinic Confirmation */}
      <AlertDialog open={!!deleteClinicId} onOpenChange={(o) => { if (!o) setDeleteClinicId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this clinic?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the clinic and all of its provider assignments. Appointments and encounters tied to it must be removed first, otherwise the deletion will fail. Consider deactivating the clinic instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (deleteClinicId) deleteClinic.mutate(deleteClinicId); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteClinic.isPending ? "Deleting…" : "Delete clinic"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Shared US-states datalist used by both New / Edit Clinic State inputs */}
      <datalist id="us-states-list">
        {US_STATES.map(s => (
          <option key={s.code} value={s.code}>{s.name}</option>
        ))}
        {US_STATES.map(s => (
          <option key={`${s.code}-name`} value={s.name} />
        ))}
      </datalist>
    </div>
  );
}
