import { ReceiptInfoRow } from "@/components/receipt/receipt-info-row";

interface Props {
  name: string;
  email?: string | null;
}

export function ReceiptCustomerInfo({ name, email }: Props) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-base font-semibold">Customer</h2>
      <div className="space-y-2 text-sm">
        <ReceiptInfoRow label="Name" value={name} />
        {email && <ReceiptInfoRow label="Email" value={email} />}
        <ReceiptInfoRow label="Address" value={<span className="text-muted-foreground">Not provided</span>} />
      </div>
    </section>
  );
}
