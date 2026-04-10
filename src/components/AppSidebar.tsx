import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Calendar, Stethoscope, ClipboardList, UserCog,
  Activity, FlaskConical, FileText, Pill, DollarSign, ClipboardPlus, ShieldCheck, DoorOpen, Store, Package,
  CreditCard, TrendingUp, Calculator, MonitorCheck, Briefcase, Search, LogOut, CalendarClock, TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const navSections = [
  {
    label: "WORKFLOWS",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/front-desk", icon: MonitorCheck, label: "Front Desk" },
      { to: "/provider-day", icon: Briefcase, label: "My Day" },
      { to: "/my-marketplace", icon: Store, label: "My Marketplace" },
    ],
  },
  {
    label: "CLINICAL",
    items: [
      { to: "/patients", icon: Users, label: "Patients" },
      { to: "/appointments", icon: Calendar, label: "Appointments" },
      { to: "/encounters", icon: FileText, label: "Encounters" },
      { to: "/clinical-notes", icon: ClipboardList, label: "Clinical Notes" },
      { to: "/hormone-visits", icon: FlaskConical, label: "Hormone Labs" },
      { to: "/hormone-intake", icon: ClipboardPlus, label: "Hormone Intake" },
      { to: "/physician-approval", icon: ShieldCheck, label: "Approvals" },
      { to: "/protocols", icon: Pill, label: "Protocols" },
    ],
  },
  {
    label: "OVERSIGHT",
    items: [
      { to: "/md-oversight", icon: ShieldCheck, label: "Oversight Hub" },
      { to: "/md-oversight/dashboard", icon: Activity, label: "Oversight Dashboard" },
      { to: "/churn-risk", icon: TrendingDown, label: "Churn Risk" },
    ],
  },
  {
    label: "ADMIN",
    items: [
      { to: "/treatments", icon: Stethoscope, label: "Treatments" },
      { to: "/rooms-devices", icon: DoorOpen, label: "Rooms & Devices" },
      { to: "/provider-schedule", icon: CalendarClock, label: "Schedules" },
      { to: "/providers", icon: UserCog, label: "Providers" },
      { to: "/billing", icon: DollarSign, label: "Billing" },
      { to: "/marketplace", icon: Store, label: "Marketplace" },
      { to: "/packages", icon: Package, label: "Packages" },
      { to: "/membership-billing", icon: CreditCard, label: "Memberships" },
      { to: "/earnings", icon: TrendingUp, label: "Earnings" },
      { to: "/proforma", icon: Calculator, label: "Proforma" },
    ],
  },
];

export function AppSidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();

  const initials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : "??";

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "User";

  return (
    <aside className="hidden md:flex w-56 flex-col bg-sidebar text-sidebar-foreground min-h-screen flex-shrink-0">
      <div className="px-5 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-sidebar-primary" />
          <span className="font-serif text-base font-semibold text-white tracking-tight">Meridian</span>
        </div>
        <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-sidebar-primary mt-0.5">WELLNESS EHR</p>
      </div>

      {/* Cmd+K hint */}
      <button
        onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-sidebar-border px-3 py-1.5 text-[11px] text-sidebar-foreground/40 hover:bg-white/5 transition-colors"
      >
        <Search className="h-3 w-3" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="text-[9px] bg-sidebar-muted px-1 py-0.5 rounded font-mono">⌘K</kbd>
      </button>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="px-3 pt-4 pb-1 text-[9px] font-bold tracking-[0.14em] uppercase text-sidebar-foreground/25">{section.label}</p>
            {section.items.map((item) => {
              const isActive = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
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
                  {item.label}
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
