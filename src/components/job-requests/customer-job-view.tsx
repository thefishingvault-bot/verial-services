"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  canCancelCustomerJob,
  canEditCustomerJob,
  canReopenCustomerJob,
  isPaymentStatusRelevant,
  normalizeJobStatus,
  normalizePaymentStatus,
} from "@/lib/customer-job-meta";
import { useToast } from "@/components/ui/use-toast";

type QuoteItem = {
  id: string;
  providerId: string;
  providerName: string;
  providerHandle: string | null;
  amountTotal: number;
  availability: string | null;
  included: string | null;
  excluded: string | null;
  responseSpeedHours: number | null;
  status: "submitted" | "accepted" | "rejected" | "withdrawn";
  rating: number;
  score: number;
};

type JobViewProps = {
  job: {
    id: string;
    status: string;
    paymentStatus: string;
    acceptedQuoteId: string | null;
    totalPrice: number | null;
    depositAmount: number | null;
    remainingAmount: number | null;
  };
  quoteCount: number;
  quotes: QuoteItem[];
  bestValueQuoteId: string | null;
  fastestQuoteId: string | null;
  topRatedQuoteId: string | null;
  questions: Array<{
    id: string;
    question: string;
    answer: string | null;
    askedByUserId: string;
    createdAt: Date;
  }>;
};

type SortBy = "score" | "price_asc" | "price_desc" | "fastest" | "rating";

function money(cents: number | null | undefined) {
  if (!cents || cents <= 0) return "-";
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

const tracker = ["assigned", "in_progress", "completed", "closed"] as const;

function phaseState(canonicalStatus: string, phase: (typeof tracker)[number]) {
  const phaseCanonical: Record<(typeof tracker)[number], string> = {
    assigned: "Assigned",
    in_progress: "InProgress",
    completed: "Completed",
    closed: "Closed",
  };

  const order: Record<string, number> = {
    Open: 0,
    Quoting: 0,
    Draft: 0,
    Assigned: 1,
    InProgress: 2,
    Completed: 3,
    Closed: 4,
  };

  if (canonicalStatus === "Cancelled") return "cancelled";

  const currentRank = order[canonicalStatus] ?? 0;
  const phaseRank = order[phaseCanonical[phase]] ?? 0;
  if (currentRank > phaseRank) return "done";
  if (currentRank === phaseRank) return "current";
  return "pending";
}

export function CustomerJobView({ job, quotes, bestValueQuoteId, fastestQuoteId, topRatedQuoteId, questions }: JobViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [sortBy, setSortBy] = useState<SortBy>("score");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);

  const canonicalJobStatus = normalizeJobStatus(job.status, quotes.length);
  const canonicalPaymentStatus = normalizePaymentStatus(job.paymentStatus, canonicalJobStatus);
  const showPaymentStatus = isPaymentStatusRelevant(canonicalPaymentStatus);
  const showPaymentTotals = !!job.acceptedQuoteId && showPaymentStatus;

  const sortedQuotes = useMemo(() => {
    const copy = [...quotes];
    switch (sortBy) {
      case "price_asc":
        return copy.sort((a, b) => a.amountTotal - b.amountTotal);
      case "price_desc":
        return copy.sort((a, b) => b.amountTotal - a.amountTotal);
      case "fastest":
        return copy.sort((a, b) => (a.responseSpeedHours ?? 9999) - (b.responseSpeedHours ?? 9999));
      case "rating":
        return copy.sort((a, b) => b.rating - a.rating);
      default:
        return copy.sort((a, b) => b.score - a.score);
    }
  }, [quotes, sortBy]);

  const acceptQuote = (quoteId: string) => {
    startTransition(async () => {
      setMessage(null);
      const res = await fetch(`/api/customer/job-requests/${job.id}/accept-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(typeof payload === "object" && payload && "error" in payload ? String(payload.error) : "Unable to accept quote");
        return;
      }

      setMessage("Quote accepted. Stripe PaymentIntent created; complete payment to assign the job.");
      window.location.reload();
    });
  };

  const payRemaining = () => {
    startTransition(async () => {
      setMessage(null);
      const res = await fetch(`/api/customer/job-requests/${job.id}/pay-remaining`, { method: "POST" });
      if (!res.ok) {
        setMessage(await res.text());
        return;
      }
      setMessage("Remaining payment intent created. Complete payment to close this job.");
      window.location.reload();
    });
  };

  const cancelJob = () => {
    startTransition(async () => {
      setMessage(null);
      const res = await fetch(`/api/customer/job-requests/${job.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Customer requested cancellation" }),
      });
      if (!res.ok) {
        setMessage(await res.text());
        return;
      }
      toast({
        title: "Job cancelled",
        description: "Your job has been cancelled successfully.",
      });
      setCancelDialogOpen(false);
      router.refresh();
    });
  };

  const answerQuestion = (questionId: string) => {
    const answer = (answers[questionId] ?? "").trim();
    if (!answer) {
      setMessage("Answer cannot be empty.");
      return;
    }

    startTransition(async () => {
      setMessage(null);
      const res = await fetch(`/api/customer/job-requests/${job.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, answer }),
      });
      if (!res.ok) {
        setMessage(await res.text());
        return;
      }
      window.location.reload();
    });
  };

  const reopenJob = () => {
    startTransition(async () => {
      setMessage(null);
      const res = await fetch(`/api/customer/job-requests/${job.id}/reopen`, {
        method: "POST",
      });

      if (!res.ok) {
        setMessage(await res.text());
        return;
      }
      toast({
        title: "Job re-opened",
        description: "Your job is open for provider quotes again.",
      });
      setReopenDialogOpen(false);

      router.refresh();
    });
  };

  const copyShareLink = async () => {
    try {
      const res = await fetch(`/api/customer/job-requests/${job.id}/share-link`, { method: "POST" });
      if (!res.ok) {
        setMessage(await res.text());
        return;
      }
      const payload = (await res.json()) as { url: string };
      await navigator.clipboard.writeText(payload.url);
      toast({
        title: "Share link copied",
        description: "Public job link is ready to share.",
      });
    } catch {
      setMessage("Unable to copy link.");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Job actions</CardTitle>
            {showPaymentStatus && <Badge variant="secondary">Payment status: {canonicalPaymentStatus}</Badge>}
          </div>
          <CardDescription>Manage this job based on its current lifecycle stage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {showPaymentTotals ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <div>Total: {money(job.totalPrice)}</div>
              <div>Deposit: {money(job.depositAmount)}</div>
              <div>Remaining: {money(job.remainingAmount)}</div>
            </div>
          ) : (
            <div className="text-muted-foreground">No payment yet — totals appear after you accept a quote.</div>
          )}

          <div className="flex flex-wrap gap-2">
            {canEditCustomerJob(canonicalJobStatus) && (
              <Button variant="outline" onClick={() => router.push(`/customer/jobs/${job.id}/edit`)} disabled={isPending}>
                Edit job
              </Button>
            )}

            {canCancelCustomerJob(canonicalJobStatus) && (
              <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" disabled={isPending}>Cancel job</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cancel this job?</DialogTitle>
                    <DialogDescription>This will stop provider activity for this request.</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Back</Button>
                    <Button variant="destructive" onClick={cancelJob} disabled={isPending}>
                      {isPending ? "Cancelling..." : "Confirm cancel"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {canReopenCustomerJob(canonicalJobStatus) && (
              <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" disabled={isPending}>Re-open job</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Re-open this job?</DialogTitle>
                    <DialogDescription>This will make your job visible to providers for fresh quotes.</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setReopenDialogOpen(false)}>Back</Button>
                    <Button onClick={reopenJob} disabled={isPending}>
                      {isPending ? "Re-opening..." : "Confirm re-open"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            <Button variant="outline" onClick={copyShareLink} disabled={isPending}>Copy job link</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Quotes comparison</CardTitle>
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="sort">Sort</label>
              <select
                id="sort"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortBy)}
                className="rounded-md border bg-background px-2 py-1"
              >
                <option value="score">Smart ranking</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="fastest">Fastest availability</option>
                <option value="rating">Top rated</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {sortedQuotes.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">No quotes yet</p>
                <p className="mt-1">Add photos, add more detail, or expand your region/suburb to get more quotes.</p>
              </div>
            ) : (
              sortedQuotes.map((quote) => (
                <div key={quote.id} className="rounded-md border p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{quote.providerName}</div>
                      <div className="text-xs text-muted-foreground">{quote.providerHandle ? `@${quote.providerHandle}` : "Provider"}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{money(quote.amountTotal)}</div>
                      <div className="text-xs text-muted-foreground">Rating {quote.rating.toFixed(1)}</div>
                    </div>
                  </div>

                  <div className="mb-2 flex flex-wrap gap-2">
                    {quote.id === bestValueQuoteId && <Badge variant="secondary">Best Value</Badge>}
                    {quote.id === fastestQuoteId && <Badge variant="secondary">Fastest</Badge>}
                    {quote.id === topRatedQuoteId && <Badge variant="secondary">Top Rated</Badge>}
                  </div>

                  <div className="grid gap-1 text-sm">
                    <div><span className="font-medium">Availability:</span> {quote.availability ?? "Not specified"}</div>
                    <div><span className="font-medium">Included:</span> {quote.included ?? "Not specified"}</div>
                    <div><span className="font-medium">Excluded:</span> {quote.excluded ?? "Not specified"}</div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      disabled={isPending || !!job.acceptedQuoteId || quote.status !== "submitted"}
                      onClick={() => acceptQuote(quote.id)}
                    >
                      Accept & Pay
                    </Button>
                    {job.acceptedQuoteId === quote.id && <Badge>Selected</Badge>}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Public Q&A</CardTitle>
            <CardDescription>Visible question and answer context for all quoting providers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {questions.length === 0 ? (
              <p className="text-muted-foreground">No Q&A entries yet.</p>
            ) : (
              <div className="space-y-3">
                {questions.map((item) => (
                  <div key={item.id} className="rounded-md border p-2">
                    <p className="text-xs font-medium">Q: {item.question}</p>
                    {item.answer ? (
                      <p className="mt-1 text-xs text-muted-foreground">A: {item.answer}</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <textarea
                          className="w-full rounded-md border bg-background p-2 text-xs"
                          value={answers[item.id] ?? ""}
                          onChange={(event) => setAnswers((prev) => ({ ...prev, [item.id]: event.target.value }))}
                          rows={2}
                        />
                        <Button size="sm" disabled={isPending} onClick={() => answerQuestion(item.id)}>
                          Submit Answer
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {job.paymentStatus === "deposit_paid" && job.remainingAmount && job.remainingAmount > 0 && (
              <Button className="w-full" disabled={isPending} onClick={payRemaining}>
                Pay Remaining Balance
              </Button>
            )}
            {message && <p className="text-xs text-muted-foreground">{message}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle tracker</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-4">
          {tracker.map((phase) => {
            const state = phaseState(canonicalJobStatus, phase);
            return (
              <div key={phase} className="rounded-md border p-3 text-sm">
                <div className="font-medium capitalize">{phase.replace("_", " ")}</div>
                <div className="text-muted-foreground">
                  {state === "done" ? "Done" : state === "current" ? "Current" : state === "cancelled" ? "Cancelled" : "Pending"}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background p-3 lg:hidden">
        <div className="mx-auto flex max-w-screen-sm gap-2">
          <Button className="flex-1" disabled={isPending || !quotes.length || !!job.acceptedQuoteId} onClick={() => acceptQuote(sortedQuotes[0]?.id ?? "")}>Accept Top Quote</Button>
          {canonicalPaymentStatus === "DepositPaid" && job.remainingAmount && job.remainingAmount > 0 ? (
            <Button className="flex-1" variant="secondary" disabled={isPending} onClick={payRemaining}>Pay Remaining</Button>
          ) : (
            <Button className="flex-1" variant="outline" disabled={isPending || !canCancelCustomerJob(canonicalJobStatus)} onClick={() => setCancelDialogOpen(true)}>Cancel</Button>
          )}
        </div>
      </div>
    </div>
  );
}
