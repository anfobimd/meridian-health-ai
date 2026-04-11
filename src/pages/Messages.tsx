import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Mail, MailOpen, Plus, Inbox, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function Messages() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [composeOpen, setComposeOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [aiDrafting, setAiDrafting] = useState(false);

  // Pre-fill compose from query params (e.g., from encounter context)
  useEffect(() => {
    const encId = searchParams.get("encounter_id");
    const toId = searchParams.get("to");
    const subj = searchParams.get("subject");
    if (encId || toId) {
      if (toId) setRecipientId(toId);
      if (subj) setSubject(subj);
      setComposeOpen(true);
      // Auto-draft if encounter context provided
      if (encId) draftFromEncounter(encId);
    }
  }, [searchParams]);

  const draftFromEncounter = async (encounterId: string) => {
    setAiDrafting(true);
    try {
      const { data: enc } = await supabase
        .from("encounters")
        .select("*, patients(first_name, last_name), providers:provider_id(first_name, last_name)")
        .eq("id", encounterId)
        .single();

      if (enc) {
        const patientName = `${enc.patients?.first_name} ${enc.patients?.last_name}`;
        const draft = `Regarding patient ${patientName} (Encounter ${encounterId.slice(0, 8)}):\n\nChief complaint: ${enc.chief_complaint || "N/A"}\nEncounter type: ${enc.encounter_type || "N/A"}\n\n[Please describe your question or concern here]`;
        setBody(draft);
        if (!subject) setSubject(`Re: ${patientName} — ${enc.encounter_type || "Encounter"}`);
      }
    } catch {
      // Silent — just don't pre-fill
    } finally {
      setAiDrafting(false);
    }
  };

  // Fetch staff users for recipient picker
  const { data: staffUsers } = useQuery({
    queryKey: ["staff-profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .order("display_name");
      return data || [];
    },
  });

  const { data: messages, isLoading } = useQuery({
    queryKey: ["messages", tab],
    queryFn: async () => {
      const query = supabase
        .from("messages")
        .select("*")
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .limit(100);

      if (tab === "inbox") {
        query.eq("recipient_id", user!.id);
      } else {
        query.eq("sender_id", user!.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: thread } = useQuery({
    queryKey: ["message-thread", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data: parent } = await supabase
        .from("messages")
        .select("*")
        .eq("id", selectedId!)
        .single();
      const { data: replies } = await supabase
        .from("messages")
        .select("*")
        .eq("parent_id", selectedId!)
        .order("created_at");
      return { parent, replies: replies || [] };
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("messages-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["messages"] });
        if (selectedId) qc.invalidateQueries({ queryKey: ["message-thread", selectedId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, selectedId]);

  // Mark as read
  useEffect(() => {
    if (!selectedId || !user || !thread?.parent) return;
    if (thread.parent.recipient_id === user.id && !thread.parent.is_read) {
      supabase
        .from("messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", selectedId)
        .then(() => qc.invalidateQueries({ queryKey: ["messages"] }));
    }
  }, [selectedId, thread]);

  const sendMutation = useMutation({
    mutationFn: async (payload: { recipient_id: string; subject?: string; body: string; parent_id?: string }) => {
      const { error } = await supabase.from("messages").insert({
        sender_id: user!.id,
        ...payload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Message sent" });
      qc.invalidateQueries({ queryKey: ["messages"] });
      if (selectedId) qc.invalidateQueries({ queryKey: ["message-thread", selectedId] });
      setComposeOpen(false);
      setSubject("");
      setBody("");
      setRecipientId("");
      setReplyBody("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const unreadCount = messages?.filter((m: any) => !m.is_read && m.recipient_id === user?.id).length ?? 0;

  const getSenderName = (id: string) => {
    if (id === user?.id) return "You";
    const found = staffUsers?.find((s) => s.user_id === id);
    return found?.display_name || id.substring(0, 8);
  };

  // AI draft for compose
  const aiDraftMessage = async () => {
    if (!recipientId) {
      toast({ title: "Select a recipient first", variant: "destructive" });
      return;
    }
    setAiDrafting(true);
    try {
      const recipientName = staffUsers?.find(s => s.user_id === recipientId)?.display_name || "Colleague";
      const { data } = await supabase.functions.invoke("ai-provider-coach", {
        body: {
          mode: "message_draft",
          provider_id: recipientId,
          context: { subject, recipient_name: recipientName, existing_body: body },
        },
      });
      if (data?.draft) {
        setBody(data.draft);
        toast({ title: "AI draft generated" });
      }
    } catch {
      toast({ title: "AI draft failed", variant: "destructive" });
    } finally {
      setAiDrafting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
          <p className="text-sm text-muted-foreground">
            Secure internal messaging {unreadCount > 0 && `— ${unreadCount} unread`}
          </p>
        </div>
        <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Compose</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Message</DialogTitle>
              <DialogDescription>Send a secure message to a team member.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>To</Label>
                <Select value={recipientId} onValueChange={setRecipientId}>
                  <SelectTrigger><SelectValue placeholder="Select recipient" /></SelectTrigger>
                  <SelectContent>
                    {staffUsers?.filter((s) => s.user_id !== user?.id).map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.user_id.substring(0, 8)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Optional subject" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Message</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] text-primary"
                    onClick={aiDraftMessage}
                    disabled={aiDrafting}
                  >
                    {aiDrafting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                    AI Draft
                  </Button>
                </div>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your message…" rows={4} />
              </div>
              <Button
                className="w-full"
                disabled={!recipientId || !body.trim() || sendMutation.isPending}
                onClick={() => sendMutation.mutate({ recipient_id: recipientId, subject: subject || undefined, body })}
              >
                {sendMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button variant={tab === "inbox" ? "default" : "outline"} size="sm" onClick={() => { setTab("inbox"); setSelectedId(null); }}>
          <Inbox className="mr-1 h-4 w-4" /> Inbox
          {unreadCount > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">{unreadCount}</Badge>}
        </Button>
        <Button variant={tab === "sent" ? "default" : "outline"} size="sm" onClick={() => { setTab("sent"); setSelectedId(null); }}>
          <Send className="mr-1 h-4 w-4" /> Sent
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ minHeight: 400 }}>
        {/* Message list */}
        <div className="md:col-span-1 space-y-1 overflow-y-auto max-h-[600px]">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !messages?.length ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">
              <Mail className="mx-auto h-8 w-8 mb-2" />
              <p className="text-sm">No messages</p>
            </CardContent></Card>
          ) : (
            messages.map((m: any) => (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={cn(
                  "w-full text-left rounded-md border p-3 transition-colors",
                  selectedId === m.id ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                  !m.is_read && tab === "inbox" && "border-primary/30 bg-primary/5"
                )}
              >
                <div className="flex items-center justify-between">
                  <p className={cn("text-sm", !m.is_read && tab === "inbox" && "font-semibold")}>
                    {tab === "inbox" ? getSenderName(m.sender_id) : getSenderName(m.recipient_id)}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(m.created_at), "MMM d")}
                  </span>
                </div>
                {m.subject && <p className="text-xs font-medium mt-0.5 truncate">{m.subject}</p>}
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{m.body}</p>
              </button>
            ))
          )}
        </div>

        {/* Thread view */}
        <div className="md:col-span-2">
          {selectedId && thread ? (
            <Card>
              <CardContent className="py-4 space-y-4">
                {thread.parent?.subject && (
                  <h2 className="text-lg font-medium">{thread.parent.subject}</h2>
                )}
                <div className="space-y-3">
                  <div className="rounded-md bg-muted p-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span className="font-medium">{getSenderName(thread.parent.sender_id)}</span>
                      <span>{format(new Date(thread.parent.created_at), "MMM d, h:mm a")}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{thread.parent.body}</p>
                  </div>
                  {thread.replies.map((r: any) => (
                    <div key={r.id} className={cn("rounded-md p-3", r.sender_id === user?.id ? "bg-primary/5 ml-4" : "bg-muted mr-4")}>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span className="font-medium">{getSenderName(r.sender_id)}</span>
                        <span>{format(new Date(r.created_at), "MMM d, h:mm a")}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{r.body}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Type a reply…"
                    rows={2}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    disabled={!replyBody.trim() || sendMutation.isPending}
                    onClick={() => {
                      const recipId = thread.parent.sender_id === user?.id
                        ? thread.parent.recipient_id
                        : thread.parent.sender_id;
                      sendMutation.mutate({ recipient_id: recipId, body: replyBody, parent_id: selectedId! });
                    }}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-20 text-center text-muted-foreground">
                <MailOpen className="mx-auto h-10 w-10 mb-2" />
                <p>Select a message to view</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
