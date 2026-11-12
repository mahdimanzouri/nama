import { Suspense } from "react";

import { RouteFallback } from "@/components/route-fallback";

import { ViewerPageClient } from "./viewer-client";

export default function ViewerRoute({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<RouteFallback label="Loading the published dashboard…" />}>
      <ViewerRouteContent params={params} />
    </Suspense>
  );
}

async function ViewerRouteContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ViewerPageClient dashboardId={id} />;
}
