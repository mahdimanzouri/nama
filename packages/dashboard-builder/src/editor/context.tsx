import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import { isRevisionConflictError } from "@nama/dashboard-core";

import { useDashboardRuntime } from "../context";
import {
  createEditorStore,
  isDirty,
  type EditorStore,
  type EditorStoreApi,
} from "./store";

export interface EditorContextValue {
  store: EditorStoreApi;
  save: () => Promise<boolean>;
  publish: () => Promise<boolean>;
  canSave: boolean;
  canPublish: boolean;
  readOnly: boolean;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const value = useContext(EditorContext);

  if (!value) {
    throw new Error("[nama] DashboardEditor must be rendered inside DashboardProvider");
  }

  return value;
}

/**
 * Owns the draft store for one editor mount and bridges host persistence
 * callbacks. The store is created once; registry and callbacks are refreshed
 * through `setEnvironment` so re-renders never discard local edits.
 */
export function EditorDraftProvider({
  readOnly = false,
  children,
}: {
  readOnly?: boolean;
  children: ReactNode;
}) {
  const runtime = useDashboardRuntime();
  const [store] = useState(() =>
    createEditorStore({
      config: runtime.config,
      revision: runtime.revision,
      publishedAt: runtime.publishedAt,
      publishedRevision: runtime.publishedRevision,
      registry: () => runtime.registry,
      onChange: (next) => runtime.editor.onChange?.(next),
    }),
  );
  const propsRef = useRef({ config: runtime.config, revision: runtime.revision });

  // The store is created once per mount; keep the host bindings current through
  // an action instead of re-creating it, so local edits survive prop changes.
  useEffect(() => {
    store.getState().setEnvironment({
      registry: () => runtime.registry,
      onChange: (next) => runtime.editor.onChange?.(next),
    });
  }, [store, runtime]);

  useEffect(() => {
    const previous = propsRef.current;
    if (previous.config === runtime.config && previous.revision === runtime.revision) {
      return;
    }
    propsRef.current = { config: runtime.config, revision: runtime.revision };

    const state = store.getState();
    if (previous.config === runtime.config) {
      state.rebase(runtime.revision);
      return;
    }

    // A replaced baseline while local edits exist is a conflict, not an
    // instruction to overwrite the draft.
    if (isDirty(state)) {
      if (runtime.revision !== state.revision) {
        state.markConflict(state.revision, runtime.revision);
      }
      return;
    }

    state.replaceDraft({
      config: runtime.config,
      revision: runtime.revision,
      updatedAt: state.updatedAt ?? new Date().toISOString(),
    });
  }, [runtime.config, runtime.revision, store]);

  const handleFailure = useCallback(
    (error: unknown, expectedRevision: number) => {
      if (isRevisionConflictError(error)) {
        store.getState().markConflict(expectedRevision, error.currentRevision);
        runtime.editor.onConflict?.(error);
        return;
      }

      store.getState().fail(error instanceof Error ? error.message : String(error));
    },
    [store, runtime],
  );

  const save = useCallback(async () => {
    const state = store.getState();
    const onSave = runtime.editor.onSave;
    if (state.phase !== "idle" || !onSave) return false;
    if (!isDirty(state)) return true;

    const config = state.config;
    state.beginSave();

    try {
      const result = await onSave(config, { revision: state.revision });
      store.getState().completeSave({
        config,
        revision: result.revision,
        updatedAt: result.updatedAt ?? new Date().toISOString(),
      });
      return true;
    } catch (error) {
      handleFailure(error, state.revision);
      return false;
    }
  }, [store, runtime, handleFailure]);

  const publish = useCallback(async () => {
    const initial = store.getState();
    const onPublish = runtime.editor.onPublish;
    if (initial.phase !== "idle" || !onPublish) return false;

    if (isDirty(initial) && !(await save())) return false;

    const current = store.getState();
    if (current.phase !== "idle") return false;
    current.beginPublish();

    try {
      const result = await onPublish({ revision: current.revision });
      store.getState().completePublish({
        config: current.config,
        revision: result.revision,
        publishedAt: result.publishedAt ?? new Date().toISOString(),
        publishedRevision: result.publishedRevision ?? result.revision,
      });
      return true;
    } catch (error) {
      handleFailure(error, current.revision);
      return false;
    }
  }, [store, runtime, save, handleFailure]);

  const value = useMemo<EditorContextValue>(
    () => ({
      store,
      save,
      publish,
      canSave: runtime.editor.onSave !== undefined,
      canPublish: runtime.editor.onPublish !== undefined,
      readOnly,
    }),
    [store, save, publish, runtime.editor.onSave, runtime.editor.onPublish, readOnly],
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export interface DashboardEditorApi extends EditorStore {
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canSave: boolean;
  canPublish: boolean;
  readOnly: boolean;
  save: () => Promise<boolean>;
  publish: () => Promise<boolean>;
}

/** Public editor facade; the underlying store shape is not public API. */
export function useDashboardEditor(): DashboardEditorApi {
  const { store, save, publish, canSave, canPublish, readOnly } = useEditorContext();
  const state = useStore(store);

  return useMemo(
    () => ({
      ...state,
      dirty: isDirty(state),
      canUndo: state.history.length > 0,
      canRedo: state.future.length > 0,
      canSave,
      canPublish,
      readOnly,
      save,
      publish,
    }),
    [state, canSave, canPublish, readOnly, save, publish],
  );
}
