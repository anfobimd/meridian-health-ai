import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Menu, X, Activity, LayoutDashboard, Users, Calendar, Stethoscope,
  ClipboardList, UserCog, FlaskConical, FileText, Pill, DollarSign, ClipboardPlus, ShieldCheck, DoorOpen, Store, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/patients", icon: Users, label: "Patients" },
  { to: "/appointments", icon: Calendar, label: "Appointments" },
  { to: "/encounters", icon: FileText, label: "Encounters" },
  { to: "/clinical-notes", icon: ClipboardList, label: "Clinical Notes" },
  { to: "/hormone-visits", icon: FlaskConical, label: "Hormone Labs" },
  { to: "/hormone-intake", icon: ClipboardPlus, label: "Hormone Intake" },
  { to: "/physician-approval", icon: ShieldCheck, label: "Approvals" },
  { to: "/protocols", icon: Pill, label: "Protocols" },
  { to: "/md-oversight", icon: ShieldCheck, label: "MD Chart Review" },
  { to: "/md-oversight/dashboard", icon: Activity, label: "Oversight Dashboard" },
  { to: "/treatments", icon: Stethoscope, label: "Treatments" },
  { to: "/rooms-devices", icon: DoorOpen, label: "Rooms & Devices" },
  { to: "/providers", icon: UserCog, label: "Providers" },
  { to: "/billing", icon: DollarSign, label: "Billing" },
  { to: "/marketplace", icon: Store, label: "Marketplace" },
  { to: "/packages", icon: Package, label: "Packages" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="md:hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <span className="font-serif font-semibold">Meridian</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>
      {open && (
        <nav className="border-b bg-card px-3 py-2 space-y-1">
          {navItems.map((item) => {
            const isActive = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
}
