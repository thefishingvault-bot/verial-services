import React from "react";
import { CalendarClock, CheckCircle2, Clock, CreditCard, Flag, MessageSquare, RefreshCcw, RotateCcw, XCircle, AlertTriangle } from "lucide-react";

export type TimelineEvent<TType extends string = string> = {
  type: TType;
  label: string;
  timestamp: Date;
};

type Props<TType extends string> = {
  events: TimelineEvent<TType>[];
};

const iconMap: Record<string, React.ReactNode> = {
  requested: <Clock className="h-4 w-4 text-muted-foreground" />,
  accepted: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  payment_intent_created: <CreditCard className="h-4 w-4 text-blue-500" />,
  paid: <CreditCard className="h-4 w-4 text-blue-600" />,
  completed: <Flag className="h-4 w-4 text-emerald-600" />,
  cancelled: <XCircle className="h-4 w-4 text-destructive" />,
  reviewed: <MessageSquare className="h-4 w-4 text-purple-500" />,
  reschedule_requested: <RefreshCcw className="h-4 w-4 text-orange-500" />,
  reschedule_approved: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  reschedule_declined: <XCircle className="h-4 w-4 text-destructive" />,
  refund: <RotateCcw className="h-4 w-4 text-blue-600" />,
  reschedule_pending: <RefreshCcw className="h-4 w-4 text-orange-400" />,
  disputed: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  refunded: <RotateCcw className="h-4 w-4 text-blue-600" />,
};

function formatEventTime(date: Date) {
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BookingTimeline<TType extends string>({ events }: Props<TType>) {
  if (!events.length) return <p className="text-sm text-muted-foreground">No timeline events yet.</p>;

  return (
    <ol className="space-y-4">
      {events.map((event, idx) => {
        const isLast = idx === events.length - 1;
        const Icon = iconMap[event.type] ?? <CalendarClock className="h-4 w-4 text-muted-foreground" />;

        return (
          <li key={`${event.type}-${event.timestamp.toISOString()}-${idx}`} className="relative pl-8">
            {!isLast && <span className="absolute left-1.5 top-5 h-full w-px bg-border" aria-hidden />}
            <div className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-muted">
              {Icon}
            </div>
            <div className="space-y-1">
              <p className="font-medium leading-tight">{event.label}</p>
              <p className="text-sm text-muted-foreground">{formatEventTime(event.timestamp)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
