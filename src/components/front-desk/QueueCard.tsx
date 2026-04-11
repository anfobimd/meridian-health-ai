import { useState } from "react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckInPanel } from "./CheckInPanel";
import { CheckoutPanel } from "./CheckoutPanel";
import {
  CheckCircle2, DoorOpen, Play, Flag, Clock, CreditCard, UserCheck,
} from "lucide-react";

const nextActionMap: Record<string, { label: string; nextStatus: string; icon: React.ElementType } | undefined> = {
  booked: { label: "Check In", nextStatus: "checked_in", icon: CheckCircle2 },
  checked_in: { label: "Room", nextStatus: "roomed", icon: DoorOpen },
  roomed: { label: "Start", nextStatus: "in_progress", icon: Play },
  in_progress: { label: "Checkout", nextStatus: "completed", icon: Flag },
};

export function QueueCard({ apt, onStatusChange, onNoShow }: {
  apt: any;
  onStatusChange: (id: string, status: string) => void;
  onNoShow: (id: string) => void;
}) {
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const action = nextActionMap[apt.status];
  const waitTime = apt.status === "checked_in" && apt.checked_in_at
    ? `${differenceInMinutes(new Date(), parseISO(apt.checked_in_at))}m`
    : null;

  const isWalkin = apt.notes?.includes("Walk-in");

  const handleAction = () => {
    if (apt.status === "booked") {
      setCheckInOpen(true);
    } else if (apt.status === "in_progress") {
      setCheckoutOpen(true);
    } else if (action) {
      onStatusChange(apt.id, action.nextStatus);
    }
  };

  return (
    <>
      <Card className="shadow-sm">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-sm leading-tight flex items-center gap-1">
                {apt.patients?.first_name} {apt.patients?.last_name}
                {isWalkin && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 border-accent text-accent-foreground ml-1">
                    <UserCheck className="h-2.5 w-2.5 mr-0.5" />Walk-in
                  </Badge>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {format(parseISO(apt.scheduled_at), "h:mm a")}
                {apt.treatments?.name && ` · ${apt.treatments.name}`}
              </p>
            </div>
            {waitTime && (
              <Badge variant="outline" className="text-[10px] text-warning border-warning/30">
                <Clock className="h-2.5 w-2.5 mr-0.5" />{waitTime}
              </Badge>
            )}
          </div>
          {apt.providers && (
            <p className="text-[10px] text-muted-foreground">Dr. {apt.providers.last_name}</p>
          )}
          {apt.rooms && (
            <p className="text-[10px] text-muted-foreground">Room: {apt.rooms.name}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {action && (
              <Button
                size="sm"
                variant="default"
                className="h-7 text-[11px] flex-1"
                onClick={handleAction}
              >
                <action.icon className="h-3 w-3 mr-1" />{action.label}
              </Button>
            )}
            {apt.status === "booked" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] text-destructive"
                onClick={() => onNoShow(apt.id)}
              >
                No-Show
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Check-In Panel */}
      <CheckInPanel appointment={apt} open={checkInOpen} onOpenChange={setCheckInOpen} />

      {/* Checkout Panel with AI Review */}
      <CheckoutPanel appointmentId={apt.id} open={checkoutOpen} onOpenChange={setCheckoutOpen} />
    </>
  );
}
