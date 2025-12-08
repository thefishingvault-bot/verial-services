import { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
}

export function ReceiptInfoRow({ label, value }: Props) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground sm:max-w-[70%]">{value}</div>
    </div>
  );
}
