import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getReceiptData } from "@/lib/invoices/get-receipt-data";
import { ReceiptHeader } from "@/components/receipt/receipt-header";
import { ReceiptProviderInfo } from "@/components/receipt/receipt-provider-info";
import { ReceiptCustomerInfo } from "@/components/receipt/receipt-customer-info";
import { ReceiptPriceBreakdown } from "@/components/receipt/receipt-price-breakdown";
import { ReceiptFooter } from "@/components/receipt/receipt-footer";
import { ReceiptInfoRow } from "@/components/receipt/receipt-info-row";
import { PrintButton } from "@/components/receipt/print-button";

export const runtime = "nodejs";

export default async function BookingInvoicePage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { userId } = await auth();
  const { bookingId } = await params;

  if (!userId) return unauthorizedCard();

  const result = await getReceiptData(bookingId, userId);
  if (!result.ok) {
    if (result.error === "unauthorized") return unauthorizedCard();
    return notFoundCard();
  }

  const { booking, provider, customer, service, payment, totals, cancellation } = result.data;

  if (!provider.chargesGst) {
    return notFoundCard();
  }

  const paymentStatus = payment.status ?? booking.status;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/dashboard/bookings/${booking.id}`} className="text-primary hover:underline">
            Back to booking
          </Link>
          <span>•</span>
          <span>Booking {booking.id}</span>
        </div>
         <div className="flex items-center gap-2">
           <PrintButton />
           <Button variant="secondary" disabled>
             Download PDF (coming soon)
           </Button>
         </div>
       </div>
 
       <Card className="shadow-sm">
         <CardContent className="space-y-6 p-6">
           <ReceiptHeader
             title="Tax Invoice"
             subtitle={service.title}
             issuedAt={booking.createdAt}
             invoiceNumber={booking.id}
           />
 
           <div className="grid gap-4 md:grid-cols-2">
             <ReceiptProviderInfo
               businessName={provider.businessName}
               region={provider.baseRegion}
               suburb={provider.baseSuburb}
               gstNumber={provider.gstNumber}
               chargesGst={true}
             />
             <ReceiptCustomerInfo name={customer.name} email={customer.email} />
           </div>
 
           <section className="space-y-3 rounded-lg border bg-card p-4">
             <h2 className="text-base font-semibold">Booking</h2>
             <div className="space-y-2 text-sm">
               <ReceiptInfoRow label="Service" value={service.title} />
               <ReceiptInfoRow label="Category" value={service.category} />
               <ReceiptInfoRow
                 label="Scheduled"
                 value={booking.scheduledDate ? booking.scheduledDate.toLocaleString() : "Not scheduled"}
               />
               <ReceiptInfoRow label="Payment status" value={<Badge variant="outline">{paymentStatus}</Badge>} />
               {cancellation && (
                 <ReceiptInfoRow
                   label="Cancellation"
                   value={`${cancellation.actor} on ${cancellation.createdAt.toLocaleString()}${cancellation.reason ? ` — ${cancellation.reason}` : ""}`}
                 />
               )}
             </div>
           </section>
 
           <ReceiptPriceBreakdown totals={totals} currency={payment.currency ?? "NZD"} chargesGst={true} />
 
           <ReceiptFooter />
         </CardContent>
       </Card>
     </div>
  );
 }
 
 function unauthorizedCard() {
   return (
     <div className="mx-auto max-w-3xl px-4 py-8">
       <Card>
         <CardContent className="space-y-2 p-6">
           <p className="text-lg font-semibold">Unauthorized</p>
           <p className="text-sm text-muted-foreground">You do not have access to this invoice.</p>
         </CardContent>
       </Card>
     </div>
   );
 }
 
 function notFoundCard() {
   return (
     <div className="mx-auto max-w-3xl px-4 py-8">
       <Card>
         <CardContent className="space-y-2 p-6">
           <p className="text-lg font-semibold">Not found</p>
           <p className="text-sm text-muted-foreground">This invoice could not be found.</p>
         </CardContent>
       </Card>
     </div>
   );
 }
