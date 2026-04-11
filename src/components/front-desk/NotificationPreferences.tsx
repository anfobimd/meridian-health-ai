import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Bell, Loader2 } from "lucide-react";

const NOTIFICATION_TYPES = [
  { key: "appointment_reminder", label: "Appointment Reminders" },
  { key: "new_message", label: "New Patient Messages" },
  { key: "aftercare", label: "Aftercare Follow-ups" },
  { key: "cancellation", label: "Cancellations" },
  { key: "waitlist_match", label: "Waitlist Matches" },
  { key: "chart_review", label: "Chart Reviews Ready" },
];

const CHANNELS = ["sms", "email", "in_app"] as const;

export function NotificationPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notif-prefs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_notification_preferences")
        .select("*")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const getPref = (type: string, channel: string) => {
    return prefs?.find((p: any) => p.notification_type === type && p.channel === channel);
  };

  const isEnabled = (type: string, channel: string) => {
    const pref = getPref(type, channel);
    return pref?.is_enabled ?? (channel === "in_app"); // default in_app on
  };

  const togglePref = useMutation({
    mutationFn: async ({ type, channel, enabled }: { type: string; channel: string; enabled: boolean }) => {
      const existing = getPref(type, channel);
      if (existing) {
        const { error } = await supabase.from("staff_notification_preferences")
          .update({ is_enabled: enabled })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("staff_notification_preferences")
          .insert({
            user_id: user!.id,
            notification_type: type,
            channel,
            is_enabled: enabled,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notif-prefs", user?.id] });
    },
    onError: () => toast.error("Failed to update preference"),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Notification Preferences</CardTitle>
        <CardDescription>Choose how you receive notifications for each type</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-4 gap-4 pb-2 border-b">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</div>
            {CHANNELS.map(ch => (
              <div key={ch} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                {ch === "in_app" ? "In-App" : ch.toUpperCase()}
              </div>
            ))}
          </div>

          {/* Rows */}
          {NOTIFICATION_TYPES.map(nt => (
            <div key={nt.key} className="grid grid-cols-4 gap-4 py-2.5 items-center border-b border-muted/50">
              <div className="text-sm">{nt.label}</div>
              {CHANNELS.map(ch => (
                <div key={ch} className="flex justify-center">
                  <Switch
                    checked={isEnabled(nt.key, ch)}
                    onCheckedChange={(checked) => togglePref.mutate({ type: nt.key, channel: ch, enabled: checked })}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
