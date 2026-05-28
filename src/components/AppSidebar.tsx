import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, Calendar, Stethoscope, ClipboardList, UserCog,
  Activity, FlaskConical, FileText, Pill, DollarSign, ClipboardPlus, ShieldCheck, DoorOpen, Store, Package,
  CreditCard, TrendingUp, Calculator, MonitorCheck, Briefcase, Search, LogOut, CalendarClock, TrendingDown,
  Settings, UserCircle, CalendarOff, MessageSquare, ClipboardCheck, Mail, Clock, ListChecks,
  Building2, BarChart3, Zap, BookOpen, Bell, CalendarDays, Inbox, Video, ScrollText, Target, Camera,
  FileWarning, ChevronDown, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/RBACContext";
import { supabase } from "@/integrations/supabase/client";
import { ClinicSwitcher } from "@/components/admin/ClinicSwitcher";
import { prefetchRoute } from "@/lib/routePrefetch";

type NavItem = {
  to: string;
  icon: any;
  label: string;
  roles?: string[];
  badgeKey?: string;
  /** When true, this item is hidden under the collapsible "More" section
   *  instead of the always-visible primary nav. Flip to false to promote an
   *  item back into the prominent alpha navigation. */
  defer?: boolean;
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
      { to: "/outstanding-charts", icon: FileWarning, label: "Outstanding Charts", roles: ["admin", "provider"] },
      { to: "/front-desk", icon: MonitorCheck, label: "Front Desk", roles: ["admin", "front_desk"] },
      // Read-only provider day view; the actual check-in action lives in Front Desk.
      { to: "/check-in", icon: ClipboardCheck, label: "My Roster", roles: ["admin", "front_desk"] },
    ],
  },
  {
    label: "SCHEDULE",
    items: [
      { to: "/appointments", icon: Calendar, label: "Appointments" },
      { to: "/calendar-grid", icon: CalendarDays, label: "Calendar Grid", roles: ["admin"] },
      { to: "/waitlist", icon: ListChecks, label: "Waitlist", roles: ["admin"], defer: true },
    ],
  },
  {
    label: "PATIENTS",
    items: [
      { to: "/patients", icon: Users, label: "Patients" },
      { to: "/messages", icon: Mail, label: "Messages", badgeKey: "unread_messages", defer: true },
      { to: "/patient-inbox", icon: Inbox, label: "Patient Inbox", roles: ["admin", "front_desk"], defer: true },
      { to: "/notifications", icon: Bell, label: "Notifications", defer: true },
    ],
  },
  {
    label: "CLINICAL",
    roles: ["admin", "provider", "front_desk"],
    items: [
      { to: "/clinical-notes", icon: ClipboardList, label: "Clinical Notes" },
      { to: "/encounters", icon: FileText, label: "Encounters" },
      { to: "/clinical-photos", icon: Camera, label: "Clinical Photos" },
      { to: "/prescriptions", icon: Pill, label: "Prescriptions", roles: ["admin", "provider"], defer: true },
      { to: "/hormone-visits", icon: FlaskConical, label: "Hormone Labs", roles: ["admin", "provider"], defer: true },
      { to: "/hormone-intake", icon: ClipboardPlus, label: "Hormone Intake", roles: ["admin", "provider"], defer: true },
      { to: "/physician-approval", icon: ShieldCheck, label: "Approvals", roles: ["admin", "provider"], defer: true },
      { to: "/intake-clearance", icon: Inbox, label: "Intake Clearance", roles: ["admin", "provider"], defer: true },
      { to: "/protocols", icon: Pill, label: "Protocols", roles: ["admin", "provider"], defer: true },
      { to: "/md-feedback", icon: MessageSquare, label: "MD Feedback", roles: ["provider"], badgeKey: "md_corrections", defer: true },
    ],
  },
  {
    label: "CLINIC CONFIG",
    roles: ["admin"],
    items: [
      { to: "/treatments", icon: Stethoscope, label: "Treatments" },
      { to: "/templates", icon: FileText, label: "Templates" },
      { to: "/medications", icon: Pill, label: "Medications", defer: true },
      { to: "/packages", icon: Package, label: "Packages", defer: true },
      { to: "/membership-billing", icon: CreditCard, label: "Memberships", defer: true },
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
      { to: "/automation-rules", icon: Zap, label: "Automations", defer: true },
    ],
  },
  {
    label: "OVERSIGHT",
    roles: ["admin"],
    items: [
      { to: "/md-oversight", icon: ShieldCheck, label: "Chart Review" },
      { to: "/md-oversight/dashboard", icon: Activity, label: "MD Status" },
      { to: "/churn-risk", icon: TrendingDown, label: "Churn Risk", defer: true },
    ],
  },
  {
    label: "FINANCIALS",
    roles: ["admin"],
    items: [
      { to: "/billing", icon: DollarSign, label: "Billing" },
      { to: "/earnings", icon: TrendingUp, label: "Earnings", defer: true },
      { to: "/proforma", icon: Calculator, label: "Proforma", defer: true },
      { to: "/reports", icon: BarChart3, label: "Reports", defer: true },
    ],
  },
  {
    label: "PLATFORM",
    roles: ["admin"],
    items: [
      { to: "/master-catalog", icon: BookOpen, label: "Master Catalog" },
      { to: "/contracts", icon: Building2, label: "Contracts", defer: true },
      { to: "/md-coverage", icon: ShieldCheck, label: "MD Coverage", defer: true },
      { to: "/benchmarks", icon: BarChart3, label: "Benchmarks", defer: true },
      { to: "/users", icon: UserCog, label: "Users", defer: true },
      { to: "/audit-log", icon: ScrollText, label: "Audit Log", defer: true },
    ],
  },
  {
    label: "ME",
    items: [
      { to: "/my-profile", icon: UserCircle, label: "My Profile" },
      { to: "/time-off", icon: CalendarOff, label: "Time Off" },
      { to: "/settings", icon: Settings, label: "Settings" },
      { to: "/my-performance", icon: BarChart3, label: "Performance", roles: ["provider"], defer: true },
      { to: "/performance-goals", icon: Target, label: "Goals", roles: ["provider"], defer: true },
    ],
  },
];

function filterNav(sections: NavSection[], role: string | null): NavSection[] {
  const r = role || "user";
  // super_admin sees everything admin sees (and more). Nav items were authored
  // with "admin" in their roles list; alias super_admin → admin for matching.
  const effectiveRoles = r === "super_admin" ? ["admin", "super_admin"] : [r];
  const matches = (allowed: string[] | undefined) =>
    !allowed || effectiveRoles.some((role) => allowed.includes(role));
  return sections
    .filter((s) => matches(s.roles))
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => matches(i.roles)),
    }))
    .filter((s) => s.items.length > 0);
}

export function AppSidebar() {
  const location = useLocation();
  const { user, role, signOut } = useAuth();
  const [badges, setBadges] = useState<Record<string, number>>({});

  const visibleSections = filterNav(navSections, role);
  const isAdminLike = role && ["admin", "super_admin", "clinic_owner"].includes(role);
  const [showMore, setShowMore] = useState(false);

  // Split each role-filtered section into the always-visible alpha nav
  // (items without `defer`) and the collapsible "More" overflow (deferred
  // items). Sections that end up empty on either side are dropped.
  const primarySections = visibleSections
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.defer) }))
    .filter((s) => s.items.length > 0);
  const moreSections = visibleSections
    .map((s) => ({ ...s, items: s.items.filter((i) => i.defer) }))
    .filter((s) => s.items.length > 0);
  const moreCount = moreSections.reduce((n, s) => n + s.items.length, 0);
  // Sum any unread/correction badges that live on deferred items, so the
  // signal isn't lost while "More" is collapsed.
  const moreBadgeCount = moreSections.reduce(
    (n, s) => n + s.items.reduce((m, i) => m + (i.badgeKey ? badges[i.badgeKey] || 0 : 0), 0),
    0,
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchBadges = async () => {
      // Parallelize all badge count queries. Previous implementation fetched
      // messages, then (provider-only) provider id, then chart reviews
      // SEQUENTIALLY — up to 3 × round-trip latency. For a user in India
      // hitting Supabase us-east-2 (~250ms each) that was almost a second of
      // waiting for a few counts.
      const msgPromise = supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .eq("is_read", false)
        .is("parent_id", null);

      const corrPromise = role === "provider"
        ? supabase
            .from("providers")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle()
            .then(async ({ data: prov }) => {
              if (!prov) return { count: null };
              return await supabase
                .from("chart_review_records")
                .select("*", { count: "exact", head: true })
                .eq("provider_id", prov.id)
                .eq("status", "corrected");
            })
        : Promise.resolve({ count: null });

      const [{ count: msgCount }, { count: corrCount }] = await Promise.all([msgPromise, corrPromise]);
      if (cancelled) return;
      const counts: Record<string, number> = {};
      if (msgCount) counts.unread_messages = msgCount;
      if (corrCount) counts.md_corrections = corrCount;
      setBadges(counts);
    };

    fetchBadges();
    const channel = supabase
      .channel("sidebar-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => fetchBadges())
      .on("postgres_changes", { event: "*", schema: "public", table: "chart_review_records" }, () => fetchBadges())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user, role]);

  // Fetch profile display_name so sidebar stays in sync when an admin
  // edits names via User & Role Management (which writes to profiles,
  // not to auth.user_metadata). Falls back to user_metadata → email.
  const [profileName, setProfileName] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.id) { setProfileName(null); return; }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfileName(data?.display_name ?? null);
      });
    // Realtime: re-pull when this user's profile row updates.
    const ch = supabase
      .channel(`sidebar-profile-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const next = (payload.new as { display_name?: string | null })?.display_name ?? null;
          if (!cancelled) setProfileName(next);
        },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user?.id]);

  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : "??";
  const displayName =
    profileName ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "User";

  return (
    <nav aria-label="Primary" className="hidden md:flex w-56 flex-col bg-sidebar text-sidebar-foreground min-h-screen flex-shrink-0">
      <div className="px-5 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-sidebar-primary" />
          <span className="font-serif text-base font-semibold text-white tracking-tight">Meridian</span>
        </div>
        <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-sidebar-primary mt-0.5">WELLNESS EHR</p>
      </div>

      {isAdminLike && (
        <div className="px-3 py-2 border-b border-sidebar-border">
          <ClinicSwitcher />
        </div>
      )}

      <button
        onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-sidebar-border px-3 py-1.5 text-[11px] text-sidebar-foreground/40 hover:bg-white/5 transition-colors"
      >
        <Search className="h-3 w-3" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="text-[11px] bg-sidebar-muted px-1 py-0.5 rounded font-mono">⌘K</kbd>
      </button>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {(() => {
          const renderItem = (item: NavItem) => {
            const isActive = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            const badgeCount = item.badgeKey ? badges[item.badgeKey] || 0 : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onMouseEnter={() => prefetchRoute(item.to)}
                onFocus={() => prefetchRoute(item.to)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-[12.5px] font-normal transition-colors mb-0.5",
                  isActive
                    ? "bg-primary/10 text-sidebar-primary font-medium"
                    : "text-sidebar-foreground/65 hover:bg-white/5 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="h-[14px] w-[14px] flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {badgeCount > 0 && (
                  <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-[11px] font-semibold text-destructive-foreground px-1">
                    {badgeCount > 9 ? "9+" : badgeCount}
                  </span>
                )}
              </NavLink>
            );
          };

          const renderSection = (section: NavSection) => (
            <div key={section.label}>
              <p className="px-3 pt-4 pb-1 text-[11px] font-bold tracking-[0.14em] uppercase text-sidebar-foreground/40">{section.label}</p>
              {section.items.map(renderItem)}
            </div>
          );

          return (
            <>
              {primarySections.map(renderSection)}

              {moreCount > 0 && (
                <div className="mt-4 pt-2 border-t border-sidebar-border">
                  <button
                    onClick={() => setShowMore((v) => !v)}
                    aria-expanded={showMore}
                    aria-controls="sidebar-more"
                    className="w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-[12.5px] text-sidebar-foreground/50 hover:bg-white/5 hover:text-sidebar-foreground/85 transition-colors"
                  >
                    <MoreHorizontal className="h-[14px] w-[14px] flex-shrink-0" />
                    <span className="flex-1 text-left">More</span>
                    {moreBadgeCount > 0 && !showMore && (
                      <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-[11px] font-semibold text-destructive-foreground px-1">
                        {moreBadgeCount > 9 ? "9+" : moreBadgeCount}
                      </span>
                    )}
                    <span className="text-[11px] text-sidebar-foreground/30 tabular-nums">{moreCount}</span>
                    <ChevronDown className={cn("h-3.5 w-3.5 flex-shrink-0 transition-transform", showMore && "rotate-180")} />
                  </button>
                  {showMore && (
                    <div id="sidebar-more" className="mt-1">
                      {moreSections.map(renderSection)}
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })()}
      </div>

      <div className="px-3 py-3 border-t border-sidebar-border space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-sidebar-primary flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] text-white truncate font-medium">{displayName}</p>
            <p className="text-[11px] text-sidebar-foreground/40 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-[12px] text-sidebar-foreground/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </nav>
  );
}
