import { Suspense } from "react";

import { RouteFallback } from "@/components/route-fallback";

import { EditorPageClient } from "./editor-client";

export default function EditorRoute({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<RouteFallback label="Loading the editor…" />}>
      <EditorRouteContent params={params} />
    </Suspense>
  );
}

async function EditorRouteContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorPageClient dashboardId={id} />;
}
