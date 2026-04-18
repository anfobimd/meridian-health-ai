import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, UserPlus, Trash2, Shield, Mail, Users } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Role = "super_admin" | "admin" | "provider" | "front_desk";
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

  return (
    <div className="space-y-6">
      <Breadcrumbs />

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
                          {u.email_confirmed_at ? <Badge variant="outline" className="text-green-600">Yes</Badge> : <Badge variant="outline" className="text-orange-600">Pending</Badge>}
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
                          onClick={() => { if (confirm(`Remove ${a.email} from allowlist?`)) removeAllowMut.mutate(a.email); }}
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
    </div>
  );
}
