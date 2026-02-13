"use client";

import { useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StripeProvider } from "@/components/stripe/stripe-provider";

type JobPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientSecret: string | null;
  title: string;
  description: string;
  confirmLabel: string;
  onSuccess: () => void;
};

function JobPaymentForm({
  confirmLabel,
  onSuccess,
}: {
  confirmLabel: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) return;

    setIsSubmitting(true);
    setMessage(null);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (result.error) {
      setMessage(result.error.message ?? "Payment failed. Please try again.");
      setIsSubmitting(false);
      return;
    }

    const status = result.paymentIntent?.status;
    if (status === "succeeded" || status === "processing" || status === "requires_capture") {
      onSuccess();
      return;
    }

    setMessage("Payment was not completed. Please try again.");
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <PaymentElement id="job-payment-element" />
      <Button type="submit" disabled={isSubmitting || !stripe || !elements} className="w-full">
        {isSubmitting ? "Processing..." : confirmLabel}
      </Button>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </form>
  );
}

export function JobPaymentDialog({
  open,
  onOpenChange,
  clientSecret,
  title,
  description,
  confirmLabel,
  onSuccess,
}: JobPaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {clientSecret ? (
          <StripeProvider clientSecret={clientSecret}>
            <JobPaymentForm confirmLabel={confirmLabel} onSuccess={onSuccess} />
          </StripeProvider>
        ) : (
          <p className="text-sm text-muted-foreground">Preparing secure payment form...</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
