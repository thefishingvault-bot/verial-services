"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ProviderJobViewProps = {
  jobId: string;
  status: string;
  paymentStatus: string;
  initialTab: "overview" | "quote" | "qa";
  myQuote: {
    amountTotal: number;
    availability: string | null;
    included: string | null;
    excluded: string | null;
    responseSpeedHours: number | null;
    status: string;
  } | null;
  canEditQuote: boolean;
  isAssignedProvider: boolean;
  remainingAmount: number | null;
  questions: Array<{
    id: string;
    question: string;
    answer: string | null;
    createdAt: Date;
  }>;
};

export function ProviderJobView(props: ProviderJobViewProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const quoteSectionRef = useRef<HTMLDivElement | null>(null);
  const qaSectionRef = useRef<HTMLDivElement | null>(null);
  const qaInputRef = useRef<HTMLTextAreaElement | null>(null);

  const [amountTotal, setAmountTotal] = useState(
    props.myQuote?.amountTotal ? (props.myQuote.amountTotal / 100).toFixed(2) : "",
  );
  const [availability, setAvailability] = useState(props.myQuote?.availability ?? "");
  const [included, setIncluded] = useState(props.myQuote?.included ?? "");
  const [excluded, setExcluded] = useState(props.myQuote?.excluded ?? "");
  const [responseSpeedHours, setResponseSpeedHours] = useState(String(props.myQuote?.responseSpeedHours ?? 24));
  const [newQuestion, setNewQuestion] = useState("");

  useEffect(() => {
    if (props.initialTab === "overview") return;

    const raf = window.requestAnimationFrame(() => {
      if (props.initialTab === "quote") {
        const target = quoteSectionRef.current;
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }

      if (props.initialTab === "qa") {
        const target = qaSectionRef.current;
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          window.setTimeout(() => {
            qaInputRef.current?.focus({ preventScroll: true });
          }, 250);
          return;
        }
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [props.initialTab]);

  const submitQuote = () => {
    const normalizedAmount = amountTotal.replace(/,/g, "").trim();
    const amountInDollars = Number(normalizedAmount);
    const amountInCents = Math.round(amountInDollars * 100);

    if (!Number.isFinite(amountInDollars) || amountInCents <= 0) {
      setMessage("Enter a valid amount in NZD, for example 150.00.");
      return;
    }

    startTransition(async () => {
      setMessage(null);
      const res = await fetch(`/api/provider/job-requests/${props.jobId}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountTotal: amountInCents,
          availability,
          included,
          excluded,
          responseSpeedHours: Number(responseSpeedHours),
        }),
      });

      if (!res.ok) {
        setMessage(await res.text());
        return;
      }

      setMessage("Quote submitted.");
      window.location.reload();
    });
  };

  const setLifecycle = (action: "in_progress" | "completed") => {
    startTransition(async () => {
      setMessage(null);
      const endpoint =
        action === "in_progress"
          ? `/api/provider/job-requests/${props.jobId}/mark-in-progress`
          : `/api/provider/job-requests/${props.jobId}/mark-completed`;
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) {
        setMessage(await res.text());
        return;
      }
      window.location.reload();
    });
  };

  const cancel = () => {
    startTransition(async () => {
      setMessage(null);
      const res = await fetch(`/api/job-requests/${props.jobId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Provider cancellation" }),
      });
      if (!res.ok) {
        setMessage(await res.text());
        return;
      }
      window.location.reload();
    });
  };

  const submitQuestion = () => {
    const question = newQuestion.trim();
    if (!question) {
      setMessage("Question cannot be empty.");
      return;
    }

    startTransition(async () => {
      setMessage(null);
      const res = await fetch(`/api/provider/job-requests/${props.jobId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) {
        setMessage(await res.text());
        return;
      }
      window.location.reload();
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Quote form</CardTitle>
          <CardDescription>Submit a structured quote for this request.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3" id="quote" ref={quoteSectionRef}>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">Price (NZD)</label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amountTotal}
                onChange={(event) => setAmountTotal(event.target.value)}
                disabled={isPending || !props.canEditQuote}
                placeholder="150.00"
              />
              <p className="mt-1 text-xs text-muted-foreground">Enter dollars (e.g. 150.00). We store this in cents automatically.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm">Response speed (hours)</label>
              <Input value={responseSpeedHours} onChange={(event) => setResponseSpeedHours(event.target.value)} disabled={isPending || !props.canEditQuote} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm">Availability</label>
            <Textarea value={availability} onChange={(event) => setAvailability(event.target.value)} disabled={isPending || !props.canEditQuote} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Included</label>
            <Textarea value={included} onChange={(event) => setIncluded(event.target.value)} disabled={isPending || !props.canEditQuote} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Excluded</label>
            <Textarea value={excluded} onChange={(event) => setExcluded(event.target.value)} disabled={isPending || !props.canEditQuote} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={submitQuote} disabled={isPending || !props.canEditQuote}>Submit quote</Button>
            {props.myQuote && <Badge variant="secondary">Current quote: {props.myQuote.status}</Badge>}
          </div>
        </CardContent>
      </Card>

      {props.isAssignedProvider && (
        <Card>
          <CardHeader>
            <CardTitle>Lifecycle controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{props.status}</Badge>
              <Badge variant="secondary">{props.paymentStatus}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={isPending || props.status !== "assigned"} onClick={() => setLifecycle("in_progress")}>Mark In Progress</Button>
              <Button disabled={isPending || props.status !== "in_progress"} onClick={() => setLifecycle("completed")}>Mark Completed</Button>
              {(props.status === "assigned" || props.status === "open") && (
                <Button variant="outline" disabled={isPending} onClick={cancel}>Cancel Job</Button>
              )}
            </div>
            {props.paymentStatus !== "fully_paid" && props.remainingAmount && props.remainingAmount > 0 && (
              <p className="text-sm text-muted-foreground">Awaiting Final Payment</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Public Q&A</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3" id="qa" ref={qaSectionRef}>
          <div className="space-y-2">
            {props.questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No questions yet.</p>
            ) : (
              props.questions.map((item) => (
                <div key={item.id} className="rounded-md border p-2 text-sm">
                  <p className="font-medium">Q: {item.question}</p>
                  <p className="text-muted-foreground">A: {item.answer ?? "Awaiting customer answer"}</p>
                </div>
              ))
            )}
          </div>
          <div className="space-y-2">
            <Textarea ref={qaInputRef} value={newQuestion} onChange={(event) => setNewQuestion(event.target.value)} rows={2} />
            <Button disabled={isPending} onClick={submitQuestion}>Ask Question</Button>
          </div>
        </CardContent>
      </Card>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
