import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useBooking } from "@/hooks/useBooking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, ArrowLeft, CheckCircle2, MapPin, Video } from "lucide-react";
import { format, addDays } from "date-fns";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://oqjupcgtxsbyelaigrxn.supabase.co";
const SUPABASE_ANON =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "";

async function callListings(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/marketplace-listings?${qs}`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
  });
  if (!res.ok) throw new Error((await res.json())?.error || "Request failed");
  return res.json();
}

export default function PublicBooking() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { createBooking } = useBooking();

  const [selectedTreatment, setSelectedTreatment] = useState<string>("");
  const [visitType, setVisitType] = useState<"in_person" | "telehealth">("in_person");
  const [selectedDate, setSelectedDate] = useState<string>(
    format(addDays(new Date(), 1), "yyyy-MM-dd"),
  );
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [contact, setContact] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    date_of_birth: "",
  });
  const [confirmation, setConfirmation] = useState<{ code: string; date: string } | null>(null);

  const providerQ = useQuery({
    queryKey: ["public-provider", slug],
    queryFn: () => callListings({ path: "provider", slug: slug! }),
    enabled: !!slug,
  });

  const treatmentsQ = useQuery({
    queryKey: ["public-treatments"],
    queryFn: () => callListings({ path: "treatments" }),
  });

  const slotsQ = useQuery({
    queryKey: ["public-slots", slug, selectedDate, selectedTreatment],
    queryFn: () =>
      callListings({
        path: "slots",
        slug: slug!,
        date: selectedDate,
        treatment_id: selectedTreatment,
      }),
    enabled: !!slug && !!selectedDate && !!selectedTreatment,
  });

  const provider = providerQ.data?.provider;
  const treatments = treatmentsQ.data?.treatments || [];
  const slots = slotsQ.data?.slots || [];

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !selectedTreatment || !slug) return;
    try {
      const result = await createBooking.mutateAsync({
        slug,
        treatment_id: selectedTreatment,
        scheduled_start: selectedSlot,
        first_name: contact.first_name,
        last_name: contact.last_name,
        date_of_birth: contact.date_of_birth,
        email: contact.email,
        phone: contact.phone,
        client_source: "spa_acquired",
        visit_type: visitType,
      });
      setConfirmation({ code: result.confirmation_code, date: result.scheduled_start });
    } catch {
      // useBooking handles the toast
    }
  };

  if (providerQ.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (providerQ.isError || !provider) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <h1 className="text-xl font-semibold">Provider not found</h1>
        <p className="text-sm text-muted-foreground">
          This provider isn't currently accepting bookings.
        </p>
        <Button asChild variant="outline">
          <Link to="/marketplace-public">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to all providers
          </Link>
        </Button>
      </div>
    );
  }

  if (confirmation) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <CheckCircle2 className="h-14 w-14 mx-auto text-primary" />
        <h1 className="text-2xl font-semibold">Booking Confirmed</h1>
        <p className="text-sm text-muted-foreground">
          Your appointment with {provider.first_name} {provider.last_name} on{" "}
          {format(new Date(confirmation.date), "EEEE, MMMM d 'at' h:mm a")} is confirmed.
        </p>
        <Card className="text-left">
          <CardContent className="pt-4 space-y-1">
            <p className="text-xs text-muted-foreground">Confirmation Code</p>
            <p className="font-mono font-bold">{confirmation.code}</p>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Check your email for an intake form to complete before your visit.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/marketplace-public")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> All providers
      </Button>

      <Card>
        <CardContent className="pt-6 flex items-start gap-4">
          <Avatar className="h-16 w-16">
            {provider.avatar_url && <AvatarImage src={provider.avatar_url} />}
            <AvatarFallback>
              {provider.first_name[0]}
              {provider.last_name[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold">
              {provider.first_name} {provider.last_name}
              {provider.credentials ? `, ${provider.credentials}` : ""}
            </h1>
            {provider.specialty && (
              <p className="text-sm text-muted-foreground">{provider.specialty}</p>
            )}
            {provider.bio && <p className="text-sm mt-2">{provider.bio}</p>}
            {provider.skills?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {provider.skills.map((s: any, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {s.skill_name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Visit type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={visitType === "in_person" ? "default" : "outline"}
                onClick={() => { setVisitType("in_person"); setSelectedSlot(null); }}
                className="h-auto py-3 flex flex-col items-center gap-1"
              >
                <MapPin className="h-4 w-4" />
                <span className="text-sm font-medium">In-person</span>
                <span className="text-[11px] opacity-80">Visit the clinic</span>
              </Button>
              <Button
                type="button"
                variant={visitType === "telehealth" ? "default" : "outline"}
                onClick={() => { setVisitType("telehealth"); setSelectedSlot(null); }}
                className="h-auto py-3 flex flex-col items-center gap-1"
              >
                <Video className="h-4 w-4" />
                <span className="text-sm font-medium">Telehealth</span>
                <span className="text-[11px] opacity-80">Video call</span>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Select Treatment</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              required
              value={selectedTreatment}
              onChange={(e) => {
                setSelectedTreatment(e.target.value);
                setSelectedSlot(null);
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— Choose a treatment —</option>
              {treatments.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.duration_minutes} min{t.price ? ` · $${t.price}` : ""})
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        {selectedTreatment && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Pick a Date & Time</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={selectedDate}
                  min={format(new Date(), "yyyy-MM-dd")}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSelectedSlot(null);
                  }}
                />
              </div>
              {slotsQ.isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : slots.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No available times on this date. Try another day.
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {slots.map((s: any, i: number) => (
                    <Button
                      key={i}
                      type="button"
                      variant={selectedSlot === s.start ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedSlot(s.start)}
                      className="text-xs"
                    >
                      {format(new Date(s.start), "h:mm a")}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {selectedSlot && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Your Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>First Name *</Label>
                <Input
                  required
                  value={contact.first_name}
                  onChange={(e) => setContact({ ...contact, first_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Last Name *</Label>
                <Input
                  required
                  value={contact.last_name}
                  onChange={(e) => setContact({ ...contact, last_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  required
                  value={contact.email}
                  onChange={(e) => setContact({ ...contact, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={contact.phone}
                  onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={contact.date_of_birth}
                  onChange={(e) => setContact({ ...contact, date_of_birth: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {selectedSlot && (
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={createBooking.isPending}
          >
            {createBooking.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Confirming...
              </>
            ) : (
              `Confirm Booking — ${format(new Date(selectedSlot), "EEEE, MMMM d 'at' h:mm a")}`
            )}
          </Button>
        )}
      </form>
    </div>
  );
}
