import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Inbox, Search, Sparkles, Send, CheckCircle2, Clock, AlertTriangle,
  MessageSquare, Loader2, Archive, RefreshCw, CalendarDays, Package, User,
} from "lucide-react";

const INTENT_COLORS: Record<string, string> = {
  appointment_request: "bg-primary/10 text-primary",
  cancellation: "bg-destructive/10 text-destructive",
  reschedule: "bg-warning/10 text-warning",
  pricing: "bg-info/10 text-info",
  aftercare: "bg-success/10 text-success",
  complaint: "bg-destructive/10 text-destructive",
  lab_results: "bg-accent/10 text-accent-foreground",
  refill: "bg-primary/10 text-primary",
  general: "bg-muted text-muted-foreground",
};

/* ── Patient Context Sidebar ── */
function PatientContextCard({ patientId }: { patientId: string }) {
  const { data: nextApt } = useQuery({
    queryKey: ["patient-next-apt", patientId],
    queryFn: async () => {
      const { data } = await supabase.from("appointments")
        .select("scheduled_at, treatments(name), providers(first_name, last_name)")
        .eq("patient_id", patientId)
        .gte("scheduled_at", new Date().toISOString())
        .eq("status", "booked" as any)
        .order("scheduled_at")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: lastVisit } = useQuery({
    queryKey: ["patient-last-visit-inbox", patientId],
    queryFn: async () => {
      const { data } = await supabase.from("appointments")
        .select("completed_at, treatments(name)")
        .eq("patient_id", patientId)
        .eq("status", "completed" as any)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: packageBalance } = useQuery({
    queryKey: ["patient-pkg-balance-inbox", patientId],
    queryFn: async () => {
      const { data } = await supabase.from("patient_package_purchases")
        .select("sessions_total, sessions_used, packages:package_id(name)")
        .eq("patient_id", patientId)
        .eq("status", "active");
      return (data ?? []).filter((p: any) => (p.sessions_total - (p.sessions_used || 0)) > 0);
    },
  });

  const { data: openItems } = useQuery({
    queryKey: ["patient-open-items-inbox", patientId],
    queryFn: async () => {
      const { data } = await supabase.from("invoices")
        .select("balance_due")
        .eq("patient_id", patientId)
        .neq("status", "paid")
        .gt("balance_due", 0);
      return data ?? [];
    },
  });

  const totalOwed = openItems?.reduce((s, i: any) => s + (i.balance_due || 0), 0) || 0;

  return (
    <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <User className="h-3 w-3" />Patient Context
      </p>

      {/* Next Appointment */}
      <div className="space-y-0.5">
        <p className="text-[11px] text-muted-foreground flex items-center gap-1"><CalendarDays className="h-2.5 w-2.5" />Next Appointment</p>
        {nextApt ? (
          <p className="text-xs">
            {format(new Date(nextApt.scheduled_at), "MMM d 'at' h:mm a")}
            {(nextApt as any).treatments?.name && ` · ${(nextApt as any).treatments.name}`}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic">None scheduled</p>
        )}
      </div>

      {/* Last Visit */}
      <div className="space-y-0.5">
        <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="h-2.5 w-2.5" />Last Visit</p>
        {lastVisit?.completed_at ? (
          <p className="text-xs">
            {format(new Date(lastVisit.completed_at), "MMM d, yyyy")}
            {(lastVisit as any).treatments?.name && ` · ${(lastVisit as any).treatments.name}`}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic">No visits</p>
        )}
      </div>

      {/* Package Balance */}
      {(packageBalance?.length ?? 0) > 0 && (
        <div className="space-y-0.5">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Package className="h-2.5 w-2.5" />Package Credits</p>
          {packageBalance!.map((p: any, i: number) => (
            <p key={i} className="text-xs">
              {(p.packages as any)?.name}: {p.sessions_total - (p.sessions_used || 0)} left
            </p>
          ))}
        </div>
      )}

      {/* Outstanding Balance */}
      {totalOwed > 0 && (
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 text-warning" />
          <p className="text-xs text-warning font-medium">Balance due: ${totalOwed.toFixed(2)}</p>
        </div>
      )}
    </div>
  );
}

export default function PatientInbox() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unresolved" | "resolved">("unresolved");
  const [selectedMsg, setSelectedMsg] = useState<any>(null);
  const [replyText, setReplyText] = useState("");
  const [classifying, setClassifying] = useState<string | null>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["patient-inbox", filter, search],
    queryFn: async () => {
      let query = supabase.from("patient_communication_log")
        .select("*, patients(id, first_name, last_name, phone, email)")
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(100);

      if (filter === "unresolved") query = query.eq("is_resolved", false);
      if (filter === "resolved") query = query.eq("is_resolved", true);

      const { data, error } = await query;
      if (error) throw error;

      if (search) {
        const q = search.toLowerCase();
        return (data ?? []).filter((m: any) => {
          const name = `${m.patients?.first_name || ""} ${m.patients?.last_name || ""}`.toLowerCase();
          return name.includes(q) || m.content?.toLowerCase().includes(q);
        });
      }
      return data ?? [];
    },
  });

  const classifyMessage = async (msg: any) => {
    setClassifying(msg.id);
    try {
      const { data, error } = await supabase.functions.invoke("ai-message-classifier", {
        body: { message: msg.content, patient_id: msg.patient_id, channel: msg.channel },
      });
      if (error) throw error;

      await supabase.from("patient_communication_log").update({
        ai_intent: data.intent,
        ai_draft_reply: data.draftReply,
      } as any).eq("id", msg.id);

      queryClient.invalidateQueries({ queryKey: ["patient-inbox"] });
      toast.success(`Classified as "${data.intent}"`);
    } catch {
      toast.error("AI classification failed");
    }
    setClassifying(null);
  };

  const resolveMessage = useMutation({
    mutationFn: async (msgId: string) => {
      const { error } = await supabase.from("patient_communication_log").update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id,
      } as any).eq("id", msgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-inbox"] });
      setSelectedMsg(null);
      toast.success("Message resolved");
    },
  });

  const sendReply = async () => {
    if (!replyText.trim() || !selectedMsg) return;
    try {
      await supabase.from("patient_communication_log").insert({
        patient_id: selectedMsg.patient_id,
        channel: selectedMsg.channel,
        direction: "outbound",
        content: replyText,
        staff_user_id: user?.id,
      } as any);

      if (selectedMsg.channel === "sms" && selectedMsg.patients?.phone) {
        await supabase.functions.invoke("send-sms", {
          body: { to: selectedMsg.patients.phone, body: replyText },
        });
      }

      await resolveMessage.mutateAsync(selectedMsg.id);
      setReplyText("");
      toast.success("Reply sent");
    } catch {
      toast.error("Failed to send reply");
    }
  };

  const stats = {
    total: messages?.length ?? 0,
    unresolved: messages?.filter((m: any) => !m.is_resolved).length ?? 0,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Patient Inbox</h1>
          <p className="text-muted-foreground text-sm">{stats.unresolved} unresolved messages</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 w-48" />
          </div>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value as any)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="unresolved">Unresolved</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["patient-inbox"] })}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : messages && messages.length > 0 ? (
        <div className="space-y-2">
          {messages.map((msg: any) => (
            <Card
              key={msg.id}
              className={`cursor-pointer hover:shadow-md transition-shadow ${msg.is_resolved ? "opacity-60" : ""}`}
              onClick={() => { setSelectedMsg(msg); setReplyText(msg.ai_draft_reply || ""); }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-sm">
                        {msg.patients?.first_name} {msg.patients?.last_name}
                      </p>
                      <Badge variant="outline" className="text-[11px]">{msg.channel}</Badge>
                      {msg.ai_intent && (
                        <Badge className={`text-[11px] ${INTENT_COLORS[msg.ai_intent] || INTENT_COLORS.general}`}>
                          {msg.ai_intent.replace("_", " ")}
                        </Badge>
                      )}
                      {msg.is_resolved && (
                        <Badge variant="secondary" className="text-[11px] bg-success/10 text-success">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Resolved
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{msg.content}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(msg.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                    {!msg.ai_intent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px] px-2"
                        onClick={(e) => { e.stopPropagation(); classifyMessage(msg); }}
                        disabled={classifying === msg.id}
                      >
                        {classifying === msg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No messages found</p>
          </CardContent>
        </Card>
      )}

      {/* Message Detail with Patient Context */}
      <Dialog open={!!selectedMsg} onOpenChange={(o) => { if (!o) setSelectedMsg(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              {selectedMsg?.patients?.first_name} {selectedMsg?.patients?.last_name}
            </DialogTitle>
          </DialogHeader>
          {selectedMsg && (
            <div className="flex gap-4">
              {/* Main content */}
              <div className="flex-1 space-y-4 min-w-0">
                {/* Original Message */}
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[11px]">{selectedMsg.channel}</Badge>
                    {selectedMsg.ai_intent && (
                      <Badge className={`text-[11px] ${INTENT_COLORS[selectedMsg.ai_intent] || INTENT_COLORS.general}`}>
                        <Sparkles className="h-2.5 w-2.5 mr-0.5" />{selectedMsg.ai_intent.replace("_", " ")}
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground ml-auto">
                      {new Date(selectedMsg.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm">{selectedMsg.content}</p>
                </div>

                {/* AI Draft Reply */}
                {selectedMsg.ai_draft_reply && (
                  <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                    <p className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />AI Draft Reply
                    </p>
                    <p className="text-xs text-foreground">{selectedMsg.ai_draft_reply}</p>
                  </div>
                )}

                {!selectedMsg.ai_intent && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => classifyMessage(selectedMsg)}
                    disabled={!!classifying}
                  >
                    {classifying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                    Classify with AI
                  </Button>
                )}

                <Separator />

                {/* Reply */}
                <div className="space-y-2">
                  <Label className="text-xs">Reply</Label>
                  <Textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Type your reply..."
                    className="h-20 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => resolveMessage.mutate(selectedMsg.id)}>
                      <Archive className="h-3.5 w-3.5 mr-1" />Resolve
                    </Button>
                    <Button size="sm" className="flex-1" onClick={sendReply} disabled={!replyText.trim()}>
                      <Send className="h-3.5 w-3.5 mr-1" />Send Reply
                    </Button>
                  </div>
                </div>
              </div>

              {/* Patient Context Sidebar */}
              <div className="w-56 shrink-0 hidden md:block">
                <PatientContextCard patientId={selectedMsg.patient_id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
