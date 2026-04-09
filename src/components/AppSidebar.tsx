import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Calendar, Stethoscope, ClipboardList, UserCog,
  Activity, FlaskConical, FileText, Pill, DollarSign, ClipboardPlus, ShieldCheck, DoorOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navSections = [
  {
    label: "CLINICAL",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard" },
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
      { to: "/md-oversight", icon: ShieldCheck, label: "MD Chart Review" },
      { to: "/md-oversight/dashboard", icon: Activity, label: "Oversight Dashboard" },
    ],
  },
  {
    label: "ADMIN",
    items: [
      { to: "/treatments", icon: Stethoscope, label: "Treatments" },
      { to: "/rooms-devices", icon: DoorOpen, label: "Rooms & Devices" },
      { to: "/providers", icon: UserCog, label: "Providers" },
      { to: "/billing", icon: DollarSign, label: "Billing" },
    ],
  },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="hidden md:flex w-56 flex-col bg-sidebar text-sidebar-foreground min-h-screen flex-shrink-0">
      <div className="px-5 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-sidebar-primary" />
          <span className="font-serif text-base font-semibold text-white tracking-tight">Meridian</span>
        </div>
        <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-sidebar-primary mt-0.5">WELLNESS EHR</p>
      </div>

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
          <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-sidebar-primary flex-shrink-0">PP</div>
          <div className="min-w-0">
            <p className="text-[11.5px] text-white truncate font-medium">Priya Patel, NP</p>
            <p className="text-[10px] text-sidebar-foreground/40">Aesthetic Nursing</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
