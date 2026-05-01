import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sparkles, AlertTriangle, FileCheck, Clock, Users, ChevronRight,
  Loader2, RefreshCw, TrendingDown, Package, X,
} from "lucide-react";

type AlertItem = {
  id: string;
  title: string;
  urgency: "critical" | "high" | "medium" | "low";
  category: string;
  action_label: string;
  route: string;
  detail: string;
};

const urgencyConfig = {
  critical: { color: "bg-destructive text-destructive-foreground", icon: AlertTriangle },
  high: { color: "bg-warning text-warning-foreground", icon: AlertTriangle },
  medium: { color: "bg-primary text-primary-foreground", icon: Clock },
  low: { color: "bg-muted text-muted-foreground", icon: FileCheck },
};

export function ActionBar() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Fetch local data-driven alerts (no AI call needed for basic alerts)
  const { data: alerts, isLoading, refetch } = useQuery({
    queryKey: ["front-desk-alerts"],
    queryFn: async () => {
      const items: AlertItem[] = [];
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

      // 1. Unconfirmed appointments (booked, no check-in, within next 2 hours)
      const twoHoursOut = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const { data: upcoming } = await supabase
        .from("appointments")
        .select("id, scheduled_at, patients(first_name, last_name)")
        .eq("status", "booked" as any)
        .gte("scheduled_at", start)
        .lte("scheduled_at", twoHoursOut)
        .order("scheduled_at")
        .limit(10);

      if (upcoming?.length) {
        items.push({
          id: "upcoming-checkins",
          title: `${upcoming.length} patient${upcoming.length > 1 ? "s" : ""} arriving soon`,
          urgency: upcoming.length >= 3 ? "high" : "medium",
          category: "check_in",
          action_label: "View Queue",
          route: "/front-desk",
          detail: upcoming.slice(0, 3).map((a: any) => `${a.patients?.first_name} ${a.patients?.last_name}`).join(", "),
        });
      }

      // 2. Patients waiting too long (checked_in > 15 min ago)
      const fifteenAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: longWait } = await supabase
        .from("appointments")
        .select("id, checked_in_at, patients(first_name, last_name)")
        .eq("status", "checked_in" as any)
        .gte("scheduled_at", start)
        .lt("checked_in_at", fifteenAgo)
        .limit(5);

      if (longWait?.length) {
        items.push({
          id: "long-wait",
          title: `${longWait.length} patient${longWait.length > 1 ? "s" : ""} waiting 15+ min`,
          urgency: "high",
          category: "wait_time",
          action_label: "Room Now",
          route: "/front-desk",
          detail: longWait.map((a: any) => a.patients?.first_name).join(", "),
        });
      }

      // 3. Unsigned consents for today's patients — identify the actual
      // patients missing consents so clicking the alert can deep-link to
      // the first one's check-in panel (rather than dropping the user on
      // a context-less /front-desk).
      const { data: todayApts } = await supabase
        .from("appointments")
        .select("patient_id, patients(first_name, last_name)")
        .gte("scheduled_at", start)
        .lt("scheduled_at", end)
        .in("status", ["booked", "checked_in"] as any);

      if (todayApts?.length) {
        const patientIds = [...new Set(todayApts.map((a: any) => a.patient_id))];
        const { data: existingConsents } = await supabase
          .from("e_consents")
          .select("patient_id")
          .in("patient_id", patientIds);

        const consentedSet = new Set((existingConsents ?? []).map((c: any) => c.patient_id));
        const missingApts = todayApts.filter((a: any) => !consentedSet.has(a.patient_id));
        const missingPatientIds = [...new Set(missingApts.map((a: any) => a.patient_id))];

        if (missingPatientIds.length > 0) {
          const namePreview = missingApts
            .slice(0, 3)
            .map((a: any) => `${a.patients?.first_name ?? ""} ${a.patients?.last_name ?? ""}`.trim())
            .filter(Boolean)
            .join(", ");
          items.push({
            id: "missing-consents",
            title: `${missingPatientIds.length} patient${missingPatientIds.length > 1 ? "s" : ""} may need consents`,
            urgency: "medium",
            category: "consent",
            action_label: "Check In",
            route: `/front-desk?patientId=${missingPatientIds[0]}`,
            detail: namePreview || "Consent collection during check-in",
          });
        }
      }

      // 4. Waitlist matches
      const { count: waitlistCount } = await supabase
        .from("appointment_waitlist")
        .select("*", { count: "exact", head: true })
        .eq("is_fulfilled", false);

      if (waitlistCount && waitlistCount > 0) {
        items.push({
          id: "waitlist",
          title: `${waitlistCount} waitlist entr${waitlistCount > 1 ? "ies" : "y"}`,
          urgency: "low",
          category: "waitlist",
          action_label: "View",
          route: "/waitlist",
          detail: "Check for open slot matches",
        });
      }

      return items;
    },
    refetchInterval: 60000,
  });

  const visibleAlerts = alerts?.filter(a => !dismissed.has(a.id)) ?? [];

  if (isLoading) {
    return (
      <Card className="p-3">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading alerts…
        </div>
      </Card>
    );
  }

  if (visibleAlerts.length === 0) return null;

  return (
    <Card className="p-3 border-primary/20 bg-primary/[0.02]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-primary">Action Items</span>
          <Badge variant="secondary" className="text-[11px] h-4 px-1.5">{visibleAlerts.length}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {visibleAlerts.map((alert) => {
          const cfg = urgencyConfig[alert.urgency];
          const Icon = cfg.icon;
          return (
            <button
              key={alert.id}
              onClick={() => navigate(alert.route)}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left hover:bg-muted/50 transition-colors group max-w-xs"
            >
              <div className={`h-5 w-5 rounded flex items-center justify-center shrink-0 ${cfg.color}`}>
                <Icon className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{alert.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">{alert.detail}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="outline" className="text-[11px] h-4 px-1 hidden sm:flex">{alert.action_label}</Badge>
                <button
                  onClick={(e) => { e.stopPropagation(); setDismissed(prev => new Set(prev).add(alert.id)); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
