"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProviderJobFeedCard } from "./provider-job-feed-card";
import type { ProviderFeedFilter, ProviderFeedJob, ProviderFeedSort } from "./types";

type ProviderJobFeedListProps = {
  jobs: ProviderFeedJob[];
  initialFilter: ProviderFeedFilter;
  initialSort: ProviderFeedSort;
  showHeading?: boolean;
};

const SAVED_KEY = "provider_saved_job_requests_v1";

function initialSavedIds() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
}

export function ProviderJobFeedList({ jobs, initialFilter, initialSort, showHeading = true }: ProviderJobFeedListProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [filter, setFilter] = useState<ProviderFeedFilter>(initialFilter);
  const [sort, setSort] = useState<ProviderFeedSort>(initialSort);
  const [savedIds, setSavedIds] = useState<Set<string>>(initialSavedIds);

  useEffect(() => {
    const query = new URLSearchParams({ filter, sort });
    router.replace(`${pathname}?${query.toString()}`);
  }, [filter, sort, pathname, router]);

  const toggleSave = (jobId: string) => {
    setSavedIds((previous) => {
      const next = new Set(previous);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      localStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const filteredJobs = useMemo(() => {
    const list = jobs.filter((job) => {
      if (filter === "saved") return savedIds.has(job.id);
      if (filter === "open") return job.jobStatus === "Open" || job.jobStatus === "Quoting";
      if (filter === "assigned") return job.jobStatus === "Assigned" || job.jobStatus === "InProgress";
      if (filter === "completed") return job.jobStatus === "Completed" || job.jobStatus === "Closed";
      return true;
    });

    return list.sort((first, second) => {
      const firstTime = new Date(first.createdAt).getTime();
      const secondTime = new Date(second.createdAt).getTime();
      return sort === "oldest" ? firstTime - secondTime : secondTime - firstTime;
    });
  }, [jobs, filter, sort, savedIds]);

  const hasJobs = jobs.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {showHeading ? <h1 className="text-xl font-semibold">Job requests</h1> : <div />}

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Sort</span>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={sort}
            onChange={(event) => setSort(event.target.value as ProviderFeedSort)}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ["all", "All"],
          ["open", "Open"],
          ["assigned", "Assigned"],
          ["completed", "Completed"],
          ["saved", "Saved"],
        ] as Array<[ProviderFeedFilter, string]>).map(([value, label]) => (
          <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>
            {label}
          </Button>
        ))}
      </div>

      {hasJobs && filteredJobs.length > 0 ? (
        <div className="space-y-4">
          {filteredJobs.map((job) => (
            <ProviderJobFeedCard key={job.id} job={job} isSaved={savedIds.has(job.id)} onToggleSave={toggleSave} />
          ))}
        </div>
      ) : hasJobs ? (
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-base font-medium">No jobs match this filter</p>
            <p className="text-sm text-muted-foreground">Try switching filters or clear filters to see more requests.</p>
            <div>
              <Button variant="outline" onClick={() => setFilter("all")}>Clear filters</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-base font-medium">No job requests right now</p>
            <p className="text-sm text-muted-foreground">New requests will appear here when customers post jobs in your areas.</p>
            <div>
              <Button variant="outline" onClick={() => router.refresh()}>Refresh</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
