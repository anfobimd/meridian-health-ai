// src/components/clinical/SignLockWorkflow.tsx
//
// Sign and lock workflow for encounter notes.
// Handles the transition from in_progress -> signed state with audit logging.
//
// Props:
//   - encounterId: string
//   - currentStatus: "in_progress" | "signed" | "reviewed" | "corrected"
//   - onStatusChange: (status: string) => void
//   - signedAt?: string (ISO date)
//   - signedBy?: string (user id)

import { useState } from "react";
import { PenLine, Lock, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/RBACContext";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SignLockWorkflowProps {
  encounterId: string;
  currentStatus: string;
  onStatusChange: (status: string) => void;
  signedAt?: string;
  signedBy?: string;
}

export function SignLockWorkflow({
  encounterId,
  currentStatus,
  onStatusChange,
  signedAt,
  signedBy,
}: SignLockWorkflowProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSign = async () => {
    if (!user) {
      toast.error("User not authenticated");
      return;
    }

    setLoading(true);
    try {
      const now = new Date().toISOString();

      // Update encounter with signed status
      const { error: updateError } = await supabase
        .from("encounters")
        .update({
          status: "signed",
          signed_at: now,
          signed_by: user.id,
        })
        .eq("id", encounterId);

      if (updateError) {
        toast.error(`Failed to sign note: ${updateError.message}`);
        return;
      }

      // Create audit log entry
      const { error: auditError } = await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "sign_note",
        resource_type: "encounter",
        resource_id: encounterId,
        created_at: now,
      });

      if (auditError) {
        console.warn("Audit log creation failed:", auditError);
        // Don't fail the entire operation if audit log fails
      }

      toast.success("Note signed and locked successfully");
      onStatusChange("signed");
      setShowConfirm(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Error signing note: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // In progress state - show sign button
  if (currentStatus === "in_progress") {
    return (
      <div className="flex items-center gap-2">
        <Button
          onClick={() => setShowConfirm(true)}
          disabled={loading}
          size="sm"
          className="gap-2"
        >
          <PenLine className="h-4 w-4" />
          Sign & Lock Note
        </Button>

        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                Sign and Lock Note?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-base">
                Once signed, this note becomes read-only. Future changes will require addendums
                to be documented separately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="bg-muted p-3 rounded text-sm text-muted-foreground">
              This action is permanent and will be logged in the audit trail.
            </div>
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleSign}
                disabled={loading}
                className="bg-primary"
              >
                {loading ? "Signing..." : "Sign Note"}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Signed state - show locked badge with addendum option
  if (currentStatus === "signed") {
    const signedDate = signedAt ? new Date(signedAt).toLocaleDateString() : "Unknown";

    return (
      <div className="flex flex-col gap-3 p-4 border border-border rounded-lg bg-muted/50">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-green-600" />
          <Badge variant="outline" className="bg-green-50">
            Signed & Locked
          </Badge>
          <span className="text-sm text-muted-foreground">
            Signed on {signedDate}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          This note is read-only. To make changes, add an addendum.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => {
            // Navigate to addendum section or open addendum dialog
            // This could emit an event or use routing based on your app structure
            const event = new CustomEvent("openAddendumDialog", {
              detail: { encounterId },
            });
            window.dispatchEvent(event);
          }}
        >
          Add Addendum
        </Button>
      </div>
    );
  }

  // Reviewed state - locked but with review badge
  if (currentStatus === "reviewed") {
    const signedDate = signedAt ? new Date(signedAt).toLocaleDateString() : "Unknown";

    return (
      <div className="flex flex-col gap-3 p-4 border border-border rounded-lg bg-blue-50">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-blue-600" />
          <Badge className="bg-blue-600">Reviewed</Badge>
          <span className="text-sm text-muted-foreground">
            Reviewed on {signedDate}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          This note has been reviewed and is read-only.
        </p>
      </div>
    );
  }

  // Corrected state - locked but with correction badge
  if (currentStatus === "corrected") {
    const signedDate = signedAt ? new Date(signedAt).toLocaleDateString() : "Unknown";

    return (
      <div className="flex flex-col gap-3 p-4 border border-border rounded-lg bg-orange-50">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-orange-600" />
          <Badge variant="outline" className="bg-orange-50 text-orange-900">
            Corrected
          </Badge>
          <span className="text-sm text-muted-foreground">
            Corrected on {signedDate}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Corrections have been documented via addendum.
        </p>
      </div>
    );
  }

  // Unknown state - show minimal display
  return (
    <div className="flex items-center gap-2 p-2 text-muted-foreground text-sm">
      <Badge variant="secondary">{currentStatus}</Badge>
    </div>
  );
}
