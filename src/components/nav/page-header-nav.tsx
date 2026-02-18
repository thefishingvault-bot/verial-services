"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

type PageCrumb = {
  label: string;
  href?: string;
};

type PageHeaderNavProps = {
  title: string;
  backHref: string;
  backLabel?: string;
  crumbs?: PageCrumb[];
  rightAction?: React.ReactNode;
};

export function PageHeaderNav({
  title,
  backHref,
  backLabel = "Back to dashboard",
  crumbs = [],
  rightAction,
}: PageHeaderNavProps) {
  return (
    <div className="rounded-lg border bg-background p-3 md:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href={backHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {backLabel}
            </Link>
          </Button>
          {crumbs.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {crumbs.map((crumb, index) => (
                <div key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                  {index > 0 ? <ChevronRight className="h-3 w-3" /> : null}
                  {crumb.href ? (
                    <Link href={crumb.href} className="hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-foreground">{crumb.label}</span>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          <h1 className="text-lg font-semibold md:text-xl">{title}</h1>
        </div>
        {rightAction ? <div className="shrink-0">{rightAction}</div> : null}
      </div>
    </div>
  );
}