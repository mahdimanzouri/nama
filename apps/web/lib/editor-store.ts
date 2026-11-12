import { createStore, type StoreApi } from "zustand/vanilla";
import type { DashboardView } from "@nama/api-client";
import type { DashboardConfig } from "@nama/dashboard-types";

import {
  addWidgetToConfig,
  createWidget,
  moveWidgetInConfig,
  removeWidgetFromConfig,
  resizeWidgetInConfig,
  type WidgetPreset,
} from "./dashboard-config";

export interface EditorBaseline {
  config: DashboardConfig;
  revision: number;
  updatedAt: string;
  publishedAt: string | null;
  publishedConfig: DashboardConfig | null;
}

export type EditorPhase = "idle" | "saving" | "publishing";

export interface EditorState extends EditorBaseline {
  /** Reference baseline captured at load/save; identity drives the dirty flag. */
  savedConfig: DashboardConfig;
  phase: EditorPhase;
  conflictRevision: number | null;
  notice: string | null;
  error: string | null;
}

export interface EditorActions {
  addWidget(preset: WidgetPreset): void;
  removeWidget(widgetId: string): void;
  moveWidget(widgetId: string, dx: number, dy: number): void;
  resizeWidget(widgetId: string, dw: number, dh: number): void;
  beginWork(phase: Exclude<EditorPhase, "idle">): void;
  saved(config: DashboardConfig, revision: number, updatedAt: string): void;
  published(view: DashboardView): void;
  conflicted(currentRevision: number): void;
  failed(message: string): void;
  reloaded(baseline: EditorBaseline): void;
  dismissConflict(): void;
}

export type EditorStore = EditorState & EditorActions;
export type EditorStoreApi = StoreApi<EditorStore>;

export function isDirty(state: EditorState): boolean {
  return state.config !== state.savedConfig;
}

/**
 * Local editor state lives in Zustand (architectural rule 5). The store is
 * created per editor mount so navigating between dashboards never leaks state.
 */
export function createEditorStore(initial: EditorBaseline): EditorStoreApi {
  return createStore<EditorStore>()((set) => ({
    ...initial,
    savedConfig: initial.config,
    phase: "idle",
    conflictRevision: null,
    notice: null,
    error: null,

    addWidget(preset) {
      const { widget, size } = createWidget(preset);
      set((state) => ({
        config: addWidgetToConfig(state.config, widget, size),
        error: null,
        notice: null,
      }));
    },

    removeWidget(widgetId) {
      set((state) => ({
        config: removeWidgetFromConfig(state.config, widgetId),
        error: null,
        notice: null,
      }));
    },

    moveWidget(widgetId, dx, dy) {
      set((state) => ({ config: moveWidgetInConfig(state.config, widgetId, dx, dy) }));
    },

    resizeWidget(widgetId, dw, dh) {
      set((state) => ({
        config: resizeWidgetInConfig(state.config, widgetId, dw, dh),
      }));
    },

    beginWork(phase) {
      set({ phase, error: null, notice: null });
    },

    saved(config, revision, updatedAt) {
      set({
        savedConfig: config,
        revision,
        updatedAt,
        phase: "idle",
        notice: "Draft saved.",
        error: null,
      });
    },

    published(view) {
      set((state) => ({
        savedConfig: state.config,
        revision: view.revision,
        updatedAt: view.updatedAt,
        publishedAt: view.publishedAt,
        publishedConfig: view.publishedConfig,
        phase: "idle",
        conflictRevision: null,
        notice: "Published.",
        error: null,
      }));
    },

    conflicted(currentRevision) {
      set({
        phase: "idle",
        conflictRevision: currentRevision,
        error: null,
        notice: null,
      });
    },

    failed(message) {
      set({ phase: "idle", error: message });
    },

    reloaded(baseline) {
      set({
        ...baseline,
        savedConfig: baseline.config,
        phase: "idle",
        conflictRevision: null,
        notice: "Reloaded the latest draft.",
        error: null,
      });
    },

    dismissConflict() {
      set({ conflictRevision: null });
    },
  }));
}
