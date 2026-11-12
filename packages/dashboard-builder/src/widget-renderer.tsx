import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  resolveWidgetConfig,
  type ResolvedFilters,
  type WidgetRenderProps,
} from "@nama/dashboard-core";
import type { DashboardWidget } from "@nama/dashboard-types";

import { useDashboardRuntime } from "./context";
import { WidgetErrorBoundary } from "./error-boundary";
import { useWidgetQuery } from "./widget-query";

const EMPTY_FILTERS: ResolvedFilters = Object.freeze({});

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

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
}

/**
 * Renders one widget by type through the registry. Unknown types, newer config
 * versions and invalid configuration render placeholders; the persisted data is
 * never discarded.
 */
export function WidgetRenderer({ widget, className }: WidgetRendererProps) {
  const runtime = useDashboardRuntime();
  const plugin = runtime.registry.get(widget.type);
  const resolved = resolveWidgetConfig(plugin, widget);
  const data = useWidgetQuery(widget, plugin);
  const [measure, size] = useElementSize();
  const translate = runtime.i18n.translate;

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
    filters: EMPTY_FILTERS,
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
