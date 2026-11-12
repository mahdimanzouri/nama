import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  isWidgetVisible,
  resolveDashboardFilters,
  resolveWidgetConfig,
  type ResolvedFilters,
  type WidgetRenderProps,
  type WidgetSelection,
} from "@nama/dashboard-core";
import type { DashboardWidget } from "@nama/dashboard-types";

import { joinClassNames } from "./classnames";
import { useDashboardRuntime } from "./context";
import { WidgetErrorBoundary } from "./error-boundary";
import { useWidgetQuery } from "./widget-query";

function useElementSize(): [
  (element: HTMLDivElement | null) => void,
  { width: number; height: number },
] {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = elementRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [
    (element) => {
      elementRef.current = element;
    },
    size,
  ];
}

interface WidgetFrameProps {
  title: string;
  type: string;
  className?: string;
  children: ReactNode;
}

function WidgetFrame({ title, type, className, children }: WidgetFrameProps) {
  return (
    <article className={joinClassNames("nama-widget", className)} data-widget-type={type}>
      <header className="nama-widget__header">{title}</header>
      {children}
    </article>
  );
}

function WidgetPlaceholder({
  widget,
  message,
  className,
}: {
  widget: DashboardWidget;
  message: string;
  className?: string;
}) {
  return (
    <WidgetFrame title={widget.title} type={widget.type} className={className}>
      <div className="nama-widget__body">
        <p className="nama-widget__placeholder" role="status">
          {message}
        </p>
      </div>
    </WidgetFrame>
  );
}

export interface WidgetRendererProps {
  widget: DashboardWidget;
  className?: string;
  /** The editor keeps hidden widgets on the board while authoring. */
  ignoreVisibility?: boolean;
}

/**
 * Renders one widget by type through the registry. Unknown types, newer config
 * versions and invalid configuration render placeholders; the persisted data is
 * never discarded. Dashboard filters, visibility conditions and interactions
 * resolve against the runtime control values.
 */
export function WidgetRenderer({
  widget,
  className,
  ignoreVisibility = false,
}: WidgetRendererProps) {
  const runtime = useDashboardRuntime();
  const plugin = runtime.registry.get(widget.type);
  const resolved = resolveWidgetConfig(plugin, widget);
  const values = runtime.controls.values;
  const visible = isWidgetVisible(widget, values);
  const data = useWidgetQuery(widget, plugin, visible || ignoreVisibility);
  const [measure, size] = useElementSize();
  const translate = runtime.i18n.translate;

  const filters = useMemo<ResolvedFilters>(() => {
    const entries = resolveDashboardFilters(runtime.config, values).flatMap((filter) =>
      filter.value === undefined ? [] : ([[filter.field, filter.value]] as const),
    );

    return Object.freeze(Object.fromEntries(entries));
  }, [runtime.config, values]);

  const interactionVariable = widget.interaction?.variable;
  const setVariable = runtime.controls.setVariable;
  const onSelect = useMemo(() => {
    if (!interactionVariable) return undefined;
    return (selection: WidgetSelection) => {
      setVariable(interactionVariable, selection.value);
    };
  }, [interactionVariable, setVariable]);

  if (!ignoreVisibility && !visible) return null;

  if (!plugin || resolved.status === "unknownType") {
    return (
      <WidgetPlaceholder
        widget={widget}
        className={className}
        message={translate("widget.unknown", { type: widget.type })}
      />
    );
  }

  if (resolved.status === "unsupportedVersion") {
    return (
      <WidgetPlaceholder
        widget={widget}
        className={className}
        message={translate("widget.unsupportedVersion", {
          type: widget.type,
          version: resolved.fromVersion,
        })}
      />
    );
  }

  if (resolved.status === "invalidConfig") {
    return (
      <WidgetPlaceholder
        widget={widget}
        className={className}
        message={translate("widget.invalidConfig")}
      />
    );
  }

  const Component = plugin.component;
  const renderProps: WidgetRenderProps<never> = {
    widget,
    config: resolved.config as never,
    data,
    locale: runtime.i18n,
    theme: runtime.theme.tokens,
    width: size.width,
    height: size.height,
    filters,
    ...(onSelect ? { onSelect } : {}),
  };

  return (
    <WidgetFrame title={widget.title} type={widget.type} className={className}>
      <div className="nama-widget__body" ref={measure}>
        <WidgetErrorBoundary
          resetKey={`${widget.id}:${widget.type}:${widget.configVersion}`}
          fallback={
            <p className="nama-widget__placeholder" role="alert">
              {translate("widget.error")}
            </p>
          }
        >
          <Component {...renderProps} />
        </WidgetErrorBoundary>
      </div>
    </WidgetFrame>
  );
}
