import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Clock, Repeat, Layers, Target, CheckCircle2 } from "lucide-react";
import type { ProviderStats } from "@/lib/provider-stats";

interface ProviderStatsCardProps {
  stats: ProviderStats | null;
}

const statItem = (label: string, value: string | number | null, icon?: React.ReactNode) => (
  <div className="flex items-center justify-between rounded-lg border px-3 py-2 bg-white/60">
    <div className="flex items-center gap-2 text-sm text-slate-700">
      {icon}
      <span>{label}</span>
    </div>
    <div className="text-sm font-semibold text-slate-900">{value ?? '—'}</div>
  </div>
);

export function ProviderStatsCard({ stats }: ProviderStatsCardProps) {
  if (!stats) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Provider performance</CardTitle>
        <div className="flex gap-2 items-center">
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            {stats.isVerified ? 'Verified' : 'Unverified'}
          </Badge>
          <Badge variant="outline" className="gap-1">
            Trust: {stats.trustLevel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {statItem('Completion rate', stats.completionRate != null ? `${stats.completionRate}%` : null, <CheckCircle2 className="h-4 w-4 text-emerald-500" />)}
        {statItem('Cancellation rate', stats.cancellationRate != null ? `${stats.cancellationRate}%` : null, <Target className="h-4 w-4 text-rose-500" />)}
        {statItem('Avg response time', stats.avgResponseMinutes != null ? `${stats.avgResponseMinutes} min` : null, <Clock className="h-4 w-4 text-sky-500" />)}
        {statItem('Repeat customers', stats.repeatCustomers, <Repeat className="h-4 w-4 text-indigo-500" />)}
        {statItem('Services offered', stats.totalServices, <Layers className="h-4 w-4 text-amber-500" />)}
        {statItem('Years active', stats.yearsActive, <ShieldCheck className="h-4 w-4 text-slate-600" />)}
      </CardContent>
    </Card>
  );
}
