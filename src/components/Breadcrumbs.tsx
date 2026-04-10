import { useLocation, Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const ROUTE_LABELS: Record<string, string> = {
  "": "Dashboard",
  "patients": "Patients",
  "appointments": "Appointments",
  "encounters": "Encounters",
  "chart": "Chart",
  "clinical-notes": "Clinical Notes",
  "hormone-visits": "Hormone Labs",
  "hormone-intake": "Hormone Intake",
  "physician-approval": "Approvals",
  "protocols": "Protocols",
  "md-oversight": "MD Oversight",
  "dashboard": "Dashboard",
  "treatments": "Treatments",
  "rooms-devices": "Rooms & Devices",
  "providers": "Providers",
  "billing": "Billing",
  "marketplace": "Marketplace",
  "packages": "Packages",
  "membership-billing": "Memberships",
  "earnings": "Earnings",
  "proforma": "Proforma",
  "front-desk": "Front Desk",
  "provider-day": "My Day",
};

export function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  // Don't show breadcrumbs on dashboard
  if (segments.length === 0) return null;

  const crumbs = segments.map((seg, i) => {
    const path = "/" + segments.slice(0, i + 1).join("/");
    const label = ROUTE_LABELS[seg] || (seg.length > 8 ? `${seg.slice(0, 8)}…` : seg);
    const isLast = i === segments.length - 1;
    return { path, label, isLast };
  });

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/" className="text-xs">Dashboard</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {crumbs.map((crumb, i) => (
          <span key={crumb.path} className="contents">
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {crumb.isLast ? (
                <BreadcrumbPage className="text-xs">{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={crumb.path} className="text-xs">{crumb.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
