import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Users, Loader2, Link2, Search } from "lucide-react";

type AppRole = "admin" | "provider" | "front_desk";

interface UserRow {
  user_id: string;
  display_name: string | null;
  role: AppRole | null;
}

interface ProviderOption {
  id: string;
  name: string;
  user_id: string | null;
}

export function UserManagement() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, providersRes] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("providers").select("id, name, user_id"),
    ]);

    const profiles = profilesRes.data ?? [];
    const roles = rolesRes.data ?? [];
    const roleMap = new Map(roles.map((r) => [r.user_id, r.role as AppRole]));

    setUsers(
      profiles.map((p) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        role: roleMap.get(p.user_id) ?? null,
      }))
    );
    setProviders(
      (providersRes.data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        user_id: p.user_id,
      }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setSaving(userId);
    try {
      if (newRole === "none") {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId);
        if (error) throw error;
      } else {
        // Upsert: delete then insert (no upsert on composite key easily)
        await supabase.from("user_roles").delete().eq("user_id", userId);
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
        if (error) throw error;
      }
      toast({ title: "Role updated" });
      await fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(null);
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

  const unlinkedProviders = providers.filter((p) => !p.user_id);
  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.display_name?.toLowerCase().includes(q)) || u.user_id.toLowerCase().includes(q);
  });

  const getLinkedProvider = (userId: string) => providers.find((p) => p.user_id === userId);

  const roleBadge = (role: AppRole | null) => {
    if (!role) return <Badge variant="outline" className="text-muted-foreground">No role</Badge>;
    const colors: Record<AppRole, string> = {
      admin: "bg-destructive/10 text-destructive border-destructive/20",
      provider: "bg-primary/10 text-primary border-primary/20",
      front_desk: "bg-accent text-accent-foreground",
    };
    return <Badge variant="outline" className={colors[role]}>{role.replace("_", " ")}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          User &amp; Role Management
        </CardTitle>
        <CardDescription>View all users, assign roles, and link to provider records</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Current Role</TableHead>
                  <TableHead>Set Role</TableHead>
                  <TableHead>Linked Provider</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((u) => {
                    const linked = getLinkedProvider(u.user_id);
                    return (
                      <TableRow key={u.user_id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{u.display_name || "—"}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{u.user_id}</p>
                          </div>
                        </TableCell>
                        <TableCell>{roleBadge(u.role)}</TableCell>
                        <TableCell>
                          <Select
                            value={u.role ?? "none"}
                            onValueChange={(v) => handleRoleChange(u.user_id, v)}
                            disabled={saving === u.user_id}
                          >
                            <SelectTrigger className="w-[140px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No role</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="provider">Provider</SelectItem>
                              <SelectItem value="front_desk">Front Desk</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {linked ? (
                            <div className="flex items-center gap-1.5">
                              <Link2 className="h-3.5 w-3.5 text-primary" />
                              <span className="text-sm">{linked.name}</span>
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
        )}
      </CardContent>
    </Card>
  );
}
