import { useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientSecret: string | null;
  amount: number;
  title?: string;
  description?: string;
  /** Called once the card is confirmed. Final paid state is set by the webhook. */
  onConfirmed?: (paymentIntentId: string) => void;
};

function PayForm({ amount, onConfirmed }: { amount: number; onConfirmed?: (id: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (error) {
      toast.error(error.message || "Payment failed");
      setSubmitting(false);
      return;
    }
    if (paymentIntent && ["succeeded", "processing"].includes(paymentIntent.status)) {
      toast.success(paymentIntent.status === "processing" ? "Payment processing…" : "Payment confirmed");
      onConfirmed?.(paymentIntent.id);
    } else {
      toast.error("Payment was not completed");
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <PaymentElement />
      <Button className="w-full" onClick={submit} disabled={!stripe || submitting}>
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
        Pay ${amount.toFixed(2)}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        Your payment is confirmed by our payment provider before any record is marked paid.
      </p>
    </div>
  );
}

export function StripePaymentDialog({ open, onOpenChange, clientSecret, amount, title, description, onConfirmed }: Props) {
  const stripePromise = getStripe();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title || "Payment"}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {!stripePromise ? (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>Payments aren't configured yet (missing <code>VITE_STRIPE_PUBLISHABLE_KEY</code>).</span>
          </div>
        ) : !clientSecret ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing secure payment…
          </div>
        ) : (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
            <PayForm
              amount={amount}
              onConfirmed={(id) => {
                onConfirmed?.(id);
                onOpenChange(false);
              }}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
