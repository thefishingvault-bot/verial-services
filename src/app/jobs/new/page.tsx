import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { JobPostFormPage } from "@/components/jobs/job-post-form-page";

export default async function UniversalJobPostPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return <JobPostFormPage />;
}