"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function NewCustomerJobPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState("");
  const [suburb, setSuburb] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/customer/job-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, region, suburb }),
      });

      if (!res.ok) {
        setError(await res.text());
        return;
      }

      const created = (await res.json()) as { id: string };
      router.push(`/customer/jobs/${created.id}`);
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Post a new job</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="mb-1 block text-sm">Title</label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} disabled={isPending} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Description</label>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={isPending} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">Region</label>
              <Input value={region} onChange={(event) => setRegion(event.target.value)} disabled={isPending} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Suburb</label>
              <Input value={suburb} onChange={(event) => setSuburb(event.target.value)} disabled={isPending} />
            </div>
          </div>
          <Button disabled={isPending || !title.trim()} onClick={submit}>Create job</Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
