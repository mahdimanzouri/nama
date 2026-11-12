"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { SessionPayload } from "@nama/api-client";

import { useSession } from "@/lib/use-session";

import { AppShell } from "./app-shell";

export interface WorkspaceGateProps {
  children: (session: SessionPayload) => ReactNode;
}

/** Loads the session, redirects unauthenticated visitors and renders the shell. */
export function WorkspaceGate({ children }: WorkspaceGateProps) {
  const router = useRouter();
  const { state, reload } = useSession();

  useEffect(() => {
    if (state.status === "unauthenticated") router.replace("/login");
  }, [state.status, router]);

  if (state.status === "error") {
    return (
      <AppShell>
        <div className="app-notice app-notice--error" role="alert">
          <p>{state.message}</p>
          <button type="button" className="app-button" onClick={reload}>
            Try again
          </button>
        </div>
      </AppShell>
    );
  }

  if (state.status !== "authenticated") {
    return (
      <AppShell>
        <p className="app-muted">
          {state.status === "unauthenticated"
            ? "Redirecting to sign in…"
            : "Loading workspace…"}
        </p>
      </AppShell>
    );
  }

  return <AppShell session={state.session}>{children(state.session)}</AppShell>;
}
