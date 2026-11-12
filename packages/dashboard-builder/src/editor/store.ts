import { createStore, type StoreApi } from "zustand/vanilla";
import { PLATFORM_LIMITS } from "@nama/dashboard-types";
import type { WidgetRegistry } from "@nama/dashboard-core";
import type {
  Breakpoint,
  DashboardConfig,
  DashboardFilter,
  DashboardVariable,
  DashboardWidget,
  LayoutItem,
} from "@nama/dashboard-types";

import {
  MAX_WIDGET_HEIGHT,
  MIN_WIDGET_HEIGHT,
  addWidgetToConfig,
  defaultDataSourceId,
  editableItems,
  findFreePosition,
  removeWidgetFromConfig,
  setWidgetRect,
  updateMetadataInConfig,
  updateWidgetInConfig,
  withBreakpointItems,
} from "./model";

export const HISTORY_LIMIT = PLATFORM_LIMITS.maxHistoryEntries;

export type EditorPhase = "idle" | "saving" | "publishing";

export type EditorNotice = "saved" | "published";

/** Localized failure: the UI translates `key` with `values`. */
export interface EditorFailure {
  key: string;
  values?: Record<string, unknown>;
}

export interface EditorConflict {
  expectedRevision: number;
  currentRevision: number;
}

export interface EditorState {
  config: DashboardConfig;
  /** Baseline captured at load/save; identity drives the dirty flag. */
  savedConfig: DashboardConfig;
  revision: number;
  updatedAt: string | null;
  publishedAt: string | null;
  publishedRevision: number | null;
  selectedWidgetId: string | null;
  breakpoint: Breakpoint;
  preview: boolean;
  history: DashboardConfig[];
  future: DashboardConfig[];
  phase: EditorPhase;
  conflict: EditorConflict | null;
  error: EditorFailure | null;
  notice: EditorNotice | null;
}

export interface EditorDraft {
  config: DashboardConfig;
  revision: number;
  updatedAt: string;
  publishedAt?: string | null;
  publishedRevision?: number | null;
}

export interface EditorEnvironment {
  /** Read lazily so registry changes do not discard the draft. */
  registry: () => WidgetRegistry;
  /** Controlled mode: every committed configuration is reported to the host. */
  onChange?: (config: DashboardConfig) => void;
}

export interface EditorStoreActions {
  addWidget(type: string, options?: { dataSourceId?: string }): void;
  removeWidget(widgetId: string): void;
  selectWidget(widgetId: string | null): void;
  moveWidget(widgetId: string, dx: number, dy: number): void;
  resizeWidget(widgetId: string, dw: number, dh: number): void;
  placeWidget(widgetId: string): void;
  commitLayout(items: readonly LayoutItem[]): void;
  updateWidget(
    widgetId: string,
    patch: {
      title?: string;
      config?: unknown;
      query?: DashboardWidget["query"];
      visibility?: DashboardWidget["visibility"];
      interaction?: DashboardWidget["interaction"];
    },
  ): void;
  updateMetadata(patch: { title?: string }): void;
  setVariables(variables: readonly DashboardVariable[]): void;
  setFilters(filters: readonly DashboardFilter[]): void;
  /** Renaming a variable rewrites widget interactions that referenced it. */
  upsertVariable(variable: DashboardVariable, previousName?: string): void;
  /** Removes the variable and any widget interaction that targeted it. */
  removeVariable(variableId: string): void;
  setBreakpoint(breakpoint: Breakpoint): void;
  setPreview(preview: boolean): void;
  undo(): void;
  redo(): void;
  beginSave(): void;
  completeSave(result: {
    config: DashboardConfig;
    revision: number;
    updatedAt: string;
  }): void;
  beginPublish(): void;
  completePublish(result: {
    config: DashboardConfig;
    revision: number;
    publishedAt: string;
    publishedRevision: number;
  }): void;
  fail(failure: EditorFailure | string): void;
  markConflict(expectedRevision: number, currentRevision: number): void;
  dismissConflict(): void;
  discardChanges(): void;
  clearNotice(): void;
  rebase(revision: number): void;
  replaceDraft(draft: EditorDraft): void;
  setEnvironment(environment: EditorEnvironment): void;
}

export type EditorStore = EditorState & EditorStoreActions;
export type EditorStoreApi = StoreApi<EditorStore>;

export interface CreateEditorStoreOptions {
  config: DashboardConfig;
  revision: number;
  updatedAt?: string | null;
  publishedAt?: string | null;
  publishedRevision?: number | null;
  /** Read lazily so registry changes do not discard the draft. */
  registry: () => WidgetRegistry;
  /** Controlled mode: every committed configuration is reported to the host. */
  onChange?: (config: DashboardConfig) => void;
}

export function isDirty(state: Pick<EditorState, "config" | "savedConfig">): boolean {
  return state.config !== state.savedConfig;
}

/**
 * Local editor state lives in Zustand and never leaves the SDK (architectural
 * rule 5). One store exists per editor mount, so navigating between dashboards
 * cannot leak a draft or its history.
 */
export function createEditorStore(options: CreateEditorStoreOptions): EditorStoreApi {
  return createStore<EditorStore>()((set, get) => {
    let environment: EditorEnvironment = {
      registry: options.registry,
      onChange: options.onChange,
    };

    function commit(config: DashboardConfig): void {
      const state = get();
      if (config === state.config) return;

      set({
        config,
        history: [...state.history, state.config].slice(-HISTORY_LIMIT),
        future: [],
        notice: null,
        error: null,
      });
      environment.onChange?.(config);
    }

    function failure(key: string, values?: Record<string, unknown>): EditorFailure {
      return values ? { key, values } : { key };
    }

    return {
      config: options.config,
      savedConfig: options.config,
      revision: options.revision,
      updatedAt: options.updatedAt ?? null,
      publishedAt: options.publishedAt ?? null,
      publishedRevision: options.publishedRevision ?? null,
      selectedWidgetId: null,
      breakpoint: "desktop",
      preview: false,
      history: [],
      future: [],
      phase: "idle",
      conflict: null,
      error: null,
      notice: null,

      addWidget(type, addOptions) {
        const plugin = environment.registry().get(type);
        if (!plugin) {
          set({ error: failure("builder.error.unknownWidget", { type }) });
          return;
        }

        const state = get();
        const dataSourceId =
          addOptions?.dataSourceId ??
          defaultDataSourceId(state.config) ??
          plugin.defaultDataSourceId;
        const config = addWidgetToConfig(state.config, state.breakpoint, {
          type,
          title: plugin.manifest.name,
          config: plugin.defaultConfig as Record<string, unknown>,
          defaultSize: plugin.defaultSize,
          ...(dataSourceId === undefined ? {} : { dataSourceId }),
          ...(plugin.defaultQuery === undefined ? {} : { query: plugin.defaultQuery }),
        });

        if (config === state.config) {
          set({
            error: failure("builder.error.widgetLimit", {
              limit: PLATFORM_LIMITS.maxWidgets,
            }),
          });
          return;
        }

        const added = config.widgets[config.widgets.length - 1];
        set({ selectedWidgetId: added?.id ?? null });
        commit(config);
      },

      removeWidget(widgetId) {
        const state = get();
        commit(removeWidgetFromConfig(state.config, widgetId));
        if (state.selectedWidgetId === widgetId) set({ selectedWidgetId: null });
      },

      selectWidget(widgetId) {
        set({ selectedWidgetId: widgetId });
      },

      moveWidget(widgetId, dx, dy) {
        const state = get();
        const item = editableItems(state.config, state.breakpoint).find(
          (entry) => entry.widgetId === widgetId,
        );
        if (!item) return;

        commit(
          setWidgetRect(state.config, state.breakpoint, widgetId, {
            x: item.x + dx,
            y: item.y + dy,
          }),
        );
      },

      resizeWidget(widgetId, dw, dh) {
        const state = get();
        const item = editableItems(state.config, state.breakpoint).find(
          (entry) => entry.widgetId === widgetId,
        );
        if (!item) return;

        commit(
          setWidgetRect(state.config, state.breakpoint, widgetId, {
            w: item.w + dw,
            h: item.h + dh,
          }),
        );
      },

      placeWidget(widgetId) {
        const state = get();
        const columns = state.config.layouts[state.breakpoint].columns;
        const widget = state.config.widgets.find((entry) => entry.id === widgetId);
        if (!widget) return;

        const plugin = environment.registry().get(widget.type);
        const width = Math.min(plugin?.defaultSize.w ?? 4, columns);
        const height = Math.min(
          Math.max(plugin?.defaultSize.h ?? 5, MIN_WIDGET_HEIGHT),
          MAX_WIDGET_HEIGHT,
        );
        const items = editableItems(state.config, state.breakpoint);

        commit(
          withBreakpointItems(state.config, state.breakpoint, [
            ...items,
            {
              widgetId,
              ...findFreePosition(items, columns, width, height),
              w: width,
              h: height,
            },
          ]),
        );
      },

      commitLayout(items) {
        const state = get();
        commit(withBreakpointItems(state.config, state.breakpoint, items));
      },

      updateWidget(widgetId, patch) {
        const state = get();
        commit(updateWidgetInConfig(state.config, widgetId, patch));
      },

      updateMetadata(patch) {
        const state = get();
        commit(updateMetadataInConfig(state.config, patch));
      },

      setVariables(variables) {
        const state = get();
        commit({ ...state.config, variables: variables.map((entry) => ({ ...entry })) });
      },

      setFilters(filters) {
        const state = get();
        commit({ ...state.config, filters: filters.map((entry) => ({ ...entry })) });
      },

      upsertVariable(variable, previousName) {
        const state = get();
        const exists = state.config.variables.some((entry) => entry.id === variable.id);
        const variables = exists
          ? state.config.variables.map((entry) =>
              entry.id === variable.id ? variable : entry,
            )
          : [...state.config.variables, variable];
        const renamed =
          previousName !== undefined && previousName !== variable.name
            ? previousName
            : undefined;
        const widgets =
          renamed === undefined
            ? state.config.widgets
            : state.config.widgets.map((widget) =>
                widget.interaction?.variable === renamed
                  ? { ...widget, interaction: { variable: variable.name } }
                  : widget,
              );

        commit({ ...state.config, variables, widgets });
      },

      removeVariable(variableId) {
        const state = get();
        const variable = state.config.variables.find((entry) => entry.id === variableId);
        if (!variable) return;

        commit({
          ...state.config,
          variables: state.config.variables.filter((entry) => entry.id !== variableId),
          widgets: state.config.widgets.map((widget) =>
            widget.interaction?.variable === variable.name
              ? { ...widget, interaction: undefined }
              : widget,
          ),
        });
      },

      setBreakpoint(breakpoint) {
        set({ breakpoint });
      },

      setPreview(preview) {
        set({ preview, selectedWidgetId: preview ? null : get().selectedWidgetId });
      },

      undo() {
        const state = get();
        const previous = state.history[state.history.length - 1];
        if (!previous) return;

        set({
          config: previous,
          history: state.history.slice(0, -1),
          future: [state.config, ...state.future].slice(0, HISTORY_LIMIT),
          notice: null,
          error: null,
        });
        options.onChange?.(previous);
      },

      redo() {
        const state = get();
        const next = state.future[0];
        if (!next) return;

        set({
          config: next,
          history: [...state.history, state.config].slice(-HISTORY_LIMIT),
          future: state.future.slice(1),
          notice: null,
          error: null,
        });
        options.onChange?.(next);
      },

      beginSave() {
        set({ phase: "saving", error: null, notice: null });
      },

      completeSave({ config, revision, updatedAt }) {
        set({
          savedConfig: config,
          revision,
          updatedAt,
          phase: "idle",
          conflict: null,
          notice: "saved",
          error: null,
        });
      },

      beginPublish() {
        set({ phase: "publishing", error: null, notice: null });
      },

      completePublish({ config, revision, publishedAt, publishedRevision }) {
        set({
          config,
          savedConfig: config,
          revision,
          publishedAt,
          publishedRevision,
          phase: "idle",
          conflict: null,
          history: [],
          future: [],
          notice: "published",
          error: null,
        });
      },

      fail(value) {
        set({
          phase: "idle",
          error: typeof value === "string" ? { key: value } : value,
        });
      },

      markConflict(expectedRevision, currentRevision) {
        set({
          phase: "idle",
          conflict: { expectedRevision, currentRevision },
          error: null,
          notice: null,
        });
      },

      dismissConflict() {
        set({ conflict: null });
      },

      discardChanges() {
        const state = get();
        set({
          config: state.savedConfig,
          selectedWidgetId: null,
          history: [],
          future: [],
          conflict: null,
          error: null,
          notice: null,
          preview: false,
        });
        options.onChange?.(state.savedConfig);
      },

      clearNotice() {
        set({ notice: null, error: null });
      },

      /** Adopts an externally advanced revision when no local edits exist. */
      rebase(revision) {
        if (isDirty(get())) return;
        set({ revision });
      },

      setEnvironment(next) {
        environment = next;
      },

      replaceDraft({ config, revision, updatedAt, publishedAt, publishedRevision }) {
        set({
          config,
          savedConfig: config,
          revision,
          updatedAt,
          publishedAt: publishedAt ?? null,
          publishedRevision: publishedRevision ?? null,
          selectedWidgetId: null,
          history: [],
          future: [],
          phase: "idle",
          conflict: null,
          error: null,
          notice: null,
        });
      },
    };
  });
}
