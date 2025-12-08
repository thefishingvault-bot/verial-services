import { CalendarClock } from "lucide-react";

interface Props {
  title: string;
  subtitle?: string;
  issuedAt: Date;
  invoiceNumber?: string;
}

export function ReceiptHeader({ title, subtitle, issuedAt, invoiceNumber }: Props) {
  return (
    <header className="flex flex-col gap-2 border-b pb-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Verial</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" /> Issued {issuedAt.toLocaleDateString()}
        </span>
        {invoiceNumber && <span className="inline-flex items-center gap-1">Invoice #: {invoiceNumber}</span>}
      </div>
    </header>
  );
}
