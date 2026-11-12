"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { SessionPayload } from "@nama/api-client";

import { useSession } from "@/lib/use-session";
import { useWebI18n } from "@/lib/web-preferences";

import { AppShell } from "./app-shell";

export interface WorkspaceGateProps {
  children: (session: SessionPayload) => ReactNode;
}

/** Loads the session, redirects unauthenticated visitors and renders the shell. */
export function WorkspaceGate({ children }: WorkspaceGateProps) {
  const router = useRouter();
  const { state, reload, applyPreferences } = useSession();

  useEffect(() => {
    if (state.status === "unauthenticated") router.replace("/login");
  }, [state.status, router]);

  if (state.status === "error") {
    return (
      <AppShell>
        <SessionError message={state.message} onRetry={reload} />
      </AppShell>
    );
  }

  if (state.status !== "authenticated") {
    return (
      <AppShell>
        <SessionPending redirecting={state.status === "unauthenticated"} />
      </AppShell>
    );
  }

  return (
    <AppShell session={state.session} onPreferencesChange={applyPreferences}>
      {children(state.session)}
    </AppShell>
  );
}

function SessionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useWebI18n().translate;

  return (
    <div className="app-notice app-notice--error" role="alert">
      <p>{message}</p>
      <button type="button" className="app-button" onClick={onRetry}>
        {t("web.common.tryAgain")}
      </button>
    </div>
  );
}

function SessionPending({ redirecting }: { redirecting: boolean }) {
  const t = useWebI18n().translate;

  return (
    <p className="app-muted">
      {redirecting ? t("web.common.redirecting") : t("web.common.loadingWorkspace")}
    </p>
  );
}
