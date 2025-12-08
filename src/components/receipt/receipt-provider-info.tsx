import { ReceiptInfoRow } from "@/components/receipt/receipt-info-row";

interface Props {
  businessName: string;
  region?: string | null;
  suburb?: string | null;
  gstNumber?: string | null;
  chargesGst: boolean;
}

export function ReceiptProviderInfo({ businessName, region, suburb, gstNumber, chargesGst }: Props) {
  const location = [suburb, region].filter(Boolean).join(", ");

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-base font-semibold">Provider</h2>
      <div className="space-y-2 text-sm">
        <ReceiptInfoRow label="Business" value={businessName} />
        {location && <ReceiptInfoRow label="Location" value={location} />}
        {chargesGst && gstNumber && <ReceiptInfoRow label="GST Number" value={gstNumber} />}
      </div>
    </section>
  );
}
