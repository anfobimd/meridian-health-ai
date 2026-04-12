import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserPlus, CalendarPlus, Calculator, Package, ClipboardPlus } from "lucide-react";
import { PatientRegistrationDialog } from "./PatientRegistrationDialog";
import { PricingQuoteTool } from "./PricingQuoteTool";
import { PackageSalePanel } from "./PackageSalePanel";

type DockAction = "walkin" | "book" | "quote" | "package" | "register" | null;

export function QuickDock({
  onWalkIn,
}: {
  onWalkIn: () => void;
}) {
  const [active, setActive] = useState<DockAction>(null);

  const actions = [
    { key: "walkin" as const, icon: UserPlus, label: "Walk-In", onClick: onWalkIn },
    { key: "quote" as const, icon: Calculator, label: "Quote" },
    { key: "package" as const, icon: Package, label: "Package" },
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
              onClick={() => a.onClick ? a.onClick() : setActive(a.key)}
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

      {/* Package Sale Sheet */}
      <Sheet open={active === "package"} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Sell Package</SheetTitle></SheetHeader>
          <div className="mt-4">
            <PackageSalePanel />
          </div>
        </SheetContent>
      </Sheet>

      {/* Patient Registration */}
      <PatientRegistrationDialog
        open={active === "register"}
        onOpenChange={(o) => !o && setActive(null)}
      />
    </>
  );
}
