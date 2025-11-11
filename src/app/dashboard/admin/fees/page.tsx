'use client';

import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertTriangle, Download } from 'lucide-react';

// Define the type for the report data
interface FeeReportRow {
  bookingId: string;
  status: string;
  paidAt: string;
  serviceTitle: string;
  providerName: string;
  customerEmail: string;
  totalAmount: number;
  platformFee: number;
}

// Helper to format currency
const formatPrice = (priceInCents: number) => {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(priceInCents / 100);
};

// Helper to generate and download CSV
const downloadCSV = (data: FeeReportRow[]) => {
  const headers = ['Booking ID', 'Status', 'Paid At', 'Service', 'Provider', 'Customer Email', 'Total Amount (Cents)', 'Platform Fee (Cents)'];
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      [
        row.bookingId,
        row.status,
        row.paidAt,
        `"${row.serviceTitle}"`, // Enclose in quotes
        `"${row.providerName}"`, // Enclose in quotes
        row.customerEmail,
        row.totalAmount,
        row.platformFee,
      ].join(',')
    ),
  ];

  const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `verial_fees_report_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function AdminFeesPage() {
  const [reportData, setReportData] = useState<FeeReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/fees/report')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch fees report.');
        return res.json();
      })
      .then((data) => {
        setReportData(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return <div className="flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading fees report...</div>;
  }

  if (error) {
    return <div className="flex items-center text-destructive"><AlertTriangle className="mr-2 h-4 w-4" />{error}</div>;
  }

  const totalRevenue = reportData.reduce((sum, row) => sum + row.totalAmount, 0);
  const totalFees = reportData.reduce((sum, row) => sum + row.platformFee, 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold">Fees & Revenue Report</h2>
        <Button onClick={() => downloadCSV(reportData)} disabled={reportData.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export as CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Total Platform Fees</CardTitle>
            <CardDescription>10% of all paid bookings.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatPrice(totalFees)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Gross Volume</CardTitle>
            <CardDescription>Total value of all paid bookings (GMV).</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatPrice(totalRevenue)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <Table>
          <TableCaption>A list of all paid and completed bookings.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Booking ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Platform Fee</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reportData.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">No paid bookings yet.</TableCell>
              </TableRow>
            )}
            {reportData.map((row) => (
              <TableRow key={row.bookingId}>
                <TableCell className="font-mono text-xs">{row.bookingId.split('_')[1]}</TableCell>
                <TableCell><Badge variant={row.status === 'completed' ? 'secondary' : 'default'}>{row.status.toUpperCase()}</Badge></TableCell>
                <TableCell>{row.providerName}</TableCell>
                <TableCell>{row.customerEmail}</TableCell>
                <TableCell className="text-right">{formatPrice(row.totalAmount)}</TableCell>
                <TableCell className="text-right font-medium">{formatPrice(row.platformFee)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

