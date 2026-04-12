import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, Calendar, Stethoscope, ClipboardList, UserCog,
  Activity, FlaskConical, FileText, Pill, DollarSign, ClipboardPlus, ShieldCheck, DoorOpen, Store, Package,
  CreditCard, TrendingUp, Calculator, MonitorCheck, Briefcase, Search, LogOut, CalendarClock, TrendingDown,
  Settings, UserCircle, CalendarOff, MessageSquare, ClipboardCheck, Mail, Clock, ListChecks,
  Building2, BarChart3, Zap, BookOpen, Bell, CalendarDays, Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type NavItem = {
  to: string;
  icon: any;
  label: string;
  roles?: string[];
  badgeKey?: string;
};

type NavSection = {
  label: string;
  roles?: string[];
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "COMMAND",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard", roles: ["admin", "front_desk"] },
      { to: "/provider-day", icon: Briefcase, label: "My Day", roles: ["provider"] },
      { to: "/front-desk", icon: MonitorCheck, label: "Front Desk", roles: ["admin", "front_desk"] },
      { to: "/check-in", icon: ClipboardCheck, label: "Check-In", roles: ["admin", "front_desk"] },
    ],
  },
  {
    label: "SCHEDULE",
    items: [
      { to: "/appointments", icon: Calendar, label: "Appointments" },
      { to: "/calendar-grid", icon: CalendarDays, label: "Calendar Grid", roles: ["admin"] },
      { to: "/waitlist", icon: ListChecks, label: "Waitlist", roles: ["admin"] },
    ],
  },
  {
    label: "PATIENTS",
    items: [
      { to: "/patients", icon: Users, label: "Patients" },
      { to: "/encounters", icon: FileText, label: "Encounters" },
      { to: "/messages", icon: Mail, label: "Messages", badgeKey: "unread_messages" },
      { to: "/patient-inbox", icon: Inbox, label: "Patient Inbox", roles: ["admin", "front_desk"] },
      { to: "/notifications", icon: Bell, label: "Notifications" },
    ],
  },
  {
    label: "CLINICAL",
    roles: ["admin", "provider", "front_desk"],
    items: [
      { to: "/clinical-notes", icon: ClipboardList, label: "Clinical Notes" },
      { to: "/encounters", icon: FileText, label: "Encounters" },
      { to: "/hormone-visits", icon: FlaskConical, label: "Hormone Labs", roles: ["admin", "provider"] },
      { to: "/hormone-intake", icon: ClipboardPlus, label: "Hormone Intake", roles: ["admin", "provider"] },
      { to: "/physician-approval", icon: ShieldCheck, label: "Approvals", roles: ["admin", "provider"] },
      { to: "/protocols", icon: Pill, label: "Protocols", roles: ["admin", "provider"] },
      { to: "/md-feedback", icon: MessageSquare, label: "MD Feedback", roles: ["provider"], badgeKey: "md_corrections" },
    ],
  },
  {
    label: "CLINIC CONFIG",
    roles: ["admin"],
    items: [
      { to: "/treatments", icon: Stethoscope, label: "Treatments" },
      { to: "/medications", icon: Pill, label: "Medications" },
      { to: "/packages", icon: Package, label: "Packages" },
      { to: "/membership-billing", icon: CreditCard, label: "Memberships" },
      { to: "/templates", icon: FileText, label: "Templates" },
    ],
  },
  {
    label: "OPERATIONS",
    roles: ["admin"],
    items: [
      { to: "/provider-schedule", icon: CalendarClock, label: "Schedules" },
      { to: "/clinic-hours", icon: Clock, label: "Clinic Hours" },
      { to: "/rooms-devices", icon: DoorOpen, label: "Rooms & Devices" },
      { to: "/providers", icon: UserCog, label: "Providers" },
      { to: "/automation-rules", icon: Zap, label: "Automations" },
    ],
  },
  {
    label: "OVERSIGHT",
    roles: ["admin"],
    items: [
      { to: "/md-oversight", icon: ShieldCheck, label: "Chart Review" },
      { to: "/md-oversight/dashboard", icon: Activity, label: "MD Status" },
      { to: "/churn-risk", icon: TrendingDown, label: "Churn Risk" },
    ],
  },
  {
    label: "FINANCIALS",
    roles: ["admin"],
    items: [
      { to: "/billing", icon: DollarSign, label: "Billing" },
      { to: "/earnings", icon: TrendingUp, label: "Earnings" },
      { to: "/proforma", icon: Calculator, label: "Proforma" },
      { to: "/reports", icon: BarChart3, label: "Reports" },
    ],
  },
  {
    label: "PLATFORM",
    roles: ["admin"],
    items: [
      { to: "/contracts", icon: Building2, label: "Contracts" },
      { to: "/md-coverage", icon: ShieldCheck, label: "MD Coverage" },
      { to: "/master-catalog", icon: BookOpen, label: "Master Catalog" },
      { to: "/benchmarks", icon: BarChart3, label: "Benchmarks" },
    ],
  },
  {
    label: "ME",
    items: [
      { to: "/my-profile", icon: UserCircle, label: "My Profile" },
      { to: "/my-performance", icon: BarChart3, label: "Performance", roles: ["provider"] },
      { to: "/time-off", icon: CalendarOff, label: "Time Off" },
      { to: "/settings", icon: Settings, label: "Settings" },
    ],
  },
];

function filterNav(sections: NavSection[], role: string | null): NavSection[] {
  const r = role || "user";
  return sections
    .filter((s) => !s.roles || s.roles.includes(r))
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => !i.roles || i.roles.includes(r)),
    }))
    .filter((s) => s.items.length > 0);
}

export function AppSidebar() {
  const location = useLocation();
  const { user, role, signOut } = useAuth();
  const [badges, setBadges] = useState<Record<string, number>>({});

  const visibleSections = filterNav(navSections, role);

  useEffect(() => {
    if (!user) return;
    const fetchBadges = async () => {
      const counts: Record<string, number> = {};
      const { count: msgCount } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .eq("is_read", false)
        .is("parent_id", null);
      if (msgCount) counts.unread_messages = msgCount;

      if (role === "provider") {
        const { data: prov } = await supabase
          .from("providers")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (prov) {
          const { count: corrCount } = await supabase
            .from("chart_review_records")
            .select("*", { count: "exact", head: true })
            .eq("provider_id", prov.id)
            .eq("status", "corrected");
          if (corrCount) counts.md_corrections = corrCount;
        }
      }
      setBadges(counts);
    };

    fetchBadges();
    const channel = supabase
      .channel("sidebar-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => fetchBadges())
      .on("postgres_changes", { event: "*", schema: "public", table: "chart_review_records" }, () => fetchBadges())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, role]);

  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : "??";
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "User";

  return (
    <aside className="hidden md:flex w-56 flex-col bg-sidebar text-sidebar-foreground min-h-screen flex-shrink-0">
      <div className="px-5 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-sidebar-primary" />
          <span className="font-serif text-base font-semibold text-white tracking-tight">Meridian</span>
        </div>
        <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-sidebar-primary mt-0.5">WELLNESS EHR</p>
      </div>

      <button
        onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-sidebar-border px-3 py-1.5 text-[11px] text-sidebar-foreground/40 hover:bg-white/5 transition-colors"
      >
        <Search className="h-3 w-3" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="text-[9px] bg-sidebar-muted px-1 py-0.5 rounded font-mono">⌘K</kbd>
      </button>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {visibleSections.map((section) => (
          <div key={section.label}>
            <p className="px-3 pt-4 pb-1 text-[9px] font-bold tracking-[0.14em] uppercase text-sidebar-foreground/25">{section.label}</p>
            {section.items.map((item) => {
              const isActive = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
              const badgeCount = item.badgeKey ? badges[item.badgeKey] || 0 : 0;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-[12.5px] font-normal transition-colors mb-0.5",
                    isActive
                      ? "bg-primary/10 text-sidebar-primary font-medium"
                      : "text-sidebar-foreground/50 hover:bg-white/5 hover:text-sidebar-foreground/85"
                  )}
                >
                  <item.icon className="h-[14px] w-[14px] flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {badgeCount > 0 && (
                    <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground px-1">
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-sidebar-primary flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] text-white truncate font-medium">{displayName}</p>
            <p className="text-[10px] text-sidebar-foreground/40 truncate">{user?.email}</p>
          </div>
          <button
            onClick={signOut}
            className="p-1.5 rounded-md text-sidebar-foreground/30 hover:text-sidebar-foreground/70 hover:bg-white/5 transition-colors flex-shrink-0"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
