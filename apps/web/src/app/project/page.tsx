"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ProjectScreen } from "../../components/ProjectScreen";

function ProjectRoute() {
  // Static export has no per-project routes, so the project id travels in the query string.
  const projectId = useSearchParams().get("id");
  return <ProjectScreen projectId={projectId} />;
}

export default function ProjectPage() {
  return (
    <Suspense fallback={null}>
      <ProjectRoute />
    </Suspense>
  );
}
