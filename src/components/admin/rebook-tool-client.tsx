'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CalendarIcon, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface CancelledBooking {
  id: string;
  status: string;
  scheduledDate: string;
  totalAmount: number;
  customerId: string;
  customerName: string;
  customerEmail: string;
  providerId: string;
  providerName: string;
  providerHandle: string;
  serviceId: string;
  serviceName: string;
  serviceCategory: string;
  createdAt: string;
  cancelledAt: string;
}

export function RebookToolClient() {
  const [bookings, setBookings] = useState<CancelledBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<CancelledBooking | null>(null);
  const [rebookDialogOpen, setRebookDialogOpen] = useState(false);
  const [rebooking, setRebooking] = useState(false);

  // Rebook form state
  const [newDateTime, setNewDateTime] = useState('');
  const [reason, setReason] = useState('');

  const fetchCancelledBookings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/rebook');
      if (response.ok) {
        const data = await response.json();
        setBookings(data.cancelledBookings);
      }
    } catch (error) {
      console.error('Error fetching cancelled bookings:', error);
      toast.error('Failed to load cancelled bookings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCancelledBookings();
  }, []);

  const handleRebook = async () => {
    if (!selectedBooking || !newDateTime) {
      toast.error('Please fill in all required fields');
      return;
    }

    setRebooking(true);
    try {
      const response = await fetch('/api/admin/rebook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          originalBookingId: selectedBooking.id,
          newScheduledDateTime: newDateTime,
          reason: reason || 'Admin rebooking',
        }),
      });

      if (response.ok) {
        toast.success('Booking successfully rebooked!');
        setRebookDialogOpen(false);
        setSelectedBooking(null);
        setNewDateTime('');
        setReason('');
        // Refresh the list
        fetchCancelledBookings();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to rebook');
      }
    } catch (error) {
      console.error('Error rebooking:', error);
      toast.error('Failed to rebook booking');
    } finally {
      setRebooking(false);
    }
  };

  const openRebookDialog = (booking: CancelledBooking) => {
    setSelectedBooking(booking);
    setRebookDialogOpen(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(amount / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU');
  };

  if (loading) {
    return <div>Loading cancelled bookings...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Cancelled Bookings
          </CardTitle>
          <CardDescription>
            Recently cancelled bookings that can be rebooked
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Button onClick={fetchCancelledBookings} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Cancelled Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{booking.customerName}</div>
                      <div className="text-sm text-muted-foreground">{booking.customerEmail}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{booking.providerName}</div>
                      <div className="text-sm text-muted-foreground">@{booking.providerHandle}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{booking.serviceName}</div>
                      <Badge variant="outline" className="text-xs">
                        {booking.serviceCategory}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      <span>{formatDate(booking.scheduledDate)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(booking.totalAmount)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={() => openRebookDialog(booking)}
                    >
                      Rebook
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {bookings.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No cancelled bookings found
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rebook Dialog */}
      <Dialog open={rebookDialogOpen} onOpenChange={setRebookDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rebook Cancelled Service</DialogTitle>
            <DialogDescription>
              Create a new booking for the customer with updated date and time.
            </DialogDescription>
          </DialogHeader>

          {selectedBooking && (
            <div className="space-y-4">
              <div className="bg-muted p-3 rounded-lg">
                <h4 className="font-medium mb-2">Original Booking Details</h4>
                <div className="text-sm space-y-1">
                  <div><strong>Customer:</strong> {selectedBooking.customerName}</div>
                  <div><strong>Provider:</strong> {selectedBooking.providerName}</div>
                  <div><strong>Service:</strong> {selectedBooking.serviceName}</div>
                  <div><strong>Original Date:</strong> {formatDate(selectedBooking.scheduledDate)}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newDateTime">New Date & Time *</Label>
                <Input
                  id="newDateTime"
                  type="datetime-local"
                  value={newDateTime}
                  onChange={(e) => setNewDateTime(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Reason for Rebooking</Label>
                <Textarea
                  id="reason"
                  placeholder="Optional reason for the rebooking..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRebookDialogOpen(false)}
              disabled={rebooking}
            >
              Cancel
            </Button>
            <Button onClick={handleRebook} disabled={rebooking}>
              {rebooking ? 'Rebooking...' : 'Rebook Service'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}