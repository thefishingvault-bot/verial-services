import Link from "next/link";

export function ReceiptFooter() {
  return (
    <footer className="mt-8 border-t pt-4 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">Thank you for booking with Verial.</p>
      <p>All services are subject to Verial terms. GST shown where applicable.</p>
      <p>
        Need help? <Link href="/dashboard/messages" className="text-primary hover:underline">Contact support</Link>.
      </p>
    </footer>
  );
}
