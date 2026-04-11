import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useState } from "react";
import {
  MessageSquare, Send, Sparkles, Loader2, Clock, ArrowUp, ArrowDown,
} from "lucide-react";

interface Props {
  patientId: string;
  patientName: string;
  patientPhone?: string;
}

export function CommunicationTimeline({ patientId, patientName, patientPhone }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newMsg, setNewMsg] = useState("");
  const [channel, setChannel] = useState<"sms" | "email" | "in_app">("sms");
  const [sending, setSending] = useState(false);
  const [generatingAftercare, setGeneratingAftercare] = useState(false);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["patient-comms", patientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("patient_communication_log")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sendMessage = async () => {
    if (!newMsg.trim()) return;
    setSending(true);
    try {
      await supabase.from("patient_communication_log").insert({
        patient_id: patientId,
        channel,
        direction: "outbound",
        content: newMsg,
        staff_user_id: user?.id,
      } as any);

      if (channel === "sms" && patientPhone) {
        await supabase.functions.invoke("send-sms", {
          body: { to: patientPhone, body: newMsg },
        });
      }

      queryClient.invalidateQueries({ queryKey: ["patient-comms", patientId] });
      setNewMsg("");
      toast.success("Message sent");
    } catch {
      toast.error("Failed to send");
    }
    setSending(false);
  };

  const generateAftercare = async () => {
    setGeneratingAftercare(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-aftercare-message", {
        body: { patient_id: patientId },
      });
      if (error) throw error;
      if (data?.body) {
        setNewMsg(data.body);
        toast.success("Aftercare message generated — review and send");
      }
    } catch {
      toast.error("Failed to generate aftercare message");
    }
    setGeneratingAftercare(false);
  };

  return (
    <div className="space-y-4">
      {/* Send Message */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs">New Message to {patientName}</Label>
          <select
            value={channel}
            onChange={e => setChannel(e.target.value as any)}
            className="h-7 rounded-md border border-input bg-background px-2 text-[11px]"
          >
            <option value="sms">SMS</option>
            <option value="email">Email</option>
            <option value="in_app">In-App</option>
          </select>
        </div>
        <Textarea
          value={newMsg}
          onChange={e => setNewMsg(e.target.value)}
          placeholder="Type a message..."
          className="h-20 text-sm"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={generateAftercare}
            disabled={generatingAftercare}
            className="text-xs"
          >
            {generatingAftercare ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
            AI Aftercare
          </Button>
          <Button size="sm" onClick={sendMessage} disabled={sending || !newMsg.trim()} className="ml-auto text-xs">
            {sending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
            Send
          </Button>
        </div>
      </div>

      <Separator />

      {/* Timeline */}
      {isLoading ? (
        <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
      ) : messages && messages.length > 0 ? (
        <div className="space-y-2">
          {messages.map((msg: any) => (
            <div
              key={msg.id}
              className={`flex gap-2 ${msg.direction === "outbound" ? "flex-row-reverse" : ""}`}
            >
              <div className={`max-w-[80%] p-2.5 rounded-lg text-sm ${
                msg.direction === "outbound"
                  ? "bg-primary/10 border border-primary/20"
                  : "bg-muted/50 border"
              }`}>
                <div className="flex items-center gap-1.5 mb-1">
                  {msg.direction === "inbound" ? (
                    <ArrowDown className="h-2.5 w-2.5 text-muted-foreground" />
                  ) : (
                    <ArrowUp className="h-2.5 w-2.5 text-primary" />
                  )}
                  <Badge variant="outline" className="text-[9px] h-4">{msg.channel}</Badge>
                  {msg.ai_intent && (
                    <Badge variant="secondary" className="text-[9px] h-4">
                      <Sparkles className="h-2 w-2 mr-0.5" />{msg.ai_intent}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {new Date(msg.created_at).toLocaleString(undefined, {
                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-xs">{msg.content}</p>
                {msg.delivery_status && (
                  <p className="text-[10px] text-muted-foreground mt-1">{msg.delivery_status}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-6 text-center">
          <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground mt-2">No communication history</p>
        </div>
      )}
    </div>
  );
}
