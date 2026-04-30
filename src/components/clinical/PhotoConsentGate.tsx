// src/components/clinical/PhotoConsentGate.tsx
//
// Gate component that checks photo consent before allowing photo access.
// Handles SMS and in-person consent workflows.
//
// Props:
//   - patientId: string
//   - children: React.ReactNode
//   - fallback?: React.ReactNode

import { useEffect, useState } from "react";
import { Camera, Loader2, MessageSquare, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PhotoConsentGateProps {
  patientId: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PhotoConsentGate({ patientId, children, fallback }: PhotoConsentGateProps) {
  const [hasConsent, setHasConsent] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingConsent, setCheckingConsent] = useState(false);
  const [patientPhone, setPatientPhone] = useState<string>("");

  // Check if patient has signed photo consent
  useEffect(() => {
    checkPhotoConsent();
  }, [patientId]);

  const checkPhotoConsent = async () => {
    try {
      setCheckingConsent(true);
      const { data, error } = await supabase
        .from("e_consents")
        .select("id, signed_at")
        .eq("patient_id", patientId)
        .eq("consent_type", "photo_release")
        .not("signed_at", "is", null)
        .limit(1);

      if (error) {
        console.error("Error checking consent:", error);
        setHasConsent(false);
        return;
      }

      setHasConsent(data && data.length > 0);
    } catch (err) {
      console.error("Exception checking consent:", err);
      setHasConsent(false);
    } finally {
      setCheckingConsent(false);
      setLoading(false);
    }
  };

  // Fetch patient phone for SMS
  useEffect(() => {
    if (!hasConsent) {
      fetchPatientPhone();
    }
  }, [hasConsent, patientId]);

  const fetchPatientPhone = async () => {
    try {
      const { data, error } = await supabase
        .from("patients")
        .select("phone")
        .eq("id", patientId)
        .single();

      if (!error && data?.phone) {
        setPatientPhone(data.phone);
      }
    } catch (err) {
      console.error("Error fetching patient phone:", err);
    }
  };

  const handleSendSmsConsent = async () => {
    if (!patientPhone) {
      toast.error("Patient phone number not found");
      return;
    }

    try {
      setCheckingConsent(true);
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: {
          to: patientPhone,
          message:
            "Hi! We need your consent to take clinical photos during your visit. Please reply YES to consent or contact us for questions.",
        },
      });

      if (error) {
        toast.error("Failed to send SMS");
        return;
      }

      toast.success("Consent request sent via SMS");
    } catch (err) {
      console.error("Error sending SMS:", err);
      toast.error("Failed to send SMS");
    } finally {
      setCheckingConsent(false);
    }
  };

  const handleSendEmailConsent = async () => {
    try {
      setCheckingConsent(true);
      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          to: patientId,
          templateId: "photo_consent_request",
          data: {
            patientId,
          },
        },
      });

      if (error) {
        toast.error("Failed to send email");
        return;
      }

      toast.success("Consent request sent via email");
    } catch (err) {
      console.error("Error sending email:", err);
      toast.error("Failed to send email");
    } finally {
      setCheckingConsent(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (hasConsent) {
    return <>{children}</>;
  }

  // Default fallback if none provided
  if (!fallback) {
    fallback = (
      <Card className="border-warning/30 bg-warning/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-warning">
            <Camera className="h-5 w-5" />
            Photo Consent Required
          </CardTitle>
          <CardDescription className="text-warning">
            This patient has not consented to clinical photography.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-warning">
            Clinical photos help document treatment progress and support clinical decision-making.
            Request consent to proceed.
          </p>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full gap-2">
                <Camera className="h-4 w-4" />
                Request Photo Consent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request Photo Consent</DialogTitle>
                <DialogDescription>
                  Choose how you'd like to request photo consent from the patient.
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="sms" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="sms" className="gap-2">
                    <MessageSquare className="h-4 w-4" />
                    SMS
                  </TabsTrigger>
                  <TabsTrigger value="in-person" className="gap-2">
                    <Users className="h-4 w-4" />
                    In-Person
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="sms" className="space-y-4 mt-4">
                  {patientPhone ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Send a consent request to {patientPhone}
                      </p>
                      <Button
                        onClick={handleSendSmsConsent}
                        disabled={checkingConsent}
                        className="w-full"
                      >
                        {checkingConsent ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          "Send via SMS"
                        )}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-destructive">
                      Patient phone number not available. Use in-person consent instead.
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="in-person" className="space-y-4 mt-4">
                  <p className="text-sm text-muted-foreground">
                    Have the patient sign the photo consent form in person at their next visit.
                  </p>
                  <div className="bg-muted p-3 rounded text-sm space-y-2">
                    <p className="font-semibold">Document in chart:</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Consent form signed and dated</li>
                      <li>Patient initialed photo consent checkbox</li>
                      <li>File consent form in patient record</li>
                    </ul>
                  </div>
                  <Button variant="outline" className="w-full">
                    Mark Consent Signed
                  </Button>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  return <>{fallback}</>;
}
