import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/RBACContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { format, parseISO, differenceInHours } from "date-fns";

export default function OutstandingCharts() {
  const { user, hasRole } = useAuth();
  // Admins / super_admins see clinic-wide; everyone else sees only their own charts.
  const isGlobalView = hasRole("admin", "super_admin");

  // Resolve the current user's provider_id (only needed for scoped view).
  const { data: providerId, isLoading: providerIdLoading } = useQuery({
    queryKey: ["my-provider-id", user?.id],
    enabled: !!user?.id && !isGlobalView,
    queryFn: async () => {
      const { data } = await supabase
        .from("providers")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data?.id ?? null;
    },
  });

  const scopedReady = isGlobalView || (!providerIdLoading && !!providerId);

  // Unsigned encounters (signed_at IS NULL, status not draft)
  const { data: unsignedEncounters, isLoading } = useQuery({
    queryKey: ["outstanding-charts", isGlobalView ? "global" : providerId],
    enabled: scopedReady,
    queryFn: async () => {
      let q = supabase
        .from("encounters")
        .select("id, status, encounter_type, created_at, started_at, completed_at, patients(first_name, last_name), providers(first_name, last_name, credentials)")
        .is("signed_at", null)
        .in("status", ["in_progress", "completed"])
        .order("created_at", { ascending: true });
      if (!isGlobalView) q = q.eq("provider_id", providerId!);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Unsigned clinical notes
  const { data: unsignedNotes } = useQuery({
    queryKey: ["outstanding-notes", isGlobalView ? "global" : providerId],
    enabled: scopedReady,
    queryFn: async () => {
      let q = supabase
        .from("clinical_notes")
        .select("id, status, created_at, patients(first_name, last_name), providers(first_name, last_name)")
        .eq("status", "draft")
        .order("created_at", { ascending: true });
      if (!isGlobalView) q = q.eq("provider_id", providerId!);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Provider charting lag — avg hours from encounter creation to signing
  const { data: chartingLag } = useQuery({
    queryKey: ["charting-lag", isGlobalView ? "global" : providerId],
    enabled: scopedReady,
    queryFn: async () => {
      let q = supabase
        .from("encounters")
        .select("provider_id, created_at, signed_at, providers(first_name, last_name, credentials)")
        .not("signed_at", "is", null)
        .order("signed_at", { ascending: false })
        .limit(500);
      if (!isGlobalView) q = q.eq("provider_id", providerId!);
      const { data } = await q;
      if (!data || data.length === 0) return [];

      const byProvider: Record<string, { name: string; totalHours: number; count: number }> = {};
      data.forEach((e: any) => {
        const pid = e.provider_id;
        if (!pid) return;
        const hours = differenceInHours(parseISO(e.signed_at), parseISO(e.created_at));
        if (!byProvider[pid]) {
          byProvider[pid] = {
            name: `${e.providers?.first_name || ""} ${e.providers?.last_name || ""}${e.providers?.credentials ? `, ${e.providers.credentials}` : ""}`,
            totalHours: 0,
            count: 0,
          };
        }
        byProvider[pid].totalHours += hours;
        byProvider[pid].count += 1;
      });
      return Object.entries(byProvider)
        .map(([id, v]) => ({ id, name: v.name, avgHours: Math.round(v.totalHours / v.count), count: v.count }))
        .sort((a, b) => b.avgHours - a.avgHours);
    },
  });

  const getAgeBadge = (createdAt: string) => {
    const hours = differenceInHours(new Date(), parseISO(createdAt));
    if (hours > 72) return <Badge variant="destructive" className="text-[10px]">{Math.round(hours / 24)}d overdue</Badge>;
    if (hours > 24) return <Badge className="text-[10px] bg-warning text-warning-foreground">{Math.round(hours / 24)}d</Badge>;
    return <Badge variant="secondary" className="text-[10px]">{hours}h</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Outstanding Charts</h1>
        <p className="text-muted-foreground">Track unsigned encounters and charting lag by provider</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase">Unsigned Encounters</p>
            <p className="text-2xl font-bold mt-1">{unsignedEncounters?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase">Draft Notes</p>
            <p className="text-2xl font-bold mt-1">{unsignedNotes?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase">&gt;72h Overdue</p>
            <p className="text-2xl font-bold mt-1 text-destructive">
              {unsignedEncounters?.filter((e: any) => differenceInHours(new Date(), parseISO(e.created_at)) > 72).length ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase">Total Outstanding</p>
            <p className="text-2xl font-bold mt-1">{(unsignedEncounters?.length ?? 0) + (unsignedNotes?.length ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Unsigned Encounters Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Unsigned Encounters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="h-48 m-4" />
          ) : unsignedEncounters && unsignedEncounters.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Age</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unsignedEncounters.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.patients?.first_name} {e.patients?.last_name}</TableCell>
                    <TableCell className="text-sm">{e.providers?.first_name} {e.providers?.last_name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{e.encounter_type || "General"}</Badge></TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{e.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(parseISO(e.created_at), "MMM d, h:mm a")}</TableCell>
                    <TableCell>{getAgeBadge(e.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 text-center">
              <CheckCircle2 className="h-8 w-8 mx-auto text-success" />
              <p className="mt-2 text-sm text-muted-foreground">All encounters signed</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Provider Charting Lag */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Provider Charting Lag (Avg hours to sign)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {chartingLag && chartingLag.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Avg Sign Time</TableHead>
                  <TableHead>Charts Analyzed</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chartingLag.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <span className={`font-mono ${p.avgHours > 48 ? "text-destructive" : p.avgHours > 24 ? "text-warning" : ""}`}>
                        {p.avgHours}h
                      </span>
                    </TableCell>
                    <TableCell>{p.count}</TableCell>
                    <TableCell>
                      {p.avgHours > 48 ? (
                        <Badge variant="destructive" className="text-[10px]">Needs Improvement</Badge>
                      ) : p.avgHours > 24 ? (
                        <Badge className="text-[10px] bg-warning text-warning-foreground">Moderate</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Good</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No signed encounters to analyze
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
