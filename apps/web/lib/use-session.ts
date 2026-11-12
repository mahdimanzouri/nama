"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, type SessionPayload, type SessionUser } from "@nama/api-client";

import { apiClient } from "./api";
import { errorMessage } from "./error-message";

export type SessionState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }
  | { status: "authenticated"; session: SessionPayload };

export type SessionPreferences = Partial<
  Pick<SessionUser, "locale" | "theme" | "timezone">
>;

export interface UseSessionResult {
  state: SessionState;
  reload: () => void;
  /** Merges a committed preference so the tree re-renders without a reload. */
  applyPreferences: (patch: SessionPreferences) => void;
}

/** Reads the current session from cookies; nothing is cached across calls. */
export function useSession(): UseSessionResult {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    apiClient.getSession({ signal: controller.signal }).then(
      (session) => {
        if (active) setState({ status: "authenticated", session });
      },
      (error: unknown) => {
        if (!active || controller.signal.aborted) return;

        if (error instanceof ApiError && error.status === 401) {
          setState({ status: "unauthenticated" });
          return;
        }

        setState({ status: "error", message: errorMessage(error) });
      },
    );

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  const applyPreferences = useCallback((patch: SessionPreferences) => {
    setState((previous) =>
      previous.status === "authenticated"
        ? {
            ...previous,
            session: {
              ...previous.session,
              user: { ...previous.session.user, ...patch },
            },
          }
        : previous,
    );
  }, []);

  return { state, reload, applyPreferences };
}
