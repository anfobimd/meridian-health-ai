import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Users, Calendar, FileText, Package, Stethoscope, UserCog, LayoutDashboard } from "lucide-react";

type SearchResult = {
  id: string;
  type: "patient" | "appointment" | "encounter" | "provider" | "page";
  title: string;
  subtitle?: string;
};

const PAGES: SearchResult[] = [
  { id: "/", type: "page", title: "Dashboard", subtitle: "Home" },
  { id: "/front-desk", type: "page", title: "Front Desk", subtitle: "Today's queue" },
  { id: "/provider-day", type: "page", title: "My Day", subtitle: "Provider schedule" },
  { id: "/patients", type: "page", title: "Patients", subtitle: "Patient list" },
  { id: "/appointments", type: "page", title: "Appointments", subtitle: "Scheduling" },
  { id: "/encounters", type: "page", title: "Encounters", subtitle: "Clinical encounters" },
  { id: "/clinical-notes", type: "page", title: "Clinical Notes", subtitle: "SOAP notes" },
  { id: "/hormone-visits", type: "page", title: "Hormone Labs", subtitle: "Lab results" },
  { id: "/hormone-intake", type: "page", title: "Hormone Intake", subtitle: "New intake" },
  { id: "/physician-approval", type: "page", title: "Approvals", subtitle: "Hormone approvals" },
  { id: "/protocols", type: "page", title: "Protocols", subtitle: "Treatment protocols" },
  { id: "/md-oversight", type: "page", title: "MD Chart Review", subtitle: "Oversight queue" },
  { id: "/treatments", type: "page", title: "Treatments", subtitle: "Treatment catalog" },
  { id: "/rooms-devices", type: "page", title: "Rooms & Devices" },
  { id: "/providers", type: "page", title: "Providers", subtitle: "Staff" },
  { id: "/billing", type: "page", title: "Billing" },
  { id: "/marketplace", type: "page", title: "Marketplace" },
  { id: "/packages", type: "page", title: "Packages" },
  { id: "/membership-billing", type: "page", title: "Memberships" },
  { id: "/earnings", type: "page", title: "Earnings" },
  { id: "/proforma", type: "page", title: "Proforma" },
];

const iconMap: Record<string, React.ElementType> = {
  patient: Users,
  appointment: Calendar,
  encounter: FileText,
  provider: UserCog,
  page: LayoutDashboard,
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Search when query changes
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      const q = query.trim();
      const searchResults: SearchResult[] = [];

      try {
        // Search patients
        const { data: patients } = await supabase
          .from("patients")
          .select("id, first_name, last_name, phone")
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`)
          .limit(5);

        patients?.forEach((p) => {
          searchResults.push({
            id: p.id,
            type: "patient",
            title: `${p.first_name} ${p.last_name}`,
            subtitle: p.phone || undefined,
          });
        });

        // Search providers
        const { data: provs } = await supabase
          .from("providers")
          .select("id, first_name, last_name, specialty")
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
          .limit(3);

        provs?.forEach((p) => {
          searchResults.push({
            id: p.id,
            type: "provider",
            title: `Dr. ${p.first_name} ${p.last_name}`,
            subtitle: p.specialty || undefined,
          });
        });
      } catch {
        // silently fail search
      }

      setResults(searchResults);
      setLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const filteredPages = PAGES.filter(
    (p) =>
      !query ||
      p.title.toLowerCase().includes(query.toLowerCase()) ||
      p.subtitle?.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      setQuery("");
      switch (result.type) {
        case "patient":
          navigate(`/patients/${result.id}`);
          break;
        case "provider":
          navigate(`/providers`);
          break;
        case "page":
          navigate(result.id);
          break;
        default:
          break;
      }
    },
    [navigate]
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search patients, pages, providers..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{loading ? "Searching..." : "No results found."}</CommandEmpty>

        {results.length > 0 && (
          <CommandGroup heading="Search Results">
            {results.map((r) => {
              const Icon = iconMap[r.type] || LayoutDashboard;
              return (
                <CommandItem key={`${r.type}-${r.id}`} onSelect={() => handleSelect(r)}>
                  <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm">{r.title}</p>
                    {r.subtitle && <p className="text-xs text-muted-foreground">{r.subtitle}</p>}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {filteredPages.length > 0 && (
          <CommandGroup heading="Pages">
            {filteredPages.slice(0, 8).map((p) => (
              <CommandItem key={p.id} onSelect={() => handleSelect(p)}>
                <LayoutDashboard className="mr-2 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm">{p.title}</p>
                  {p.subtitle && <p className="text-xs text-muted-foreground">{p.subtitle}</p>}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
