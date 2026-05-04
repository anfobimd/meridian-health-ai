import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, UserPlus, Trash2, Shield, Mail, Users, Send, FileText, Building2 } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";

type Role = "super_admin" | "admin" | "provider" | "front_desk";

// QA #59 — invitations expire visually after this many days with no acceptance.
// (Doesn't actually disable the link — that's an onboarding-flow concern.)
const INVITATION_TTL_DAYS = 30;

type InvitationKind = "contract" | "contract-admin" | "staff";
type InvitationStatus = "accepted" | "pending" | "expired" | "never_sent";

interface InvitationRow {
  key: string;
  kind: InvitationKind;
  email: string;
  recipientLabel: string;     // "John Smith" or "—"
  contextLabel: string;       // e.g. "SoCal Wellness Partners" or "Meridian — La Jolla"
  sentAt: string | null;
  count: number;
  status: InvitationStatus;
  // Identifiers used by the resend mutation
  contractId?: string;
  assignmentId?: string;
}
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "provider", label: "Provider" },
  { value: "front_desk", label: "Front Desk" },
];

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  roles: string[];
}

interface AllowlistRow {
  email: string;
  added_at: string;
  notes: string | null;
}

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("front_desk");
  const [allowEmail, setAllowEmail] = useState("");
  const [allowNotes, setAllowNotes] = useState("");
  const [removeAllowEmail, setRemoveAllowEmail] = useState<string | null>(null);

  // ── Users ──
  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ["admin-users-list"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-users", { body: { action: "list" } });
      if (error) throw error;
      return (data?.users ?? []) as UserRow[];
    },
  });

  // ── Allowlist ──
  const { data: allowlist } = useQuery({
    queryKey: ["admin-allowlist"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-users", { body: { action: "allowlist_list" } });
      if (error) throw error;
      return (data?.allowlist ?? []) as AllowlistRow[];
    },
  });

  // ── Invitations (QA #59) ──
  // Pulls counter-party invitations, contract-admin invitations, and staff
  // assignment invitations into one list, then derives a status by checking
  // the invited email against the existing auth users.
  const { data: contractInvites } = useQuery({
    queryKey: ["admin-contract-invites"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id, name, invitation_email, invitation_sent_at, invitation_count, admin_email, admin_name, admin_invited_at, admin_invitation_count");
      return data ?? [];
    },
  });

  const { data: staffInvites } = useQuery({
    queryKey: ["admin-staff-invites"],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_clinic_assignments")
        .select("id, notification_sent_at, notification_count, providers(first_name, last_name, email), clinics(name)")
        .gt("notification_count", 0);
      return data ?? [];
    },
  });

  const resendInviteMut = useMutation({
    mutationFn: async (row: InvitationRow) => {
      if (row.kind === "contract") {
        const { error } = await supabase.functions.invoke("send-contract-invitation", {
          body: { contract_id: row.contractId, email: row.email },
        });
        if (error) throw error;
      } else if (row.kind === "contract-admin") {
        const { error } = await supabase.functions.invoke("send-contract-admin-invitation", {
          body: { contract_id: row.contractId, email: row.email, name: row.recipientLabel || undefined },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.functions.invoke("send-staff-assignment-invitation", {
          body: { assignment_id: row.assignmentId, email: row.email },
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Invitation resent");
      queryClient.invalidateQueries({ queryKey: ["admin-contract-invites"] });
      queryClient.invalidateQueries({ queryKey: ["admin-staff-invites"] });
    },
    onError: (e: Error) => toast.error(e.message || "Resend failed"),
  });

  // ── Mutations ──
  const setRoleMut = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: Role }) => {
      const { error } = await supabase.functions.invoke("admin-users", { body: { action: "set_role", user_id, role } });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role updated"); queryClient.invalidateQueries({ queryKey: ["admin-users-list"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "send_invite",
          email: inviteEmail.trim(),
          role: inviteRole,
          redirect_url: `${window.location.origin}/auth`,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-users-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addAllowMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("admin-users", {
        body: { action: "allowlist_add", email: allowEmail.trim(), notes: allowNotes.trim() || null },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added to super admin allowlist");
      setAllowEmail("");
      setAllowNotes("");
      queryClient.invalidateQueries({ queryKey: ["admin-allowlist"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAllowMut = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.functions.invoke("admin-users", {
        body: { action: "allowlist_remove", email },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from allowlist");
      queryClient.invalidateQueries({ queryKey: ["admin-allowlist"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleBadgeVariant = (role: string) => {
    if (role === "super_admin") return "default";
    if (role === "admin") return "secondary";
    return "outline";
  };

  // Build the unified invitation list with derived status.
  const invitationRows: InvitationRow[] = (() => {
    const userEmails = new Set((users ?? []).map(u => (u.email || "").toLowerCase()));
    const statusFor = (email: string, sentAt: string | null): InvitationStatus => {
      if (email && userEmails.has(email.toLowerCase())) return "accepted";
      if (!sentAt) return "never_sent";
      return differenceInDays(new Date(), new Date(sentAt)) > INVITATION_TTL_DAYS ? "expired" : "pending";
    };
    const rows: InvitationRow[] = [];
    for (const c of (contractInvites as any[]) ?? []) {
      if (c.invitation_email) {
        rows.push({
          key: `contract:${c.id}`,
          kind: "contract",
          email: c.invitation_email,
          recipientLabel: "—",
          contextLabel: c.name,
          sentAt: c.invitation_sent_at ?? null,
          count: c.invitation_count ?? 0,
          status: statusFor(c.invitation_email, c.invitation_sent_at),
          contractId: c.id,
        });
      }
      if (c.admin_email) {
        rows.push({
          key: `contract-admin:${c.id}`,
          kind: "contract-admin",
          email: c.admin_email,
          recipientLabel: c.admin_name ?? "—",
          contextLabel: c.name,
          sentAt: c.admin_invited_at ?? null,
          count: c.admin_invitation_count ?? 0,
          status: statusFor(c.admin_email, c.admin_invited_at),
          contractId: c.id,
        });
      }
    }
    for (const a of (staffInvites as any[]) ?? []) {
      const email = a.providers?.email ?? "";
      if (!email) continue;
      const name = `${a.providers?.first_name ?? ""} ${a.providers?.last_name ?? ""}`.trim() || "—";
      rows.push({
        key: `staff:${a.id}`,
        kind: "staff",
        email,
        recipientLabel: name,
        contextLabel: a.clinics?.name ?? "—",
        sentAt: a.notification_sent_at ?? null,
        count: a.notification_count ?? 0,
        status: statusFor(email, a.notification_sent_at),
        assignmentId: a.id,
      });
    }
    // Sort: pending first, then expired, then accepted; within each group newest first.
    const order: Record<InvitationStatus, number> = { pending: 0, expired: 1, never_sent: 2, accepted: 3 };
    rows.sort((x, y) => {
      const o = order[x.status] - order[y.status];
      if (o !== 0) return o;
      const xTime = x.sentAt ? new Date(x.sentAt).getTime() : 0;
      const yTime = y.sentAt ? new Date(y.sentAt).getTime() : 0;
      return yTime - xTime;
    });
    return rows;
  })();

  const invitationStatusBadge = (s: InvitationStatus) => {
    if (s === "accepted") return <Badge variant="outline" className="text-success border-success/40">Accepted</Badge>;
    if (s === "pending") return <Badge variant="outline" className="text-warning border-warning/40">Pending</Badge>;
    if (s === "expired") return <Badge variant="outline" className="text-destructive border-destructive/40">Expired</Badge>;
    return <Badge variant="outline">Not sent</Badge>;
  };
  const invitationKindLabel = (k: InvitationKind) =>
    k === "contract" ? "Contract" : k === "contract-admin" ? "Contract Admin" : "Staff";
  const invitationKindIcon = (k: InvitationKind) =>
    k === "contract" ? <FileText className="h-3.5 w-3.5" /> : k === "contract-admin" ? <Shield className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />;

  return (
    <div className="space-y-6">
<div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" /> User Management
          </h1>
          <p className="text-muted-foreground">Manage staff accounts, roles, and the super admin allowlist.</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1" /> Invite User
        </Button>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users"><Users className="h-4 w-4 mr-1" /> Users</TabsTrigger>
          <TabsTrigger value="invitations"><Mail className="h-4 w-4 mr-1" /> Invitations ({invitationRows.length})</TabsTrigger>
          <TabsTrigger value="allowlist"><Shield className="h-4 w-4 mr-1" /> Super Admin Allowlist</TabsTrigger>
        </TabsList>

        {/* ─── USERS TAB ─── */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Users ({users?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingUsers ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !users?.length ? (
                <div className="text-center py-12 text-muted-foreground">No users yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Last sign in</TableHead>
                      <TableHead>Confirmed</TableHead>
                      <TableHead className="text-right">Change role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.email}</TableCell>
                        <TableCell className="space-x-1">
                          {u.roles.length ? u.roles.map(r => (
                            <Badge key={r} variant={roleBadgeVariant(r)}>{r}</Badge>
                          )) : <span className="text-muted-foreground text-xs">none</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(u.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {u.last_sign_in_at ? format(new Date(u.last_sign_in_at), "MMM d, h:mm a") : "Never"}
                        </TableCell>
                        <TableCell>
                          {u.email_confirmed_at ? <Badge variant="outline" className="text-success">Yes</Badge> : <Badge variant="outline" className="text-warning">Pending</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Select
                            value={u.roles[0] || ""}
                            onValueChange={(v) => setRoleMut.mutate({ user_id: u.id, role: v as Role })}
                          >
                            <SelectTrigger className="w-[140px] h-8"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              {ROLE_OPTIONS.map(r => (
                                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── INVITATIONS TAB (QA #59) ─── */}
        <TabsContent value="invitations">
          <Card>
            <CardHeader>
              <CardTitle>Invitations</CardTitle>
              <p className="text-sm text-muted-foreground">
                Status of every invitation sent — counter-party, contract admin, and clinic staff. "Pending"
                turns to "Expired" after {INVITATION_TTL_DAYS} days with no acceptance. "Accepted" means the
                invited email has signed up.
              </p>
            </CardHeader>
            <CardContent>
              {invitationRows.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No invitations sent yet. Use the Contracts and Clinics & Staff sections to invite users.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Context</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last sent</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitationRows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell>
                          <div className="text-sm font-medium">{row.email}</div>
                          {row.recipientLabel && row.recipientLabel !== "—" && (
                            <div className="text-xs text-muted-foreground">{row.recipientLabel}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="gap-1 text-xs">
                            {invitationKindIcon(row.kind)} {invitationKindLabel(row.kind)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{row.contextLabel}</TableCell>
                        <TableCell>{invitationStatusBadge(row.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.sentAt ? format(new Date(row.sentAt), "MMM d, yyyy 'at' h:mm a") : "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{row.count}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1"
                            disabled={row.status === "accepted" || resendInviteMut.isPending}
                            onClick={() => resendInviteMut.mutate(row)}
                            title={row.status === "accepted" ? "Already accepted — no need to resend" : "Resend invitation"}
                          >
                            <Send className="h-3 w-3" />
                            Resend
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── ALLOWLIST TAB ─── */}
        <TabsContent value="allowlist">
          <Card>
            <CardHeader>
              <CardTitle>Super Admin Allowlist</CardTitle>
              <p className="text-sm text-muted-foreground">
                Emails on this list are automatically promoted to Super Admin when they sign up (or immediately if they already have an account).
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>Email to add</Label>
                  <Input value={allowEmail} onChange={e => setAllowEmail(e.target.value)} placeholder="user@clinic.com" type="email" />
                </div>
                <div className="flex-1">
                  <Label>Notes (optional)</Label>
                  <Input value={allowNotes} onChange={e => setAllowNotes(e.target.value)} placeholder="QA tester, developer, etc." />
                </div>
                <Button
                  onClick={() => addAllowMut.mutate()}
                  disabled={!allowEmail || addAllowMut.isPending}
                >
                  {addAllowMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(allowlist ?? []).map(a => (
                    <TableRow key={a.email}>
                      <TableCell className="font-medium">{a.email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.notes || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(a.added_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${a.email} from allowlist`}
                          onClick={() => setRemoveAllowEmail(a.email)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Invite Dialog ─── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>
              Send an email invite. The recipient will be prompted to set a password and land on your app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Email</Label>
              <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} type="email" placeholder="user@clinic.com" />
            </div>
            <div>
              <Label>Initial Role</Label>
              <Select value={inviteRole} onValueChange={v => setInviteRole(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={() => inviteMut.mutate()} disabled={!inviteEmail || inviteMut.isPending}>
              {inviteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Mail className="h-4 w-4 mr-1" />}
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove-from-allowlist confirmation. Replaces native confirm() so it
          inherits theme, dark mode, focus trap, and Escape handling. */}
      <AlertDialog
        open={removeAllowEmail !== null}
        onOpenChange={(open) => { if (!open) setRemoveAllowEmail(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from allowlist?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeAllowEmail ? (
                <>
                  <span className="font-medium text-foreground">{removeAllowEmail}</span>{" "}
                  will no longer be able to sign up or be invited unless re-added.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeAllowEmail) removeAllowMut.mutate(removeAllowEmail);
                setRemoveAllowEmail(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
