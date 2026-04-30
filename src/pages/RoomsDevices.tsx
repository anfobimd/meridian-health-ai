import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Plus, DoorOpen, Cpu, UserCog, MapPin } from "lucide-react";
import { toast } from "sonner";

const roomTypes = ["exam", "procedure", "consult"];
const deviceTypes = ["laser", "rf_device", "cryotherapy", "ultrasound", "injection_system", "other"];

export default function RoomsDevices() {
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: rooms, isLoading: roomsLoading } = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*, providers:assigned_provider_id(id, first_name, last_name)")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("*, rooms:room_id(id, name)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["all-providers"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const { data: roomsList } = useQuery({
    queryKey: ["rooms-list"],
    queryFn: async () => {
      const { data } = await supabase.from("rooms").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: treatmentsList } = useQuery({
    queryKey: ["all-treatments"],
    queryFn: async () => {
      const { data } = await supabase.from("treatments").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: deviceRequirements } = useQuery({
    queryKey: ["treatment-device-requirements"],
    queryFn: async () => {
      const { data } = await supabase.from("treatment_device_requirements").select("*");
      return data ?? [];
    },
  });

  const addRoom = useMutation({
    mutationFn: async (formData: FormData) => {
      const room = {
        name: formData.get("name") as string,
        room_type: formData.get("room_type") as string,
        assigned_provider_id: (formData.get("assigned_provider_id") as string) || null,
        sort_order: parseInt(formData.get("sort_order") as string) || 0,
      };
      const { error } = await supabase.from("rooms").insert(room);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["rooms-list"] });
      setRoomDialogOpen(false);
      toast.success("Room created");
    },
    onError: () => toast.error("Failed to create room"),
  });

  const toggleRoomActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("rooms").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      toast.success("Room updated");
    },
  });

  const addDevice = useMutation({
    mutationFn: async (formData: FormData) => {
      const device = {
        name: formData.get("name") as string,
        device_type: formData.get("device_type") as string,
        room_id: (formData.get("room_id") as string) || null,
        maintenance_notes: (formData.get("maintenance_notes") as string) || null,
      };
      const { error } = await supabase.from("devices").insert(device);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      setDeviceDialogOpen(false);
      toast.success("Device created");
    },
    onError: () => toast.error("Failed to create device"),
  });

  const toggleDeviceActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("devices").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Device updated");
    },
  });

  const linkTreatmentDevice = useMutation({
    mutationFn: async ({ treatment_id, device_id }: { treatment_id: string; device_id: string }) => {
      const { error } = await supabase.from("treatment_device_requirements").insert({ treatment_id, device_id, is_required: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-device-requirements"] });
      toast.success("Treatment linked to device");
    },
    onError: () => toast.error("Failed to link — may already exist"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rooms & Devices</h1>
        <p className="text-muted-foreground">Manage treatment rooms, equipment, and provider assignments</p>
      </div>

      <Tabs defaultValue="rooms">
        <TabsList>
          <TabsTrigger value="rooms">Rooms</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="requirements">Treatment Requirements</TabsTrigger>
        </TabsList>

        {/* ROOMS TAB */}
        <TabsContent value="rooms" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Add Room</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Room</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); addRoom.mutate(new FormData(e.currentTarget)); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Room Name *</Label>
                    <Input name="name" required placeholder="e.g. Room 1, Laser Suite A" />
                  </div>
                  <div className="space-y-2">
                    <Label>Room Type</Label>
                    <select name="room_type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      {roomTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Assigned Provider</Label>
                    <select name="assigned_provider_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">None</option>
                      {providers?.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sort Order</Label>
                    <Input name="sort_order" type="number" defaultValue={0} />
                  </div>
                  <Button type="submit" className="w-full" disabled={addRoom.isPending}>
                    {addRoom.isPending ? "Creating..." : "Create Room"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {roomsLoading ? (
            <div className="space-y-3">{[1,2].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-20" /></Card>)}</div>
          ) : rooms && rooms.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {rooms.map((room: any) => (
                <Card key={room.id} className={!room.is_active ? "opacity-50" : ""}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DoorOpen className="h-5 w-5 text-primary" />
                        <span className="font-semibold text-sm">{room.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-[11px]">{room.room_type}</Badge>
                    </div>
                    {room.providers && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <UserCog className="h-3 w-3" />
                        {room.providers.first_name} {room.providers.last_name}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7"
                        onClick={() => toggleRoomActive.mutate({ id: room.id, is_active: !room.is_active })}
                      >
                        {room.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card><CardContent className="py-12 text-center"><DoorOpen className="h-12 w-12 mx-auto text-muted-foreground/50" /><p className="mt-4 text-muted-foreground">No rooms yet</p></CardContent></Card>
          )}
        </TabsContent>

        {/* DEVICES TAB */}
        <TabsContent value="devices" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={deviceDialogOpen} onOpenChange={setDeviceDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Add Device</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Device</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); addDevice.mutate(new FormData(e.currentTarget)); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Device Name *</Label>
                    <Input name="name" required placeholder="e.g. PicoSure Laser" />
                  </div>
                  <div className="space-y-2">
                    <Label>Device Type</Label>
                    <select name="device_type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      {deviceTypes.map(t => <option key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Assign to Room</Label>
                    <select name="room_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">No room assigned</option>
                      {roomsList?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Maintenance Notes</Label>
                    <Textarea name="maintenance_notes" placeholder="Optional maintenance info" />
                  </div>
                  <Button type="submit" className="w-full" disabled={addDevice.isPending}>
                    {addDevice.isPending ? "Creating..." : "Create Device"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {devicesLoading ? (
            <div className="space-y-3">{[1,2].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-20" /></Card>)}</div>
          ) : devices && devices.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {devices.map((device: any) => (
                <Card key={device.id} className={!device.is_active ? "opacity-50" : ""}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-5 w-5 text-primary" />
                        <span className="font-semibold text-sm">{device.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-[11px]">{device.device_type?.replace("_", " ")}</Badge>
                    </div>
                    {device.rooms && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />{device.rooms.name}
                      </div>
                    )}
                    {device.maintenance_notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{device.maintenance_notes}</p>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7"
                      onClick={() => toggleDeviceActive.mutate({ id: device.id, is_active: !device.is_active })}
                    >
                      {device.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card><CardContent className="py-12 text-center"><Cpu className="h-12 w-12 mx-auto text-muted-foreground/50" /><p className="mt-4 text-muted-foreground">No devices yet</p></CardContent></Card>
          )}
        </TabsContent>

        {/* TREATMENT REQUIREMENTS TAB */}
        <TabsContent value="requirements" className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <p className="text-sm font-medium">Link a treatment to a required device</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  linkTreatmentDevice.mutate({
                    treatment_id: fd.get("treatment_id") as string,
                    device_id: fd.get("device_id") as string,
                  });
                  e.currentTarget.reset();
                }}
                className="flex flex-col sm:flex-row gap-3"
              >
                <select name="treatment_id" required className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Select treatment</option>
                  {treatmentsList?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select name="device_id" required className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Select device</option>
                  {devices?.filter((d: any) => d.is_active).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <Button type="submit" disabled={linkTreatmentDevice.isPending}>Link</Button>
              </form>
            </CardContent>
          </Card>

          {deviceRequirements && deviceRequirements.length > 0 ? (
            <div className="space-y-2">
              {deviceRequirements.map((req: any) => {
                const treatment = treatmentsList?.find(t => t.id === req.treatment_id);
                const device = devices?.find((d: any) => d.id === req.device_id);
                return (
                  <Card key={req.id}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <span className="text-sm">{treatment?.name ?? "Unknown"} → {(device as any)?.name ?? "Unknown"}</span>
                      <Badge variant={req.is_required ? "default" : "secondary"} className="text-[11px]">
                        {req.is_required ? "Required" : "Preferred"}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No treatment-device requirements configured</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
