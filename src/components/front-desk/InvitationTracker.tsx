import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link2, Clock, Eye, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: React.ElementType }> = {
  sent: { label: "Sent", variant: "secondary", icon: Clock },
  opened: { label: "Opened", variant: "outline", icon: Eye },
  completed: { label: "Completed", variant: "default", icon: CheckCircle2 },
  expired: { label: "Expired", variant: "destructive", icon: Clock },
};

export function InvitationTracker() {
  const queryClient = useQueryClient();

  const { data: invitations } = useQuery({
    queryKey: ["intake-invitations-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intake_invitations")
        .select("*, patients(first_name, last_name)")
        .order("sent_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("invitation-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "intake_invitations" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["intake-invitations-recent"] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  if (!invitations?.length) return null;

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Link2 className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Intake Invitations</span>
        <Badge variant="secondary" className="ml-auto text-[10px] h-5">{invitations.length}</Badge>
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {invitations.map((inv: any) => {
          const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.sent;
          const Icon = cfg.icon;
          return (
            <div key={inv.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/30 text-xs">
              <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {inv.patients?.first_name} {inv.patients?.last_name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {inv.focus_areas?.join(", ") || "General"} · {formatDistanceToNow(new Date(inv.sent_at), { addSuffix: true })}
                </p>
              </div>
              <Badge variant={cfg.variant} className="text-[10px] h-5 flex-shrink-0">
                {cfg.label}
              </Badge>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
