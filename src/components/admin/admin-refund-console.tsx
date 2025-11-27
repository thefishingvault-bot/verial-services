'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, DollarSign, Calculator } from 'lucide-react';

interface AdminRefundConsoleProps {
  bookingId: string;
  maxRefundAmount: number;
  platformFeeBps: number;
}

interface RefundRecord {
  id: string;
  amount: number;
  reason: string;
  description: string | null;
  platformFeeRefunded: number;
  providerAmountRefunded: number;
  status: string;
  stripeRefundId: string | null;
  processedAt: string | null;
  createdAt: string;
  processorFirstName: string | null;
  processorLastName: string | null;
}

const REFUND_REASONS = [
  { value: 'customer_request', label: 'Customer Request' },
  { value: 'service_issue', label: 'Service Issue' },
  { value: 'dispute_resolution', label: 'Dispute Resolution' },
  { value: 'admin_adjustment', label: 'Admin Adjustment' },
  { value: 'duplicate_charge', label: 'Duplicate Charge' },
  { value: 'other', label: 'Other' },
];

export function AdminRefundConsole({ bookingId, maxRefundAmount, platformFeeBps }: AdminRefundConsoleProps) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [isLoadingRefunds, setIsLoadingRefunds] = useState(true);

  // Load existing refunds
  useEffect(() => {
    loadRefunds();
  }, [bookingId]);

  const loadRefunds = async () => {
    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}/refunds`);
      if (response.ok) {
        const data = await response.json();
        setRefunds(data.refunds || []);
      }
    } catch (error) {
      console.error('Error loading refunds:', error);
    } finally {
      setIsLoadingRefunds(false);
    }
  };

  const calculateRefundBreakdown = (refundAmount: number) => {
    const platformFeeRefund = Math.ceil(refundAmount * (platformFeeBps / 10000));
    const providerAmountRefund = refundAmount - platformFeeRefund;
    return { platformFeeRefund, providerAmountRefund };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const refundAmount = parseInt(amount);
    if (!refundAmount || refundAmount <= 0 || refundAmount > maxRefundAmount) {
      alert('Please enter a valid refund amount');
      return;
    }

    if (!reason) {
      alert('Please select a refund reason');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}/refunds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bookingId,
          amount: refundAmount,
          reason,
          description: description.trim() || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to process refund');
      }

      const result = await response.json();

      // Reset form
      setAmount('');
      setReason('');
      setDescription('');

      // Reload refunds
      await loadRefunds();

      alert('Refund processed successfully!');
    } catch (error: any) {
      console.error('Error processing refund:', error);
      alert(`Failed to process refund: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(cents / 100);

  const formatDate = (dateString: string) =>
    new Intl.DateTimeFormat('en-NZ', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(dateString));

  const refundAmount = parseInt(amount) || 0;
  const breakdown = refundAmount > 0 ? calculateRefundBreakdown(refundAmount) : null;

  return (
    <div className="space-y-6">
      {/* Refund Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="amount">Refund Amount (NZD)</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="amount"
              type="number"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pl-9"
              min="1"
              max={maxRefundAmount}
              step="1"
              required
              disabled={isSubmitting}
            />
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Maximum: {formatCurrency(maxRefundAmount)}
          </div>
        </div>

        <div>
          <Label htmlFor="reason">Refund Reason</Label>
          <Select value={reason} onValueChange={setReason} disabled={isSubmitting}>
            <SelectTrigger>
              <SelectValue placeholder="Select a reason" />
            </SelectTrigger>
            <SelectContent>
              {REFUND_REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="description">Description (Optional)</Label>
          <Textarea
            id="description"
            placeholder="Additional details about this refund..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            disabled={isSubmitting}
          />
        </div>

        {/* Refund Breakdown */}
        {breakdown && (
          <Card className="bg-muted/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Refund Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Customer Refund:</span>
                <span className="font-medium">{formatCurrency(refundAmount)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Platform Fee Refund ({platformFeeBps / 100}%):</span>
                <span>{formatCurrency(breakdown.platformFeeRefund)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Provider Amount Refund:</span>
                <span>{formatCurrency(breakdown.providerAmountRefund)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting || !amount || !reason}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing Refund...
            </>
          ) : (
            'Process Refund'
          )}
        </Button>
      </form>

      {/* Existing Refunds */}
      <div>
        <h3 className="text-sm font-medium mb-3">Refund History</h3>
        {isLoadingRefunds ? (
          <div className="text-center py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
            Loading refunds...
          </div>
        ) : refunds.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            No refunds have been processed for this booking.
          </div>
        ) : (
          <div className="space-y-3">
            {refunds.map((refund) => (
              <Card key={refund.id} className="text-sm">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium">{formatCurrency(refund.amount)}</div>
                      <div className="text-xs text-muted-foreground">
                        {REFUND_REASONS.find(r => r.value === refund.reason)?.label || refund.reason}
                      </div>
                    </div>
                    <Badge variant={
                      refund.status === 'completed' ? 'default' :
                      refund.status === 'processing' ? 'secondary' : 'destructive'
                    }>
                      {refund.status}
                    </Badge>
                  </div>

                  {refund.description && (
                    <div className="text-xs text-muted-foreground mb-2">
                      {refund.description}
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Processed by: {refund.processorFirstName || refund.processorLastName
                      ? `${refund.processorFirstName ?? ''} ${refund.processorLastName ?? ''}`.trim()
                      : 'Unknown'}</div>
                    <div>Processed: {refund.processedAt ? formatDate(refund.processedAt) : formatDate(refund.createdAt)}</div>
                    {refund.stripeRefundId && (
                      <div className="font-mono text-[10px]">Stripe: {refund.stripeRefundId}</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}