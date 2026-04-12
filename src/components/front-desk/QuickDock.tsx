import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserPlus, Calculator, ClipboardPlus, Link2 } from "lucide-react";
import { PatientRegistrationDialog } from "./PatientRegistrationDialog";
import { PricingQuoteTool } from "./PricingQuoteTool";
import { SendIntakeLinkDialog } from "./SendIntakeLinkDialog";

type DockAction = "quote" | "register" | "sendlink" | null;

export function QuickDock({
  onWalkIn,
  patients,
}: {
  onWalkIn: () => void;
  patients?: { id: string; first_name: string; last_name: string; phone?: string | null; email?: string | null }[];
}) {
  const [active, setActive] = useState<DockAction>(null);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);

  const actions = [
    { key: "walkin" as const, icon: UserPlus, label: "Walk-In", onClick: onWalkIn },
    { key: "sendlink" as const, icon: Link2, label: "Send Intake" },
    { key: "quote" as const, icon: Calculator, label: "Quote" },
    { key: "register" as const, icon: ClipboardPlus, label: "Register" },
  ];

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 md:left-56 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-2">
        <div className="flex items-center justify-center gap-2 max-w-2xl mx-auto">
          {actions.map((a) => (
            <Button
              key={a.key}
              variant="outline"
              size="sm"
              className="flex-1 max-w-[140px] h-9 text-xs gap-1.5"
              onClick={() => a.onClick ? a.onClick() : setActive(a.key as DockAction)}
            >
              <a.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{a.label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Pricing Quote Sheet */}
      <Sheet open={active === "quote"} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Pricing Quote</SheetTitle></SheetHeader>
          <div className="mt-4">
            <PricingQuoteTool />
          </div>
        </SheetContent>
      </Sheet>

      {/* Patient Registration */}
      <PatientRegistrationDialog
        open={active === "register"}
        onOpenChange={(o) => !o && setActive(null)}
      />

      {/* Send Intake Link — with patient selector */}
      {active === "sendlink" && (
        <SendIntakeLinkPatientPicker
          patients={patients || []}
          onSelect={(p) => { setSelectedPatient(p); }}
          onClose={() => { setActive(null); setSelectedPatient(null); }}
          selectedPatient={selectedPatient}
        />
      )}
    </>
  );
}

// Simple inline patient picker that opens SendIntakeLinkDialog after selection
function SendIntakeLinkPatientPicker({
  patients,
  onSelect,
  onClose,
  selectedPatient,
}: {
  patients: any[];
  onSelect: (p: any) => void;
  onClose: () => void;
  selectedPatient: any;
}) {
  const [search, setSearch] = useState("");

  if (selectedPatient) {
    return (
      <SendIntakeLinkDialog
        open={true}
        onOpenChange={(o) => { if (!o) onClose(); }}
        patient={selectedPatient}
      />
    );
  }

  const filtered = patients.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${p.first_name} ${p.last_name}`.toLowerCase().includes(q);
  }).slice(0, 20);

  // Use the Dialog for patient selection
  const { Dialog, DialogContent, DialogHeader, DialogTitle } = require("@/components/ui/dialog");
  const { Input } = require("@/components/ui/input");

  return (
    <Dialog open={true} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Select Patient</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search patients..."
          value={search}
          onChange={(e: any) => setSearch(e.target.value)}
          className="h-9"
        />
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {filtered.map((p: any) => (
            <button
              key={p.id}
              className="w-full text-left p-2 rounded-md hover:bg-muted text-sm flex justify-between items-center"
              onClick={() => onSelect(p)}
            >
              <span className="font-medium">{p.last_name}, {p.first_name}</span>
              {p.phone && <span className="text-xs text-muted-foreground">{p.phone}</span>}
            </button>
          ))}
          {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No patients found</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
