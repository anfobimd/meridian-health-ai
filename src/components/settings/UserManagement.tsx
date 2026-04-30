import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Loader2, Link2, Unlink, Search, ChevronLeft, ChevronRight, Pencil, Check as CheckIcon, X as XIcon } from "lucide-react";

type AppRole =
  | "super_admin"
  | "admin"
  | "clinic_owner"
  | "medical_director"
  | "physician"
  | "nurse_practitioner"
  | "physician_assistant"
  | "registered_nurse"
  | "provider"
  | "aesthetician"
  | "front_desk"
  | "billing"
  | "marketing"
  | "user";

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "No role" },
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "clinic_owner", label: "Clinic Owner" },
  { value: "medical_director", label: "Medical Director" },
  { value: "physician", label: "Physician" },
  { value: "nurse_practitioner", label: "Nurse Practitioner" },
  { value: "physician_assistant", label: "Physician Assistant" },
  { value: "registered_nurse", label: "Registered Nurse" },
  { value: "provider", label: "Provider" },
  { value: "aesthetician", label: "Aesthetician" },
  { value: "front_desk", label: "Front Desk" },
  { value: "billing", label: "Billing" },
  { value: "marketing", label: "Marketing" },
  { value: "user", label: "User" },
];

interface UserRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: AppRole | null;
}

interface ProviderOption {
  id: string;
  name: string;
  user_id: string | null;
}

const PAGE_SIZE = 15;

export function UserManagement() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState<string>("");

  // Inline name editing — QA #6 secondary: super admin / admin users
  // expected to edit display names from this table, not just their own.
  const [editingNameFor, setEditingNameFor] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState<string>("");
  const [savingName, setSavingName] = useState<string | null>(null);

  // Confirmation dialog
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Pull the full user list + emails + roles from the admin-users edge
      // function (service-role). The prior implementation read only the
      // profiles table and hardcoded email to null, so searching by email
      // returned zero results — QA #6 reopened because Faz couldn't find
      // himself by `testerfz69@gmail.com`.
      const [adminRes, providersRes, profilesRes] = await Promise.all([
        supabase.functions.invoke("admin-users", { body: { action: "list" } }),
        supabase.from("providers").select("id, first_name, last_name, user_id"),
        supabase.from("profiles").select("user_id, display_name"),
      ]);

      // Build a display_name map from profiles (auth.users has no name).
      const nameMap = new Map<string, string | null>();
      for (const p of (profilesRes.data ?? [])) {
        nameMap.set(p.user_id, p.display_name);
      }

      type AdminUser = { id: string; email: string | null; roles: string[] };
      const rows: UserRow[] = [];
      if (adminRes.error || adminRes.data?.error) {
        // Fall back to the old profiles-only shape if the edge function
        // isn't deployed / caller isn't super_admin. Better than nothing.
        const rolesRes = await supabase.from("user_roles").select("user_id, role");
        const roleMap = new Map((rolesRes.data ?? []).map((r) => [r.user_id, r.role as AppRole]));
        for (const p of (profilesRes.data ?? [])) {
          rows.push({
            user_id: p.user_id,
            display_name: p.display_name,
            email: null,
            role: roleMap.get(p.user_id) ?? null,
          });
        }
      } else {
        for (const u of (adminRes.data?.users ?? []) as AdminUser[]) {
          // Pick the single highest-privilege role for the badge. The
          // admin-users function returns an array.
          const priority: AppRole[] = [
            "super_admin", "admin", "clinic_owner", "medical_director",
            "physician", "nurse_practitioner", "physician_assistant",
            "registered_nurse", "provider", "aesthetician", "front_desk",
            "billing", "marketing", "user",
          ];
          const best = (priority.find((r) => u.roles.includes(r)) ?? null) as AppRole | null;
          rows.push({
            user_id: u.id,
            display_name: nameMap.get(u.id) ?? null,
            email: u.email,
            role: best,
          });
        }
      }

      setUsers(rows);
      setProviders(
        (providersRes.data ?? []).map((p) => ({
          id: p.id,
          name: `${p.first_name} ${p.last_name}`,
          user_id: p.user_id,
        })),
      );
    } catch (err: any) {
      toast({ title: "Couldn't load users", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const doRoleChange = async (userId: string, newRole: string) => {
    setSaving(userId);
    try {
      if (newRole === "none") {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId);
        if (error) throw error;
      } else {
        await supabase.from("user_roles").delete().eq("user_id", userId);
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole } as any);
        if (error) throw error;
      }
      toast({ title: "Role updated" });
      setSelected((s) => { const n = new Set(s); n.delete(userId); return n; });
      await fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const startEditName = (userId: string, currentName: string | null) => {
    setEditingNameFor(userId);
    setEditingNameValue(currentName ?? "");
  };
  const cancelEditName = () => {
    setEditingNameFor(null);
    setEditingNameValue("");
  };
  const saveName = async (userId: string) => {
    const trimmed = editingNameValue.trim();
    if (!trimmed) {
      toast({ title: "Name can't be empty", variant: "destructive" });
      return;
    }
    setSavingName(userId);
    try {
      // Upsert the profile row so users without an existing profile row
      // (rare, but possible for accounts created outside the normal
      // signup flow) still get a display name.
      const { data: existing } = await supabase
        .from("profiles").select("id").eq("user_id", userId).maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from("profiles").update({ display_name: trimmed }).eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("profiles").insert({ user_id: userId, display_name: trimmed });
        if (error) throw error;
      }

      // If the admin is editing their OWN row, also update auth.users
      // metadata so surfaces that read from user_metadata (sidebar
      // profile card, admin listings, etc.) reflect the change
      // immediately. For other users, the realtime profiles
      // subscription in AppSidebar will pick up the new name on their
      // next session.
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser?.id === userId) {
        await supabase.auth.updateUser({ data: { full_name: trimmed } });
      }

      toast({ title: "Name updated" });
      cancelEditName();
      await fetchData();
    } catch (err: any) {
      toast({ title: "Couldn't update name", description: err.message, variant: "destructive" });
    } finally {
      setSavingName(null);
    }
  };

  const HIGH_PRIVILEGE_ROLES: AppRole[] = ["super_admin", "admin", "clinic_owner", "medical_director"];

  const handleRoleChange = (userId: string, newRole: string) => {
    const user = users.find((u) => u.user_id === userId);
    const isDowngradingPrivileged = user?.role && HIGH_PRIVILEGE_ROLES.includes(user.role) && !HIGH_PRIVILEGE_ROLES.includes(newRole as AppRole);
    if (isDowngradingPrivileged) {
      setConfirmAction({
        title: "Downgrade privileged role?",
        description: `This will remove ${user?.role?.replace(/_/g, " ")} privileges from ${user?.display_name || "this user"}. They may lose access to management features.`,
        onConfirm: () => doRoleChange(userId, newRole),
      });
    } else {
      doRoleChange(userId, newRole);
    }
  };

  const handleLinkProvider = async (userId: string, providerId: string) => {
    setSaving(userId);
    try {
      const { error } = await supabase.from("providers").update({ user_id: userId }).eq("id", providerId);
      if (error) throw error;
      toast({ title: "Provider linked" });
      await fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const handleUnlinkProvider = (userId: string) => {
    const linked = providers.find((p) => p.user_id === userId);
    if (!linked) return;
    setConfirmAction({
      title: "Unlink provider?",
      description: `Unlink "${linked.name}" from this user account? The provider record will remain but won't be associated with any login.`,
      onConfirm: async () => {
        setSaving(userId);
        try {
          const { error } = await supabase.from("providers").update({ user_id: null }).eq("id", linked.id);
          if (error) throw error;
          toast({ title: "Provider unlinked" });
          await fetchData();
        } catch (err: any) {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
          setSaving(null);
        }
      },
    });
  };

  // Bulk assign
  const handleBulkAssign = () => {
    if (!bulkRole || selected.size === 0) return;
    const label = bulkRole === "none" ? "remove roles from" : `assign "${bulkRole.replace("_", " ")}" to`;
    setConfirmAction({
      title: `Bulk role change`,
      description: `${label} ${selected.size} user(s)?`,
      onConfirm: async () => {
        for (const uid of selected) {
          await doRoleChange(uid, bulkRole);
        }
        setSelected(new Set());
        setBulkRole("");
      },
    });
  };

  const unlinkedProviders = providers.filter((p) => !p.user_id);
  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.display_name?.toLowerCase().includes(q)) || u.user_id.toLowerCase().includes(q) || (u.email?.toLowerCase().includes(q));
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const getLinkedProvider = (userId: string) => providers.find((p) => p.user_id === userId);

  const toggleAll = () => {
    if (selected.size === paged.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paged.map((u) => u.user_id)));
    }
  };

  const toggleOne = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  };

  const roleBadge = (role: AppRole | null) => {
    if (!role) return <Badge variant="outline" className="text-muted-foreground">No role</Badge>;
    const colors: Record<AppRole, string> = {
      super_admin: "bg-destructive/10 text-destructive border-destructive/20",
      admin: "bg-destructive/10 text-destructive border-destructive/20",
      clinic_owner: "bg-info/10 text-info border-info/20",
      medical_director: "bg-indigo-600/10 text-indigo-700 border-indigo-600/20",
      physician: "bg-info/10 text-info border-info/20",
      nurse_practitioner: "bg-cyan-600/10 text-cyan-700 border-cyan-600/20",
      physician_assistant: "bg-teal-600/10 text-teal-700 border-teal-600/20",
      registered_nurse: "bg-emerald-600/10 text-emerald-700 border-emerald-600/20",
      provider: "bg-primary/10 text-primary border-primary/20",
      aesthetician: "bg-pink-600/10 text-pink-700 border-pink-600/20",
      front_desk: "bg-accent text-accent-foreground",
      billing: "bg-warning/10 text-warning border-warning/20",
      marketing: "bg-warning/10 text-warning border-warning/20",
      user: "bg-gray-500/10 text-muted-foreground border-gray-500/20",
    };
    return <Badge variant="outline" className={colors[role] ?? ""}>{role.replace(/_/g, " ")}</Badge>;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            User &amp; Role Management
          </CardTitle>
          <CardDescription>View all users, assign roles, and link to provider records</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search + bulk bar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or ID…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{selected.size} selected</span>
                <Select value={bulkRole} onValueChange={setBulkRole}>
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <SelectValue placeholder="Bulk role…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="secondary" onClick={handleBulkAssign} disabled={!bulkRole}>
                  Apply
                </Button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={paged.length > 0 && selected.size === paged.length}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Current Role</TableHead>
                      <TableHead>Set Role</TableHead>
                      <TableHead>Linked Provider</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paged.map((u) => {
                        const linked = getLinkedProvider(u.user_id);
                        return (
                          <TableRow key={u.user_id}>
                            <TableCell>
                              <Checkbox
                                checked={selected.has(u.user_id)}
                                onCheckedChange={() => toggleOne(u.user_id)}
                              />
                            </TableCell>
                            <TableCell>
                              <div>
                                {editingNameFor === u.user_id ? (
                                  <div className="flex items-center gap-1 mb-0.5">
                                    <Input
                                      value={editingNameValue}
                                      onChange={(e) => setEditingNameValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") saveName(u.user_id);
                                        if (e.key === "Escape") cancelEditName();
                                      }}
                                      placeholder="Full name"
                                      className="h-7 text-sm"
                                      autoFocus
                                      disabled={savingName === u.user_id}
                                    />
                                    <Button
                                      size="icon" variant="ghost" className="h-7 w-7"
                                      onClick={() => saveName(u.user_id)}
                                      disabled={savingName === u.user_id}
                                      aria-label="Save name"
                                    >
                                      {savingName === u.user_id
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <CheckIcon className="h-3.5 w-3.5 text-primary" />}
                                    </Button>
                                    <Button
                                      size="icon" variant="ghost" className="h-7 w-7"
                                      onClick={cancelEditName}
                                      disabled={savingName === u.user_id}
                                      aria-label="Cancel"
                                    >
                                      <XIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 group">
                                    <p className="font-medium text-sm">{u.display_name || "—"}</p>
                                    <Button
                                      size="icon" variant="ghost"
                                      className="h-6 w-6 opacity-60 hover:opacity-100"
                                      onClick={() => startEditName(u.user_id, u.display_name)}
                                      aria-label="Edit name"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                                {u.email && <p className="text-xs text-muted-foreground">{u.email}</p>}
                                <p className="text-[11px] text-muted-foreground/60 truncate max-w-[180px]">{u.user_id}</p>
                              </div>
                            </TableCell>
                            <TableCell>{roleBadge(u.role)}</TableCell>
                            <TableCell>
                              <Select
                                value={u.role ?? "none"}
                                onValueChange={(v) => handleRoleChange(u.user_id, v)}
                                disabled={saving === u.user_id}
                              >
                                <SelectTrigger className="w-[170px] h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ROLE_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              {linked ? (
                                <div className="flex items-center gap-1.5">
                                  <Link2 className="h-3.5 w-3.5 text-primary" />
                                  <span className="text-sm">{linked.name}</span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 ml-1"
                                    onClick={() => handleUnlinkProvider(u.user_id)}
                                    disabled={saving === u.user_id}
                                  >
                                    <Unlink className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                  </Button>
                                </div>
                              ) : unlinkedProviders.length > 0 ? (
                                <Select onValueChange={(pid) => handleLinkProvider(u.user_id, pid)} disabled={saving === u.user_id}>
                                  <SelectTrigger className="w-[160px] h-8 text-xs">
                                    <SelectValue placeholder="Link provider…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {unlinkedProviders.map((p) => (
                                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">
                    {filtered.length} user{filtered.length !== 1 ? "s" : ""} · Page {safePage + 1} of {totalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction?.title}</DialogTitle>
            <DialogDescription>{confirmAction?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await confirmAction?.onConfirm();
                setConfirmAction(null);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
