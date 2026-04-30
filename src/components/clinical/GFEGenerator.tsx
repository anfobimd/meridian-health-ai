// src/components/clinical/GFEGenerator.tsx
//
// Good Faith Estimate generator for No Surprises Act compliance.
// Handles treatment pricing, package discounts, and GFE document generation.
//
// Props:
//   - patientId: string
//   - appointmentId?: string
//   - treatments: Array<{ name: string; price: number; quantity?: number }>

import { useState, useEffect } from "react";
import { Send, Printer, FileText, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/RBACContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Treatment {
  name: string;
  price: number;
  quantity?: number;
}

interface GFEGeneratorProps {
  patientId: string;
  appointmentId?: string;
  treatments: Treatment[];
}

interface PackagePurchase {
  id: string;
  service_packages: {
    name: string;
    credits: number;
  };
  remaining_credits: number;
}

const NO_SURPRISES_ACT_DISCLAIMER =
  "This is a Good Faith Estimate (GFE) as required by the No Surprises Act. This estimate is valid for 60 days from the date provided. Actual charges may vary based on treatment modifications, unforeseen complications, or changes in recommended procedures. Changes to the estimate require written consent.";

export function GFEGenerator({ patientId, appointmentId, treatments }: GFEGeneratorProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [packages, setPackages] = useState<PackagePurchase[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(true);

  // Fetch active packages for patient
  useEffect(() => {
    fetchActivePackages();
  }, [patientId]);

  const fetchActivePackages = async () => {
    try {
      setLoadingPackages(true);
      const { data, error } = await (supabase as any)
        .from("patient_package_purchases")
        .select("id, service_packages(name, credits), remaining_credits")
        .eq("patient_id", patientId)
        .eq("status", "active");

      if (error) {
        console.error("Error fetching packages:", error);
        return;
      }

      setPackages((data as PackagePurchase[]) || []);
    } catch (err) {
      console.error("Exception fetching packages:", err);
    } finally {
      setLoadingPackages(false);
    }
  };

  // Calculate pricing
  const subtotal = treatments.reduce((sum, t) => sum + t.price * (t.quantity || 1), 0);
  const packageCreditsValue = packages.reduce(
    (sum, p) => sum + p.remaining_credits * 5, // Assume $5 per credit
    0
  );
  const discounts = Math.min(packageCreditsValue, subtotal * 0.1); // Apply up to 10% discount from packages
  const estimatedTotal = Math.max(0, subtotal - discounts);

  const handleGenerateGFE = async () => {
    if (!user) {
      toast.error("User not authenticated");
      return;
    }

    try {
      setLoading(true);

      // Create GFE record
      const { data, error } = await (supabase as any)
        .from("good_faith_estimates")
        .insert({
          patient_id: patientId,
          appointment_id: appointmentId || null,
          items: treatments,
          subtotal,
          discounts,
          total: estimatedTotal,
          valid_until: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        toast.error(`Failed to generate GFE: ${error.message}`);
        return;
      }

      toast.success("Good Faith Estimate generated successfully");
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Error generating GFE: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendToPatient = async () => {
    if (!user) {
      toast.error("User not authenticated");
      return;
    }

    try {
      setSendingEmail(true);

      // First generate/fetch the GFE
      const { data: gfeData, error: gfeError } = await (supabase as any)
        .from("good_faith_estimates")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (gfeError) {
        toast.error("GFE not found. Generate first.");
        return;
      }

      // Send via email function
      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          to: patientId,
          templateId: "gfe_estimate",
          data: {
            patientId,
            gfe: gfeData,
            treatments,
            subtotal,
            discounts,
            total: estimatedTotal,
          },
        },
      });

      if (error) {
        toast.error("Failed to send GFE");
        return;
      }

      toast.success("Good Faith Estimate sent to patient");
    } catch (err) {
      console.error("Error sending GFE:", err);
      toast.error("Failed to send GFE");
    } finally {
      setSendingEmail(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loadingPackages) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Good Faith Estimate
          </CardTitle>
          <CardDescription>
            No Surprises Act compliant cost estimate for planned treatments
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Treatments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Treatment Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Treatment</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Line Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {treatments.map((t, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-right">${t.price.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{t.quantity || 1}</TableCell>
                  <TableCell className="text-right font-semibold">
                    ${(t.price * (t.quantity || 1)).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pricing Summary */}
      <Card className="print:break-inside-avoid">
        <CardHeader>
          <CardTitle className="text-base">Cost Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">${subtotal.toFixed(2)}</span>
            </div>

            {packages.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Active Packages</span>
                <span className="font-medium">
                  {packages.map((p) => p.service_packages?.name).join(", ")}
                </span>
              </div>
            )}

            {discounts > 0 && (
              <div className="flex justify-between text-sm border-t pt-2">
                <span className="text-success">Package Discount</span>
                <span className="font-semibold text-success">
                  -${discounts.toFixed(2)}
                </span>
              </div>
            )}

            <div className="flex justify-between text-base font-bold border-t pt-3">
              <span>Estimated Total</span>
              <span className="text-lg">${estimatedTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="bg-info/10 border border-info/30 rounded-lg p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-info mt-0.5 flex-shrink-0" />
              <div className="text-sm text-info">
                <p className="font-semibold mb-2">No Surprises Act Disclaimer</p>
                <p>{NO_SURPRISES_ACT_DISCLAIMER}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap print:hidden">
        <Button onClick={handleGenerateGFE} disabled={loading} className="gap-2">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Generate GFE
            </>
          )}
        </Button>

        <Button
          onClick={handleSendToPatient}
          disabled={sendingEmail}
          variant="outline"
          className="gap-2"
        >
          {sendingEmail ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Send to Patient
            </>
          )}
        </Button>

        <Button onClick={handlePrint} variant="outline" className="gap-2">
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>

      {/* Footer Info */}
      <div className="text-xs text-muted-foreground border-t pt-4 print:block">
        <p>
          Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
        </p>
        {appointmentId && (
          <p>Appointment ID: {appointmentId}</p>
        )}
      </div>
    </div>
  );
}
