import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Bell, Loader2, Sparkles, Clock } from "lucide-react";

const NOTIFICATION_TYPES = [
  { key: "appointment_reminder", label: "Appointment Reminders" },
  { key: "new_message", label: "New Patient Messages" },
  { key: "aftercare", label: "Aftercare Follow-ups" },
  { key: "cancellation", label: "Cancellations" },
  { key: "waitlist_match", label: "Waitlist Matches" },
  { key: "chart_review", label: "Chart Reviews Ready" },
];

const CHANNELS = ["sms", "email", "push", "in_app"] as const;

export function NotificationPreferences() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [quietHours, setQuietHours] = useState({
    start: "21:00",
    end: "08:00",
    enabled: false,
  });

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notif-prefs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_notification_preferences")
        .select("*")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    if (prefs) {
      const quietHoursPrefs = prefs.filter((p: any) => p.notification_type === "quiet_hours");
      if (quietHoursPrefs.length > 0) {
        const qh = quietHoursPrefs[0];
        setQuietHours({
          start: qh.quiet_hours_start || "21:00",
          end: qh.quiet_hours_end || "08:00",
          enabled: qh.is_enabled ?? false,
        });
      }
    }
  }, [prefs]);

  const getPref = (type: string, channel: string) => {
    return prefs?.find(
      (p: any) => p.notification_type === type && p.channel === channel
    );
  };

  const isEnabled = (type: string, channel: string) => {
    const pref = getPref(type, channel);
    return pref?.is_enabled ?? (channel === "in_app");
  };

  const togglePref = useMutation({
    mutationFn: async ({
      type,
      channel,
      enabled,
    }: {
      type: string;
      channel: string;
      enabled: boolean;
    }) => {
      const existing = getPref(type, channel);
      if (existing) {
        const { error } = await (supabase as any)
          .from("staff_notification_preferences")
          .update({ is_enabled: enabled })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("staff_notification_preferences")
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

  const saveQuietHours = useMutation({
    mutationFn: async () => {
      const existing = prefs?.find((p: any) => p.notification_type === "quiet_hours");

      if (existing) {
        const { error } = await (supabase as any)
          .from("staff_notification_preferences")
          .update({
            is_enabled: quietHours.enabled,
            quiet_hours_start: quietHours.start,
            quiet_hours_end: quietHours.end,
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("staff_notification_preferences")
          .insert({
            user_id: user!.id,
            notification_type: "quiet_hours",
            is_enabled: quietHours.enabled,
            quiet_hours_start: quietHours.start,
            quiet_hours_end: quietHours.end,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notif-prefs", user?.id] });
      toast.success("Quiet hours updated");
    },
    onError: () => toast.error("Failed to save quiet hours"),
  });

  const suggestSettings = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "ai-provider-coach",
        {
          body: {
            mode: "notification_suggest",
            current_prefs: prefs,
            role,
          },
        }
      );

      if (error) throw error;

      toast.success("Settings suggested", {
        description: data?.message || "Check the recommended settings",
      });
    } catch (error: any) {
      toast.error("Failed to get suggestions");
    } finally {
      setAiLoading(false);
    }
  };

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
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Preferences
        </CardTitle>
        <CardDescription>Choose how you receive notifications for each type</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1">
          <div className="grid grid-cols-5 gap-4 pb-2 border-b">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Type
            </div>
            {CHANNELS.map((ch) => (
              <div
                key={ch}
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center"
              >
                {ch === "in_app" ? "In-App" : ch === "push" ? "Push" : ch.toUpperCase()}
              </div>
            ))}
          </div>

          {NOTIFICATION_TYPES.map((nt) => (
            <div
              key={nt.key}
              className="grid grid-cols-5 gap-4 py-2.5 items-center border-b border-muted/50"
            >
              <div className="text-sm">{nt.label}</div>
              {CHANNELS.map((ch) => (
                <div key={ch} className="flex justify-center">
                  <Switch
                    checked={isEnabled(nt.key, ch)}
                    onCheckedChange={(checked) =>
                      togglePref.mutate({
                        type: nt.key,
                        channel: ch,
                        enabled: checked,
                      })
                    }
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <div>
                <Label className="text-base font-semibold">Quiet Hours</Label>
                <p className="text-xs text-muted-foreground">
                  Suppress non-critical notifications during these times
                </p>
              </div>
            </div>
            <Switch
              checked={quietHours.enabled}
              onCheckedChange={(checked) =>
                setQuietHours({ ...quietHours, enabled: checked })
              }
            />
          </div>

          {quietHours.enabled && (
            <div className="grid grid-cols-2 gap-4 pl-7 py-3 bg-muted/30 rounded-lg">
              <div className="space-y-2">
                <Label htmlFor="quiet-start">Start Time</Label>
                <Input
                  id="quiet-start"
                  type="time"
                  value={quietHours.start}
                  onChange={(e) =>
                    setQuietHours({ ...quietHours, start: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiet-end">End Time</Label>
                <Input
                  id="quiet-end"
                  type="time"
                  value={quietHours.end}
                  onChange={(e) =>
                    setQuietHours({ ...quietHours, end: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          {quietHours.enabled && (
            <Button
              onClick={() => saveQuietHours.mutate()}
              disabled={saveQuietHours.isPending}
              size="sm"
              variant="outline"
              className="ml-7"
            >
              {saveQuietHours.isPending ? "Saving..." : "Save Quiet Hours"}
            </Button>
          )}
        </div>

        <Separator />

        <Button
          onClick={suggestSettings}
          disabled={aiLoading}
          variant="outline"
          className="w-full"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {aiLoading ? "Analyzing..." : "Suggest Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
