import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Bell, Send, Phone, Mail, Eye } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";

export default function NotificationCenter() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const [sendOpen, setSendOpen] = useState(false);
  const [sendForm, setSendForm] = useState({ to: "", body: "", channel: "sms" as "sms" | "in_app" });

  // My notifications
  const { data: notifications = [] } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: async () => {
      const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
  });

  // Provider notification prefs (admin view)
  const { data: prefs = [] } = useQuery({
    queryKey: ["provider-notif-prefs"],
    queryFn: async () => {
      const { data } = await supabase.from("provider_notification_prefs").select("*, providers(first_name, last_name)");
      return data || [];
    },
  });

  const { data: providers = [] } = useQuery({
    queryKey: ["all-providers"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name, phone").eq("is_active", true);
      return data || [];
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notifications"] }),
  });

  const sendSms = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: { to: sendForm.to, body: sendForm.body },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("SMS sent");
      setSendOpen(false);
      setSendForm({ to: "", body: "", channel: "sms" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleDailySms = useMutation({
    mutationFn: async ({ providerId, enabled, phone }: { providerId: string; enabled: boolean; phone?: string }) => {
      const existing = prefs.find(p => p.provider_id === providerId);
      if (existing) {
        await supabase.from("provider_notification_prefs").update({ daily_sms_enabled: enabled }).eq("id", existing.id);
      } else {
        await supabase.from("provider_notification_prefs").insert({
          provider_id: providerId,
          daily_sms_enabled: enabled,
          phone_number: phone || null,
        });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["provider-notif-prefs"] }); toast.success("Updated"); },
  });

  const unread = notifications.filter(n => !n.read_at).length;

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">Manage notifications and SMS delivery</p>
        </div>
        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogTrigger asChild><Button size="sm"><Send className="h-4 w-4 mr-1" />Send SMS</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Send SMS</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Phone (E.164)</Label><Input value={sendForm.to} onChange={e => setSendForm(p => ({ ...p, to: e.target.value }))} placeholder="+15558675310" /></div>
              <div><Label>Message</Label><Input value={sendForm.body} onChange={e => setSendForm(p => ({ ...p, body: e.target.value }))} placeholder="Your appointment is tomorrow at 10am" /></div>
              <Button onClick={() => sendSms.mutate()} disabled={!sendForm.to || !sendForm.body || sendSms.isPending}>
                {sendSms.isPending ? "Sending…" : "Send"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6 flex items-center gap-3"><Bell className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{notifications.length}</p><p className="text-xs text-muted-foreground">Total</p></div></CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3"><Eye className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{unread}</p><p className="text-xs text-muted-foreground">Unread</p></div></CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3"><Phone className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{prefs.filter(p => p.daily_sms_enabled).length}</p><p className="text-xs text-muted-foreground">Daily SMS Enabled</p></div></CardContent></Card>
      </div>

      <Tabs defaultValue="inbox">
        <TabsList><TabsTrigger value="inbox">Inbox</TabsTrigger><TabsTrigger value="sms-prefs">Provider SMS Prefs</TabsTrigger></TabsList>

        <TabsContent value="inbox">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Channel</TableHead><TableHead>Status</TableHead><TableHead>Time</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {notifications.map(n => (
                    <TableRow key={n.id} className={!n.read_at ? "bg-primary/5" : ""}>
                      <TableCell>
                        <p className="font-medium text-sm">{n.title}</p>
                        {n.body && <p className="text-xs text-muted-foreground truncate max-w-[300px]">{n.body}</p>}
                      </TableCell>
                      <TableCell><Badge variant="secondary">{n.channel}</Badge></TableCell>
                      <TableCell><Badge variant={n.status === "sent" ? "default" : n.status === "failed" ? "destructive" : "secondary"}>{n.status}</Badge></TableCell>
                      <TableCell className="text-xs">{format(new Date(n.created_at), "MMM d, h:mm a")}</TableCell>
                      <TableCell>
                        {!n.read_at && <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)}>Mark Read</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {notifications.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No notifications</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sms-prefs">
          <Card>
            <CardHeader><CardTitle>Provider Daily SMS Schedule</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>Phone</TableHead><TableHead>Daily SMS</TableHead></TableRow></TableHeader>
                <TableBody>
                  {providers.map(prov => {
                    const pref = prefs.find(p => p.provider_id === prov.id);
                    return (
                      <TableRow key={prov.id}>
                        <TableCell className="font-medium">{prov.first_name} {prov.last_name}</TableCell>
                        <TableCell className="text-xs">{prov.phone || pref?.phone_number || "—"}</TableCell>
                        <TableCell>
                          <Switch
                            checked={pref?.daily_sms_enabled || false}
                            onCheckedChange={v => toggleDailySms.mutate({ providerId: prov.id, enabled: v, phone: prov.phone || undefined })}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
